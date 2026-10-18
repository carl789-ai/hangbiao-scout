import * as db from './db.js';
import {parseSearch,CollectionError} from './core.js';
export async function fetchSearch(item,site,signal,transport=fetch){
 let res;try{res=await transport(`https://www.amazon.${site}/s?k=${encodeURIComponent(item.keyword)}`,{credentials:'include',cache:'no-store',signal});}catch(e){throw new CollectionError(e.name==='AbortError'?'本次请求已中止':'网络连接失败：'+e.message,'network');}
 if([403,429,503].includes(res.status))throw new CollectionError(`Amazon 返回 HTTP ${res.status}，任务已暂停；请检查网页后手动继续。`,'blocked');
 if(!res.ok)throw new CollectionError(`Amazon 返回 HTTP ${res.status}`,'http');
 const destination=new URL(res.url||`https://www.amazon.${site}`);
 if(destination.hostname!==`www.amazon.${site}`)throw new CollectionError('Amazon 跳转至其他域名，请先在浏览器检查。','blocked');
 const reader=res.body?.getReader();let html;
 if(reader){const parts=[];let bytes=0;try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>12*1024*1024){await reader.cancel();throw new CollectionError('搜索页超过12MB，已暂停以控制内存。','size');}parts.push(value);}}finally{reader.releaseLock();}html=await new Blob(parts).text();}
 else html=await res.text();
 return parseSearch(html,item.keyword,site);
}
export class Runner{
 constructor({store=db,fetchItem=fetchSearch,notify=()=>{},rotate=()=>{},settings=()=>({concurrency:3,delayMs:1200}),wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{store,fetchItem,notify,rotate,settings,wait});this.running=false;this.controllers=new Set();}
 stop(){for(const c of this.controllers)c.abort();}
 async run(taskId){if(this.running)return;this.running=true;let requests=0;try{
 await this.store.resetItems(taskId,'working');const task=await this.store.getTask(taskId),opts=await this.settings();
 while((await this.store.getTask(taskId))?.state==='running'){
 const concurrency=Math.max(1,Math.min(5,Number(opts.concurrency)||3));const batch=await this.store.claim(taskId,concurrency);
 if(!batch.length){const s=await this.store.stats(taskId);await this.store.updateTask(taskId,{state:s.failed?'paused':'complete',reason:s.failed?'已完成可采集部分，还有失败项可重试。':''});break;}
 let reason='';const responses=await Promise.allSettled(batch.map(async item=>{
 const controller=new AbortController();this.controllers.add(controller);const timeout=setTimeout(()=>controller.abort(),30000);
 try{const data=await this.fetchItem(item,task.site,controller.signal);await this.store.settle(item,'done',data);}
 catch(e){const current=await this.store.getTask(taskId);if(current?.state!=='running'&&e.kind==='network'){await this.store.settle(item,'pending',null);return;}
 await this.store.settle(item,'failed',null,{kind:e.kind||'unknown',message:e.message,at:Date.now()});reason=reason||e.message;}
 finally{clearTimeout(timeout);this.controllers.delete(controller);}
 }));
 const fatal=responses.find(r=>r.status==='rejected');if(fatal)throw fatal.reason;
 requests+=batch.length;this.notify(taskId);
 if(reason){await this.store.updateTask(taskId,{state:'paused',reason});break;}
 if((await this.store.getTask(taskId))?.state!=='running')break;
 if(requests>=500||(performance.memory?.usedJSHeapSize||0)>256*1024*1024){await this.store.setMeta('rotateTask',taskId);this.rotate(taskId);return;}
 await this.wait(Math.max(500,Math.min(30000,Number(opts.delayMs)||1200)));
 }
 }catch(e){await this.store.updateTask(taskId,{state:'paused',reason:'采集已停止：'+e.message}).catch(()=>{});}
 finally{this.running=false;this.notify(taskId);}
 }
}
