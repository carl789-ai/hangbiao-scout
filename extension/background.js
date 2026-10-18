import * as db from './db.js';
let gate=Promise.resolve();
async function offscreen(){if(!await chrome.offscreen.hasDocument())await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['DOM_PARSER'],justification:'逐批解析 Amazon 搜索 HTML，并逐条写入本地任务数据库，避免在界面保留页面文本。'});}
function locked(fn){const next=gate.then(fn);gate=next.catch(()=>{});return next;}
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:chrome.runtime.getURL('index.html')}));
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('')))return;
 if(message.target==='offscreen')return;
 const work=async()=>{
 if(message.type==='getCollectionSettings')return {ok:true,settings:(await chrome.storage.local.get('collection')).collection||{}};
 if(message.type==='start'){return locked(async()=>{if(await chrome.offscreen.hasDocument())throw new Error('采集执行器正在工作，请等待暂停或轮换完成。');await db.resetItems(message.taskId,'failed');await db.prepareRun(message.taskId);try{await offscreen();chrome.power.requestKeepAwake('system');return {ok:true};}catch(e){await db.updateTask(message.taskId,{state:'paused',reason:e.message});throw e;}});}
 if(message.type==='pause'){await db.updateTask(message.taskId,{state:'paused',reason:'已手动暂停，采集结果已保存。'});await chrome.runtime.sendMessage({target:'offscreen',type:'stop'}).catch(()=>{});return {ok:true};}
 if(message.type==='rotate'){return locked(async()=>{await chrome.offscreen.closeDocument();await offscreen();return {ok:true};});}
 if(message.type==='runnerStopped'){return locked(async()=>{if(await chrome.offscreen.hasDocument())await chrome.offscreen.closeDocument();chrome.power.releaseKeepAwake();return {ok:true};});}
 if(message.type==='capture'){const tabs=await chrome.tabs.query({url:Object.keys((await import('./core.js')).SITES).map(s=>`https://www.amazon.${s}/*`)});const tab=tabs.find(t=>t.active)||tabs[0];if(!tab)throw new Error('请先打开一个 Amazon 搜索页。');const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({html:document.documentElement.outerHTML,url:location.href})});return {ok:true,...result};}
 return {ok:true};
 };work().then(respond,e=>respond({ok:false,error:e.message}));return true;
});
chrome.alarms.create('watchdog',{periodInMinutes:1});
async function recover(){const all=await db.tasks();if(!await chrome.offscreen.hasDocument()){for(const task of all.filter(t=>t.state==='running'))await db.updateTask(task.id,{state:'paused',reason:'浏览器或执行器中断，已保存结果。点击继续可恢复未完成项。'});chrome.power.releaseKeepAwake();}}
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='watchdog')recover().catch(console.error);});
chrome.runtime.onStartup.addListener(()=>recover().catch(console.error));

chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(console.error);
