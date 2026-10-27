import {norm,summary,keywordOf,SITES,PARSER_VERSION} from './core.js';
const request = req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
let dbPromise;
export function openDB(){return dbPromise??=new Promise((res,rej)=>{const req=indexedDB.open('hangbiao-v2',2);req.onupgradeneeded=e=>{const db=req.result;if(e.oldVersion<1){db.createObjectStore('tasks',{keyPath:'id'});const items=db.createObjectStore('items',{keyPath:['taskId','key']});items.createIndex('task','taskId');items.createIndex('status',['taskId','status']);items.createIndex('outcome',['taskId','data.outcome']);const rows=db.createObjectStore('rows',{keyPath:['taskId','id']});rows.createIndex('task','taskId');db.createObjectStore('meta',{keyPath:'key'});}req.transaction.objectStore('items').createIndex('parser',['taskId','data.outcome','data.parserVersion']);};req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});}
export async function tx(names,mode,fn){const db=await openDB(),t=db.transaction(names,mode);const done=new Promise((res,rej)=>{t.oncomplete=res;t.onabort=()=>rej(t.error||new Error('存储事务中断'));t.onerror=()=>{};});try{const value=await fn(Object.fromEntries(names.map(n=>[n,t.objectStore(n)])));await done;return value;}catch(e){try{t.abort();}catch{}await done.catch(()=>{});throw e;}}
export const getTask=id=>tx(['tasks'],'readonly',s=>request(s.tasks.get(id)));
export const tasks=()=>tx(['tasks'],'readonly',s=>request(s.tasks.getAll()));
export const setMeta=(key,value)=>tx(['meta'],'readwrite',s=>request(s.meta.put({key,value})));
export const getMeta=key=>tx(['meta'],'readonly',async s=>(await request(s.meta.get(key)))?.value);
export async function updateTask(id,patch){return tx(['tasks'],'readwrite',async s=>{const t=await request(s.tasks.get(id));if(!t)throw new Error('任务不存在');Object.assign(t,patch,{updatedAt:Date.now()});await request(s.tasks.put(t));return t;});}
export async function createTask(name,site='com'){if(!SITES[site])throw new Error('不支持的站点');const task={id:crypto.randomUUID(),name:name||'未命名任务',site,state:'importing',reason:'',createdAt:Date.now(),updatedAt:Date.now(),inputRows:0,sources:[]};await tx(['tasks'],'readwrite',s=>request(s.tasks.add(task)));return task;}
export async function appendRows(taskId,rows,source){
 return tx(['tasks','rows','items'],'readwrite',async s=>{const t=await request(s.tasks.get(taskId));if(!t||t.state!=='importing')throw new Error('此任务不在导入状态');let added=0;
 for(const original of rows){const keyword=keywordOf(original);if(!keyword)continue;const key=norm(keyword);if(keyword.length>1000)throw new Error('关键词过长');const id=t.inputRows++;
 await request(s.rows.put({taskId,id,key,keyword,source,original}));
 const existing=await request(s.items.get([taskId,key]));if(!existing)await request(s.items.add({taskId,key,keyword,status:'pending',attempts:0,data:null,error:null}));added++;}
 if(!t.sources.includes(source))t.sources.push(source);await request(s.tasks.put(t));return added;});
}
export async function stats(taskId){return tx(['items'],'readonly',async s=>{
 const [total,completed,failed,working,redirect,currentParser]=await Promise.all([request(s.items.index('task').count(taskId)),request(s.items.index('status').count([taskId,'done'])),request(s.items.index('status').count([taskId,'failed'])),request(s.items.index('status').count([taskId,'working'])),request(s.items.index('outcome').count([taskId,'non_search_redirect'])),request(s.items.index('parser').count([taskId,'search',PARSER_VERSION]))]);
 return {total,completed,failed,working,redirect,outdated:Math.max(0,completed-redirect-currentParser),search:completed-redirect,pending:total-completed,untouched:total-completed-failed-working};});}
export async function pageItems(taskId,{page=1,size=100,query='',status='',source='',minBlue='',minRatio='',sort='keyword'}={}){
 return tx(['items','rows'],'readonly',async s=>{let keys;if(source){keys=new Set();await new Promise((res,rej)=>{const q=s.rows.index('task').openCursor(IDBKeyRange.only(taskId));q.onerror=()=>rej(q.error);q.onsuccess=()=>{const c=q.result;if(!c)return res();if(c.value.source===source)keys.add(c.value.key);c.continue();};});}
 const matches=[];const qtext=norm(query);await new Promise((res,rej)=>{const q=s.items.index('task').openCursor(IDBKeyRange.only(taskId));q.onerror=()=>rej(q.error);q.onsuccess=()=>{const c=q.result;if(!c)return res();const v=c.value,d=v.data;const pass=(!qtext||norm(v.keyword).includes(qtext))&&(!status||v.status===status)&&(!keys||keys.has(v.key))&&(minBlue===''||(d?.lowReviewItemsCount!=null&&d.lowReviewItemsCount>=Number(minBlue)))&&(minRatio===''||(d?.homeBlueSeaRatio!=null&&d.homeBlueSeaRatio*100>=Number(minRatio)));if(pass)matches.push({key:v.key,keyword:v.keyword,status:v.status,error:v.error,data:d?{...d,products:undefined}:null});c.continue();};});
 if(sort!=='keyword')matches.sort((a,b)=>((b.data?.[sort]??-Infinity)-(a.data?.[sort]??-Infinity))||a.keyword.localeCompare(b.keyword));
 const total=matches.length,pages=Math.max(1,Math.ceil(total/size)),actual=Math.min(pages,Math.max(1,page));return {items:matches.slice((actual-1)*size,actual*size),total,pages,page:actual};});
}
export const getItem=(taskId,key)=>tx(['items'],'readonly',s=>request(s.items.get([taskId,key])));
export async function * chunks(store,taskId,size=250){let last;for(;;){const values=await tx([store],'readonly',s=>new Promise((res,rej)=>{const values=[],q=s[store].openCursor(last?IDBKeyRange.lowerBound(last,true):IDBKeyRange.lowerBound([taskId]));q.onerror=()=>rej(q.error);q.onsuccess=()=>{const c=q.result;if(!c||c.value.taskId!==taskId||values.length>=size)return res(values);values.push(c.value);last=c.primaryKey;c.continue();};}));if(!values.length)break;yield values;}}
export async function claim(taskId,limit){return tx(['items'],'readwrite',async s=>{const out=[];await new Promise((res,rej)=>{const q=s.items.index('status').openCursor(IDBKeyRange.only([taskId,'pending']));q.onerror=()=>rej(q.error);q.onsuccess=()=>{const c=q.result;if(!c||out.length>=limit)return res();const item={...c.value,status:'working',attempts:c.value.attempts+1};c.update(item);out.push(item);c.continue();};});return out;});}
export async function settle(item,status,data,error=null){return tx(['items'],'readwrite',async s=>{const current=await request(s.items.get([item.taskId,item.key]));if(current?.status==='done')return;await request(s.items.put({...current,status,data,error,savedAt:Date.now()}));});}
export async function resetItems(taskId,status){return tx(['items'],'readwrite',s=>new Promise((res,rej)=>{const q=s.items.index('status').openCursor(IDBKeyRange.only([taskId,status]));q.onerror=()=>rej(q.error);q.onsuccess=()=>{const c=q.result;if(!c)return res();c.update({...c.value,status:'pending',error:null});c.continue();};}));}
export async function prepareRun(taskId){return tx(['tasks'],'readwrite',async s=>{const all=await request(s.tasks.getAll());if(all.some(t=>t.id!==taskId&&t.state==='running'))throw new Error('另一个任务正在采集，请先暂停。');const task=all.find(t=>t.id===taskId);if(!task||task.state==='importing')throw new Error('任务尚未导入完成');task.state='running';task.reason='';await request(s.tasks.put(task));return task;});}
export async function restoreBackup(backup){
 if(backup?.format!=='hangbiao-task-v2'||!Array.isArray(backup.items)||!Array.isArray(backup.rows)||backup.items.length>100000||backup.rows.length>200000)throw new Error('不是有效的航标任务备份');
 const validStatuses=new Set(['done','pending','failed','working']), keys=new Set();
 for(const item of backup.items){if(!item.keyword||item.key!==norm(item.keyword)||keys.has(item.key)||!validStatuses.has(item.status))throw new Error('备份关键词或状态无效');keys.add(item.key);if(item.status==='done'&&(!item.data||!['search','non_search_redirect'].includes(item.data.outcome)))throw new Error('备份结果不完整');}
 if(backup.rows.some(row=>!keys.has(row.key)||norm(row.keyword)!==row.key||!row.original||typeof row.original!=='object'))throw new Error('备份原始行无效');
 const task=await createTask((backup.task?.name||'恢复任务')+' · 恢复',backup.task?.site||'com');
 await tx(['tasks','rows','items'],'readwrite',async s=>{for(const i of backup.items)await request(s.items.put({...i,taskId:task.id,status:i.status==='working'?'pending':i.status}));let idx=0;for(const row of backup.rows)await request(s.rows.put({...row,id:idx++,taskId:task.id}));await request(s.tasks.put({...task,state:'paused',inputRows:idx,sources:[...new Set(backup.rows.map(r=>r.source))],reason:'备份已恢复，点击继续只采未完成项。'}));});return task;
}

// Make a separate task; never rewrite successful legacy data or original rows.
export async function recollectCopy(taskId){
 const source=await getTask(taskId);if(!source||['running','importing'].includes(source.state))throw new Error('请先暂停任务，再建立重采副本。');
 const task=await createTask(source.name+' · 重新采集',source.site);
 try{for await(const rows of chunks('rows',taskId)){let batch=[],sourceName;for(const row of rows){if(batch.length&&row.source!==sourceName){await appendRows(task.id,batch,sourceName);batch=[];}sourceName=row.source;batch.push(row.original);}if(batch.length)await appendRows(task.id,batch,sourceName);}await updateTask(task.id,{state:'ready',recollectsTaskId:taskId,reason:'已保留旧任务。此副本将使用新版解析重新采集全部关键词。'});return task;}
 catch(e){await updateTask(task.id,{state:'paused',reason:'重采副本建立中断：'+e.message});throw e;}
}
