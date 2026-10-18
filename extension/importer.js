import {unzipSync,strFromU8} from './vendor/fflate.js';
import {parseCSV,keywordOf} from './core.js';
const xml=s=>new DOMParser().parseFromString(s,'text/xml');
export async function readInput(file){
 if(file.size>35*1024*1024)throw new Error('单文件超过35MB，请拆分后导入。');
 if(/\.xlsx$/i.test(file.name)){
 let unpacked=0;const z=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:f=>{const keep=/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(f.name);if(keep){unpacked+=f.originalSize;if(unpacked>128*1024*1024||f.originalSize>64*1024*1024)throw new Error('工作簿展开过大，请拆分文件。');}return keep;}});
 const strings=z['xl/sharedStrings.xml']?Array.from(xml(strFromU8(z['xl/sharedStrings.xml'])).getElementsByTagName('si')).map(s=>Array.from(s.getElementsByTagName('t')).map(t=>t.textContent).join('')):[];
 const result=[];
 for(const path of Object.keys(z).filter(p=>/^xl\/worksheets\//.test(p)).sort()){
 const doc=xml(strFromU8(z[path]));let headers;
 for(const row of doc.getElementsByTagName('row')){const values=[];for(const c of row.getElementsByTagName('c')){const col=(c.getAttribute('r')||'A').match(/[A-Z]+/)?.[0]||'A';let pos=0;for(const char of col)pos=pos*26+char.charCodeAt(0)-64;
 const value=c.getElementsByTagName('v')[0]?.textContent||'';const type=c.getAttribute('t');values[pos-1]=type==='s'?(strings[Number(value)]??''):type==='inlineStr'?Array.from(c.getElementsByTagName('t')).map(t=>t.textContent).join(''):value;}
 if(!headers){const possible=Array.from({length:values.length},(_,i)=>values[i]||`列${i+1}`);if(!keywordOf(Object.fromEntries(possible.map(h=>[h,'test']))))continue;if(new Set(possible).size!==possible.length)throw new Error('表头有重复列名，请先区分。');headers=possible;continue;}
 const obj=Object.fromEntries(headers.map((h,i)=>[h,values[i]??'']));if(keywordOf(obj))result.push(obj);}
 }
 if(!result.length)throw new Error('未找到关键词列。支持“搜索词”“关键词”“Search Term”“Keyword”等表头。');return result;
 }
 const text=await file.text();
 if(/\.txt$/i.test(file.name))return text.split(/\r?\n/).filter(s=>s.trim()).map(s=>({'关键词':s.trim()}));
 if(/\.(csv|tsv)$/i.test(file.name)){const rows=parseCSV(text);if(rows.length&&!keywordOf(rows[0]))throw new Error('没有识别到关键词列，请使用“关键词”或“Search Term”表头。');return rows;}
 throw new Error('支持 XLSX、CSV、TSV、TXT。JSON 文件请从“恢复任务备份”导入。');
}
