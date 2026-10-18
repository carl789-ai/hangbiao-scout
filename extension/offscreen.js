import * as db from './db.js';import {Runner} from './runner.js';
let rotating=false;
const runner=new Runner({settings:async()=>{const r=await chrome.runtime.sendMessage({type:'getCollectionSettings'});if(!r?.ok)throw new Error(r?.error||'无法读取采集设置');return r.settings;},notify:()=>{},rotate:()=>{rotating=true;setTimeout(()=>chrome.runtime.sendMessage({type:'rotate'}).catch(console.error),0);}});
chrome.runtime.onMessage.addListener(m=>{if(m.target==='offscreen'&&m.type==='stop')runner.stop();});
const task=(await db.tasks()).find(t=>t.state==='running');
if(task)await runner.run(task.id);
if(!rotating)await chrome.runtime.sendMessage({type:'runnerStopped'});
