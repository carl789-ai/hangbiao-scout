import * as db from './db.js';
import {parseSearch,CollectionError} from './core.js';
import {runKeywordBatch} from './ai.js';
export async function fetchSearch(item,site,signal,transport=fetch){
 let res;try{res=await transport(`https://www.amazon.${site}/s?k=${encodeURIComponent(item.keyword)}`,{credentials:'include',cache:'no-store',signal});}catch(e){throw new CollectionError(e.name==='AbortError'?'本次请求已中止':'网络连接失败：'+e.message,'network');}
 if([403,429,503].includes(res.status))throw new CollectionError(`Amazon 返回 HTTP ${res.status}`,'blocked');
 if(!res.ok)throw new CollectionError(`Amazon 返回 HTTP ${res.status}`,'http');
 const destination=new URL(res.url||`https://www.amazon.${site}`);
 if(destination.hostname!==`www.amazon.${site}`)throw new CollectionError('Amazon 跳转至其他域名','blocked');
 const reader=res.body?.getReader();let html;
 if(reader){const parts=[];let bytes=0;try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>12*1024*1024){await reader.cancel();throw new CollectionError('搜索页超过12MB','size');}parts.push(value);}}finally{reader.releaseLock();}html=await new Blob(parts).text();}else html=await res.text();
 return parseSearch(html,item.keyword,site);
}
export class Runner{
 constructor({store=db,fetchItem=fetchSearch,analyzeBatch=runKeywordBatch,aiConfig=async()=>(await chrome.storage.local.get('ai')).ai||{},notify=()=>{},rotate=()=>{},settings=()=>({concurrency:3,delayMs:1200}),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{store,fetchItem,analyzeBatch,aiConfig,notify,rotate,settings,wait});this.running=false;this.controllers=new Set();}
 stop(){for(const c of this.controllers)c.abort();}
 async aiBatch(task,after,keys){
 const template=task.aiOptions?.template||'keyword',items=await this.store.claimAnalysis(task.id,template,task.workflow,5,after,keys);if(!items.length)return null;
 const controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),120000);
 try{const originals=await this.store.originalsForKeys(task.id,items.map(i=>i.key)),config=await this.aiConfig();const parsed=await this.analyzeBatch({items,task,config,originals,signal:controller.signal});
 for(const {key,result}of parsed.results)await this.store.saveAnalysis(task.id,key,template,{state:'done',result,model:config.model,error:null});
 if(parsed.missing.length){for(const i of parsed.missing)await this.store.saveAnalysis(task.id,i.key,template,{state:'failed',error:parsed.issues[0]||'本批次模型漏回结果'});throw new Error(parsed.issues[0]||`模型返回不完整，已保存 ${parsed.results.length} 条，可继续补齐其余项`);}
 return items.at(-1).key;
 }catch(e){for(const i of items){const saved=await this.store.getItem(task.id,i.key);if(saved.analysis?.[template]?.state!=='done')await this.store.saveAnalysis(task.id,i.key,template,{state:'failed',error:e.name==='AbortError'?'分析已停止':e.message});}throw e;}
 finally{clearTimeout(timer);this.controllers.delete(controller);}
 }
 async run(taskId){if(this.running)return;this.running=true;let requests=0,aiAfter;try{
 await this.store.resetItems(taskId,'working');const task=await this.store.getTask(taskId),opts=await this.settings(),withAi=['ai','full'].includes(task.workflow);
 while((await this.store.getTask(taskId))?.state==='running'){
 if(withAi){const after=await this.aiBatch(task,aiAfter);if(after){aiAfter=after;await this.store.updateTask(taskId,{});this.notify(taskId);continue;}}
 if(task.workflow==='ai'){await this.store.updateTask(taskId,{state:'complete',reason:'',issue:null});break;}
 const batch=await this.store.claim(taskId,Math.max(1,Math.min(5,Number(opts.concurrency)||3)));
 if(!batch.length){const s=await this.store.stats(taskId);await this.store.updateTask(taskId,{state:s.failed?'paused':'complete',reason:s.failed?'还有失败项，点击继续重试。':'',issue:null});break;}
 let issue;const responses=await Promise.allSettled(batch.map(async item=>{
 const controller=new AbortController();this.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),30000);
 try{const data=await this.fetchItem(item,task.site,controller.signal);await this.store.settle(item,'done',data);}
 catch(e){const current=await this.store.getTask(taskId);if(current?.state!=='running'&&e.kind==='network'){await this.store.settle(item,'pending',null);return;}
 await this.store.settle(item,'failed',null,{kind:e.kind||'unknown',message:e.message,at:Date.now()});issue=issue||{kind:e.kind||'unknown',message:e.message,keyword:item.keyword,url:`https://www.amazon.${task.site}/s?k=${encodeURIComponent(item.keyword)}`};}
 finally{clearTimeout(timeout);this.controllers.delete(controller);}
 }));
 const fatal=responses.find(r=>r.status==='rejected');if(fatal)throw fatal.reason;
 requests+=batch.length;this.notify(taskId);
 if(issue){await this.store.updateTask(taskId,{state:'paused',reason:issue.message,issue});break;}
 if((await this.store.getTask(taskId))?.state!=='running')break;
 if(withAi){await this.aiBatch(task,undefined,batch.map(i=>i.key));await this.store.updateTask(taskId,{});}
 if(requests>=500||(performance.memory?.usedJSHeapSize||0)>256*1024*1024){await this.store.setMeta('rotateTask',taskId);this.rotate(taskId);return;}
 await this.wait(Math.max(500,Math.min(30000,Number(opts.delayMs)||1200)));
 }
 }catch(e){await this.store.updateTask(taskId,{state:'paused',reason:e.message,issue:{kind:'ai',message:e.message}}).catch(()=>{});}
 finally{this.running=false;this.notify(taskId);}
 }
}
