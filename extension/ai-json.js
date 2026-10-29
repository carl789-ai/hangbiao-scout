// Extract containers without changing any model-supplied values or completing strings.
function containerEnd(text,start){
 const stack=[];let quoted=false,escaped=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='{'||c==='[')stack.push(c);
  else if(c==='}'||c===']'){
   if(stack.pop()!==(c==='}'?'{':'['))return -1;
   if(!stack.length)return i+1;
  }
 }
 return -1;
}
const isRows=value=>Array.isArray(value)||Array.isArray(value?.selected_keywords)||Array.isArray(value?.results);
function completeArrayRows(text){
 const wrapper=text.match(/^\{\s*"(?:selected_keywords|results)"\s*:\s*/);
 const array=wrapper?text.slice(wrapper[0].length):text;
 if(array[0]!=='[')return [];
 const rows=[];let pos=1;
 while(pos<array.length){
  while(/\s/.test(array[pos]||'')&&pos<array.length)pos++;
  if(array[pos]!=='{')break;
  const end=containerEnd(array,pos);if(end<0)break;
  try{rows.push(JSON.parse(array.slice(pos,end)));}catch{break;}
  pos=end;while(/\s/.test(array[pos]||'')&&pos<array.length)pos++;
  if(array[pos]!==',')break;
  pos++;
 }
 return rows;
}
export function readKeywordJson(text,{finishReason}={}){
 if(typeof text!=='string')throw new Error('模型没有返回可解析的 JSON 文本');
 const content=text.replace(/^\uFEFF/,'').trim();
 try{return {value:JSON.parse(content),partial:false};}catch{}
 // Prefer a complete, valid JSON container surrounded by prose or Markdown.
 let partial=[];
 for(let start=0;start<content.length;start++){
  if(content[start]!=='{'&&content[start]!=='[')continue;
  const end=containerEnd(content,start);
  if(end>start){
   try{const value=JSON.parse(content.slice(start,end));if(isRows(value))return {value,partial:false};}catch{}
   start=end-1;continue;
  }
  // Only exact, complete records from the leading array are eligible for recovery.
  partial=completeArrayRows(content.slice(start));break;
 }
 const error=finishReason==='length'?'模型输出达到长度上限，JSON 被截断；点击继续将逐词补齐未完成项':'模型返回的 JSON 格式不完整或不正确；点击继续将逐词重试未完成项';
 if(partial.length)return {value:partial,partial:true,error};
 throw new Error(error);
}
