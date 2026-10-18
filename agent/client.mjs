import {readFile} from 'node:fs/promises';
const [file]=process.argv.slice(2);if(!file||!process.env.HANGBIAO_TOKEN){console.error('用法：设置 HANGBIAO_TOKEN 后，node agent/client.mjs 请求.json');process.exit(1);}
const url=process.env.HANGBIAO_URL||'http://127.0.0.1:43129',headers={Authorization:'Bearer '+process.env.HANGBIAO_TOKEN,'Content-Type':'application/json'};
const r=await fetch(url+'/commands',{method:'POST',headers,body:await readFile(file,'utf8')});if(!r.ok)throw new Error('请求失败 '+r.status);const {id}=await r.json();
for(let n=0;n<120;n++){const response=await fetch(url+'/commands/'+id,{headers});if(!response.ok)throw new Error('读取状态失败 '+response.status);const item=await response.json();if(item.state==='done'){console.log(JSON.stringify(item.response,null,2));process.exit(item.response.ok?0:1);}await new Promise(r=>setTimeout(r,1000));}throw new Error('工作台未在120秒内完成请求；请求ID：'+id);
