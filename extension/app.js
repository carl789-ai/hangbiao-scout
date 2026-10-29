import {keywordContract,contractExample,promptExamples} from './keyword-contract.js';
import {saveTemplate,removeTemplate,taskTemplate,ensureProtectedTemplate,PROTECTED_TEMPLATE_ID} from './template-library.js';
import {resolveProfitSettings,validProfitSettings} from './profit/settings.js';
import {FILTER_RANGES,filterErrors} from './filtering.js';
import * as db from './db.js';import {readInput} from './importer.js';import {SITES,endpointUrl,norm,PARSER_VERSION} from './core.js';import * as exp from './exporter.js';import {templates,testConnection} from './ai.js';import {keywordRow,keywordAnalysisRow,analysisCard,node} from './research-view.js';import {initProfitTool} from './profit-tool.js';import {renderSamples,sampleCsv} from './sample-view.js';
const UI_FILTER_RANGES=FILTER_RANGES.filter(r=>r.key!=='overall_score');
const $=id=>document.getElementById(id),fmt=(n,d=0)=>n==null?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
let selectedSample=null;
let taskBusy=false;
let current='',page=1,lastPage=1,refreshing=false,importing=false,lastStats='',refreshQueued=false;
const stateLabels={paused:'已暂停 · 数据已保存',running:'正在采集 · 逐条保存',complete:'本次采集完成',ready:'准备就绪',importing:'导入尚未完成'};
function notify(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':'';$('notice').hidden=false;const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(dialog){let note=dialog.querySelector('.modal-notice');if(!note){note=node('p');note.setAttribute('role','status');dialog.querySelector('.dialog-heading').after(note);}note.textContent=text;note.className='modal-notice'+(error?' error':'');note.hidden=false;}clearTimeout(notify.timer);if(!error)notify.timer=setTimeout(()=>{$('notice').hidden=true;for(const n of document.querySelectorAll('.modal-notice'))n.hidden=true;},6500);}
function guarded(fn){return async e=>{try{await fn(e);}catch(err){notify(err.message||String(err),true);}};}
function bind(id,event,fn){$(id).addEventListener(event,guarded(fn));}
function showWorkspace(){history.replaceState(null,'','#workspace');}
function openSettings(){if(!$('settingsDialog').open)$('settingsDialog').showModal();}
bind('openSettings','click',openSettings);bind('closeSettings','click',()=>$('settingsDialog').close());
bind('help','click',()=>$('helpDialog').showModal());bind('closeHelp','click',()=>$('helpDialog').close());
async function message(data){const r=await chrome.runtime.sendMessage(data);if(!r?.ok)throw new Error(r?.error||'未收到插件后台响应，请重新加载插件。');return r;}
async function loadTasks(id=current){page=1;$('sourceFilter').value='';const list=(await db.tasks()).sort((a,b)=>b.createdAt-a.createdAt);$('taskSelect').replaceChildren();if(!list.length){const o=new Option('还没有任务','');$('taskSelect').append(o);}for(const task of list)$('taskSelect').append(new Option(task.name,task.id));current=list.some(t=>t.id===id)?id:list[0]?.id||'';$('taskSelect').value=current;$('taskSelect').disabled=!list.length||taskBusy;$('taskCount').textContent=list.length+' 个本机任务';await chrome.storage.local.set({lastTask:current});lastStats='';await refresh();}
function filters(){return {page,size:100,query:$('query').value,status:$('statusFilter').value,source:$('sourceFilter').value,sort:$('sort').value,sortDirection:$('sortDirection').value,aiState:$('aiStatusFilter').value,...Object.fromEntries(UI_FILTER_RANGES.flatMap(r=>[[r.min,$(r.min).value],[r.max,$(r.max).value]]))};}
function updateFilterSummary(){
 const options=filters(),host=$('activeFilters');host.replaceChildren();
 const chip=(label,ids)=>{const b=node('button',label+' ×','filter-chip');b.type='button';b.onclick=guarded(async()=>{for(const id of ids)$(id).value='';page=1;await refresh();});host.append(b);};
 if(options.query)chip('关键词：'+options.query,['query']);if(options.source)chip(options.source,['sourceFilter']);if(options.status)chip($('statusFilter').selectedOptions[0].textContent,['statusFilter']);if(options.aiState)chip($('aiStatusFilter').selectedOptions[0].textContent,['aiStatusFilter']);
 for(const r of UI_FILTER_RANGES)if(options[r.min]!==''||options[r.max]!=='')chip(r.label+' '+(options[r.min]||'不限')+'–'+(options[r.max]||'不限')+(r.unit||''),[r.min,r.max]);
 $('resetFilters').disabled=!host.children.length;$('filterCount').textContent=host.children.length?host.children.length+' 项已启用':'未设置';$('filterPanel').classList.toggle('has-filters',!!host.children.length);$('filterError').hidden=true;
 for(const th of document.querySelectorAll('th[data-sort-column]'))th.setAttribute('aria-sort',th.dataset.sortColumn===options.sort?(options.sortDirection==='asc'?'ascending':'descending'):'none');
}
async function refresh(force=true){if(importing)return;if(refreshing){if(force)refreshQueued=true;return;}refreshing=true;try{
 const task=current?await db.getTask(current):null,s=task?await db.stats(current):{total:0,completed:0,pending:0,failed:0,search:0,redirect:0};
 const signature=JSON.stringify([current,s,task?.state,task?.reason,task?.updatedAt,filters()]);if(!force&&signature===lastStats)return;lastStats=signature;
 $('taskSelect').disabled=!task||taskBusy;$('newTask').disabled=taskBusy;$('restore').disabled=taskBusy;$('renameTask').disabled=!task||taskBusy||task.state==='importing';$('deleteTask').disabled=!task||taskBusy||['running','importing'].includes(task.state);$('deleteTask').title=task?.state==='running'?'请先暂停任务再删除':'删除当前任务';$('taskName').textContent=task?.name||'从一份关键词清单开始';$('taskState').textContent=stateLabels[task?.state]||'等待导入';if(task?.workflow==='ai'&&task.state==='running')$('taskState').textContent='正在分析 · 逐条保存';if(task?.workflow==='ai'&&task.state==='complete')$('taskState').textContent='本次分析完成';$('taskMeta').textContent=task?`${SITES[task.site]}站 · ${fmt(task.inputRows)} 条原始行 · ${task.sources.length} 个来源`:'支持多份 ABA 表，原始行与来源分别保留。';
 $('completed').textContent=fmt(s.completed);$('pending').textContent=fmt(s.pending);$('failed').textContent=fmt(s.failed);$('total').textContent=`共 ${fmt(s.total)} 个唯一关键词`;$('percent').replaceChildren(document.createTextNode(s.total?(s.completed/s.total*100).toFixed(1):'0'),Object.assign(document.createElement('span'),{textContent:'%'}));$('outcomes').textContent=`搜索 ${fmt(s.search)} · 跳转 ${fmt(s.redirect)}`;
 $('progressFill').style.width=(s.total?s.completed/s.total*100:0)+'%';$('failedFill').style.width=(s.total?s.failed/s.total*100:0)+'%';document.querySelector('.progress-track').setAttribute('aria-valuenow',String(s.total?s.completed/s.total*100:0));
 $('start').disabled=!task||task.state==='running'||task.state==='importing'||s.pending===0;$('start').textContent=s.completed||s.failed?'继续未完成项':'开始采集';$('pause').disabled=task?.state!=='running';
 $('legacyWarning').hidden=!s.outdated;$('legacyText').textContent=`${fmt(s.outdated)} 个词使用旧版解析，评论与蓝海指标需重新核验。建立副本后重新采集，旧任务和原始行会保留。`;$('recollect').disabled=!task||['running','importing'].includes(task.state);
 $('pausedReason').hidden=!task?.reason;const readableReason=/Cannot read properties of undefined.*local/.test(task?.reason||'')?'上次执行器读取配置中断，已完成数据已保存。更新后可继续未完成项。':/signal.*abort|aborted without/i.test(task?.reason||'')?'上次请求已中断，已完成数据已保存。点击继续可重试未完成项。':task?.reason||'';$('pausedReason').textContent=task?.issue?.kind==='ai'?'AI 分析已暂停：'+readableReason:readableReason;$('recoveryActions').hidden=!task?.issue?.url;if(task?.issue?.url)$('checkAmazon').href=task.issue.url;const withAi=['ai','full'].includes(task?.workflow);$('aiEnabled').checked=withAi;$('aiEnabled').disabled=!task||task.state==='importing';$('aiEnabledLabel').textContent=withAi?'已开启':'关闭';$('aiOptionsPanel').hidden=!withAi;$('aiProgress').hidden=!withAi;const as=task?await db.analysisStats(current,task.aiOptions?.template||'keyword',task.workflow||'full'):null;if(as){$('aiCompleted').textContent=fmt(as.completed);$('aiPending').textContent=fmt(as.pending);$('aiScope').textContent=task.workflow==='full'?'采集完成后逐批分析':'导入数据分析';$('aiTaskSummary').textContent=`${task.name} · 已分析 ${fmt(as.completed)} / ${fmt(as.total)} · 待补齐 ${fmt(as.pending)}`;}if(withAi){$('start').disabled=task.state==='running'||(task.workflow==='ai'?!as?.pending:s.pending===0&&!as?.pending);$('start').textContent=task.workflow==='ai'?(as?.completed?'继续未完成分析':'开始分析'):(s.completed||as?.completed?'继续未完成项':'开始采集与分析');}for(const id of ['exportHtml','exportCsv'])$(id).disabled=!s.completed&&!as?.completed;for(const id of ['exportRemaining','exportBackup'])$(id).disabled=!s.total;
 $('exportHtml').textContent=task?.workflow==='ai'?'下载分析结果 HTML':'下载已采集 HTML';const metricLabels=document.querySelectorAll('.metric>span');metricLabels[0].textContent=task?.workflow==='ai'?'已分析':'已采集';metricLabels[1].textContent=task?.workflow==='ai'?'待分析':'待采集';metricLabels[2].textContent=task?.workflow==='ai'?'分析待重试':'待重试';metricLabels[3].textContent=task?.workflow==='ai'?'分析进度':'采集进度';if(task?.workflow==='ai'&&as){$('completed').textContent=fmt(as.completed);$('pending').textContent=fmt(as.pending);$('failed').textContent=fmt(as.failed);$('percent').textContent=(as.total?(as.completed/as.total*100).toFixed(1):'0')+'%';$('progressFill').style.width=(as.total?as.completed/as.total*100:0)+'%';$('failedFill').style.width=(as.total?as.failed/as.total*100:0)+'%';$('outcomes').textContent='仅分析导入数据';document.querySelector('.progress-track').setAttribute('aria-valuenow',String(as.total?as.completed/as.total*100:0));}const oldSource=$('sourceFilter').value;$('sourceFilter').replaceChildren(new Option('全部来源',''));for(const source of task?.sources||[])$('sourceFilter').append(new Option(source,source));$('sourceFilter').value=oldSource;
 if(task)await renderRows();else{$('resultRows').replaceChildren();$('empty').hidden=false;}
 }finally{refreshing=false;if(refreshQueued){refreshQueued=false;queueMicrotask(()=>refresh().catch(e=>notify(e.message,true)));}}}
async function renderRows(){const errors=filterErrors(filters());if(!$('resultFilters').checkValidity()||errors.length){$('filterError').textContent=errors[0]||'请输入有效的筛选数值';$('filterError').hidden=false;return;}const task=await db.getTask(current),result=await db.pageItems(current,{...filters(),template:task.aiOptions?.template||'keyword'});page=result.page;lastPage=result.pages;$('resultCount').textContent='筛选结果 '+fmt(result.total)+' / '+fmt((await db.stats(current)).total)+' 个关键词';updateFilterSummary();$('pageLabel').textContent=`${page} / ${lastPage}`;$('pageInput').value=page;$('pageInput').max=lastPage;$('prev').disabled=page<=1;$('next').disabled=page>=lastPage;for(const input of $('jump').elements)input.disabled=!result.total;
 $('empty').hidden=!!result.items.length;if(!result.items.length){$('empty').querySelector('h3').textContent='没有匹配的关键词';$('empty').querySelector('p').textContent='调整筛选条件，或创建新的采集任务。';}
 const fragment=document.createDocumentFragment(),template=task.aiOptions?.template||'keyword';for(const item of result.items){fragment.append(keywordRow(item,task.site,key=>openDetail(key).catch(e=>notify(e.message,true)),template,task.workflow));if(['ai','full'].includes(task.workflow))fragment.append(keywordAnalysisRow(item,template));}$('resultRows').replaceChildren(fragment);}
async function openDetail(key){const taskId=current,[item,task,originals]=await Promise.all([db.getItem(taskId,key),db.getTask(taskId),db.originalsForKeys(taskId,[key])]);if(!item||!task)throw new Error('未找到此关键词的已存资料');selectedSample={item,task,rows:originals[key]||[]};renderSamples($('sampleContent'),selectedSample);$('detailTitle').textContent=item.keyword;$('detailTitle').href=selectedSample.sourceUrl;$('exportSamples').disabled=!item.data?.products?.length;$('detailDialog').showModal();}
async function openAnalysis(key){const task=await db.getTask(current),item=await db.getItem(current,key);$('analysisTitle').textContent=item.keyword+' · 关键词分析';$('analysisContent').replaceChildren(analysisCard(item.analysis?.[task.aiOptions?.template||'keyword']));$('analysisDialog').showModal();}
function lockTaskControls(){taskBusy=true;for(const id of ['taskSelect','newTask','restore','renameTask','deleteTask'])$(id).disabled=true;}
let confirmResolve=null;
function finishConfirm(accepted){const resolve=confirmResolve;confirmResolve=null;$('confirmDialog').close();resolve?.(accepted);}
function confirmAction(title,description,label='继续',danger=false){
 const dialog=$('confirmDialog');if(dialog.open||confirmResolve)return Promise.resolve(false);
 $('confirmTitle').textContent=title;$('confirmDescription').textContent=description;$('acceptConfirm').textContent=label;$('acceptConfirm').className=danger?'danger-button':'primary';
 return new Promise(resolve=>{confirmResolve=resolve;dialog.showModal();(danger?$('cancelConfirm'):$('acceptConfirm')).focus();});
}
for(const id of ['closeConfirm','cancelConfirm'])bind(id,'click',()=>finishConfirm(false));
bind('acceptConfirm','click',()=>finishConfirm(true));
bind('confirmDialog','cancel',e=>{e.preventDefault();finishConfirm(false);});
const openImport=async()=>{if(await allowDiscard())$('importDialog').showModal();};
bind('newTask','click',openImport);bind('emptyNew','click',openImport);bind('closeImport','click',()=>$('importDialog').close());bind('closeDetail','click',()=>$('detailDialog').close());bind('closeAnalysis','click',()=>$('analysisDialog').close());
let renameTarget='';
bind('renameTask','click',async()=>{const task=await db.getTask(current);if(!task)return;renameTarget=task.id;$('renameTaskName').value=task.name;$('renameTaskDialog').showModal();$('renameTaskName').select();});
for(const id of ['closeRenameTask','cancelRenameTask'])bind(id,'click',()=>$('renameTaskDialog').close());
bind('renameTaskForm','submit',async e=>{e.preventDefault();$('saveTaskName').disabled=true;try{await db.renameTask(renameTarget,$('renameTaskName').value);$('renameTaskDialog').close();await loadTasks(current);notify('任务名称已更新。');}finally{$('saveTaskName').disabled=false;}});
bind('deleteTask','click',async()=>{
 if(taskBusy)return;const id=current,task=await db.getTask(id);if(!task)return;if(['running','importing'].includes(task.state))throw new Error('请先暂停任务，等待导入或执行结束后再删除');
 const counts=await db.stats(id);
 if(!await confirmAction('删除任务“'+task.name+'”？','将删除此任务的 '+fmt(counts.total)+' 个关键词、'+fmt(task.inputRows)+' 条导入记录及其分析结果。需要留存时，请先取消并备份整个任务。此操作无法撤销。','删除此任务',true))return;
 lockTaskControls();
 try{const list=(await db.tasks()).sort((a,b)=>b.createdAt-a.createdAt),index=list.findIndex(t=>t.id===id);await db.deleteTask(id);const remaining=list.filter(t=>t.id!==id);await loadTasks(remaining[Math.min(index,remaining.length-1)]?.id||'');await loadAiOptions();notify('任务已删除。');}finally{taskBusy=false;await refresh();}
});
bind('exportSamples','click',async()=>{if(!selectedSample?.item.data?.products?.length)return;const context=selectedSample,name=context.item.keyword.replace(/[\\/:*?"<>|]/g,'_')+'-商品样本.csv';const saved=await exp.saveChunks(name,sampleCsv(context),'text/csv');if(saved)notify('商品样本表格已导出。');});
bind('importForm','submit',async e=>{e.preventDefault();if(importing)return;const files=Array.from($('inputFiles').files),text=$('inputText').value.trim();if(!files.length&&!text)throw new Error('请选择文件或输入关键词');importing=true;$('importSubmit').disabled=true;$('closeImport').disabled=true;let task;try{
 const name=$('importName').value.trim();if(!name||name.length>80)throw new Error('任务名称须为 1–80 个字');task=await db.createTask(name,$('site').value);let total=0;
 for(const file of files){$('importProgress').textContent=`正在读取 ${file.name}…`;const rows=await readInput(file);if(!rows.length)throw new Error(file.name+' 没有有效数据');for(let i=0;i<rows.length;i+=250){total+=await db.appendRows(task.id,rows.slice(i,i+250),file.name);$('importProgress').textContent=`已保存 ${fmt(total)} 条原始行…`;}}
 if(text){const rows=text.split(/\r?\n/).filter(s=>s.trim()).map(s=>({'关键词':s.trim()}));for(let i=0;i<rows.length;i+=250)total+=await db.appendRows(task.id,rows.slice(i,i+250),'手动输入');}
 if(!total)throw new Error('没有找到有效关键词');await db.updateTask(task.id,{state:'ready'});current=task.id;$('importDialog').close();$('importForm').reset();notify(`已保存 ${fmt(total)} 条原始行，重复关键词会合并采集。`);await loadAiOptions();
 }catch(err){if(task){await db.updateTask(task.id,{state:'paused',reason:'部分文件导入失败：'+err.message+'；已导入部分可导出。剩余文件请另建任务导入。'});current=task.id;}throw err;}
 finally{importing=false;$('importSubmit').disabled=false;$('closeImport').disabled=false;await loadTasks(current);await loadAiOptions();}});
bind('recollect','click',async()=>{if(!await allowDiscard())return;$('recollect').disabled=true;try{const task=await db.recollectCopy(current);await loadTasks(task.id);await loadAiOptions();notify('重采副本已建立，旧任务已保留。点击开始采集重新获取数据。');}finally{await refresh();}});
bind('taskSelect','change',async()=>{if(taskBusy)return;const next=$('taskSelect').value;$('taskSelect').value=current;lockTaskControls();try{if(!await allowDiscard())return;current=next;$('taskSelect').value=current;page=1;$('sourceFilter').value='';await chrome.storage.local.set({lastTask:current});await loadAiOptions();await refresh();}finally{taskBusy=false;await refresh();}});
bind('start','click',async()=>{$('start').disabled=true;try{const t=await db.getTask(current);if(['ai','full'].includes(t.workflow))await db.updateTask(current,{aiOptions:aiOptions()});markTaskApplied();await message({type:'start',taskId:current});await refresh();}finally{await refresh();}});bind('pause','click',async()=>{await message({type:'pause',taskId:current});await refresh();});
for(const id of ['query','sourceFilter','statusFilter','aiStatusFilter','sort','sortDirection',...UI_FILTER_RANGES.flatMap(r=>[r.min,r.max])]){let timer;bind(id,'input',()=>{updateFilterSummary();clearTimeout(timer);timer=setTimeout(guarded(async()=>{const errors=filterErrors(filters());if(!$('resultFilters').checkValidity()||errors.length){$('filterError').textContent=errors[0]||'请输入有效的筛选数值';$('filterError').hidden=false;return;}page=1;if(current)await refresh();}),150);});}
bind('prev','click',async()=>{page--;await refresh();});bind('next','click',async()=>{page++;await refresh();});bind('jump','submit',async e=>{e.preventDefault();const n=Number($('pageInput').value);if(!$('pageInput').value||!Number.isInteger(n))throw new Error('请输入整数页码');page=Math.max(1,Math.min(lastPage,n));await refresh();});
for(const [id,type] of [['exportHtml','html'],['exportCsv','csv'],['exportRemaining','remaining'],['exportBackup','backup']])bind(id,'click',async()=>{const task=await db.getTask(current),ext=type==='backup'?'json':type==='html'?'html':'csv',name=task.name.replace(/[\\/:*?"<>|]/g,'_')+(type==='remaining'?'-未完成':type==='backup'?'-任务备份':task.workflow==='ai'?'-分析结果':'-已采集')+'.'+ext;const iterator=type==='backup'?exp.backup(current):type==='html'?exp.html(current):exp.csv(current,type==='remaining');const saved=await exp.saveChunks(name,iterator,type==='html'?'text/html':type==='backup'?'application/json':'text/csv');if(saved)notify('文件已生成。任务进度仍保存在本机。');});
bind('restore','click',async()=>{if(await allowDiscard())$('backupFile').click();});
bind('backupFile','change',async()=>{const file=$('backupFile').files[0];if(!file)return;try{if(file.size>384*1024*1024)throw new Error('备份超过 384MB，请在原 Chrome 中继续处理。');const task=await db.restoreBackup(JSON.parse(await file.text()));await loadTasks(task.id);await loadAiOptions();notify('任务已恢复，已采集部分会保留。');}finally{$('backupFile').value='';}});
const openProfit=initProfitTool({storage:chrome.storage.local,onSettings:()=>{openSettings();$('profitSettingsForm').scrollIntoView({block:'start'});$('profitDefaultQuantity').focus({preventScroll:true});},onError:e=>notify(e.message,true)});bind('openProfit','click',()=>openProfit());
let savedPrompts={},promptTemplates=[],selectedTemplate='',taskSnapshot=null,showTaskSnapshot=false,editorBaseline='',taskBaseline='';
const builtinTemplateDefs=[['keyword','关键词综合分析与六层评分'],['blue_ocean','蓝海关键词分析'],['ad_ppc','广告与 PPC 关键词分析']];
function activeTemplate(){return showTaskSnapshot&&taskSnapshot?.id===selectedTemplate?taskSnapshot:promptTemplates.find(t=>t.id===selectedTemplate);}
function editorValue(){const t=activeTemplate();return {id:selectedTemplate,name:t?.name||'',prompt:$('prompt').value,system:t?.system||templates.system,baseId:t?.baseId||'keyword'};}
function editorDirty(){return JSON.stringify(editorValue())!==editorBaseline;}
function settingsFingerprint(options){return JSON.stringify([options.inputMode,options.template,options.prompt,options.system,options.outputContract,[...(options.fields||[])].sort()]);}
function settingsDirty(){return !!current&&taskBaseline!==settingsFingerprint(aiOptions(false));}
function updateTemplateState(){
 const exists=promptTemplates.some(t=>t.id===selectedTemplate),dirty=editorDirty();
 $('templateState').textContent=dirty?'有未保存的修改':showTaskSnapshot&&taskSnapshot?.id===selectedTemplate?'当前任务的已存内容':'模板已保存';
 $('templateState').classList.toggle('unsaved',dirty);$('savePrompt').disabled=!dirty&&exists;
 $('savePrompt').textContent=exists?'保存提示词':'存入模板库';
 const protectedTemplate=selectedTemplate===PROTECTED_TEMPLATE_ID;$('protectedTemplate').hidden=!protectedTemplate;$('deleteTemplate').hidden=protectedTemplate;
 $('deleteTemplate').disabled=!exists||protectedTemplate;
 $('deleteTemplate').title=promptTemplates.length<=1?'至少保留一个分析模板':!exists?'此模板仅保存在当前任务中':'仅从模板库删除，保留任务已有结果';
 $('taskSettingsState').textContent=settingsDirty()?'设置有变更，应用后用于当前任务。':'当前任务设置已保存';
}
function renderTemplateOptions(selected=selectedTemplate){
 selectedTemplate=selected||promptTemplates[0]?.id||'';
 const options=promptTemplates.map(t=>new Option(t.name,t.id));
 if(taskSnapshot&&!promptTemplates.some(t=>t.id===taskSnapshot.id))options.push(new Option(taskSnapshot.name+'（任务留存）',taskSnapshot.id));
 $('template').replaceChildren(...options);$('template').value=selectedTemplate;updateTemplate();
}
function updateTemplate(){const t=activeTemplate();if(!t)return;$('prompt').value=t.prompt;$('outputExample').textContent=contractExample(t.baseId);$('newOutputExample').textContent=contractExample('keyword');editorBaseline=JSON.stringify(editorValue());updateTemplateState();}
async function allowDiscard(editorOnly=false){
 if(!editorDirty()&&(editorOnly||!settingsDirty()))return true;
 return confirmAction('舍弃未保存的修改？',editorOnly?'提示词有未保存的修改，继续后会舍弃这些修改。':settingsDirty()?'模板或分析设置尚未应用到当前任务，继续切换会舍弃这些修改。':'模板库中还有未保存的修改，继续后会保留任务已存设置，舍弃模板编辑。','舍弃并继续');
}
async function loadPromptTemplates(){
 const stored=await chrome.storage.local.get(['prompts','promptTemplates']);savedPrompts=stored.prompts||{};
 const saved=Array.isArray(stored.promptTemplates)?stored.promptTemplates.filter(t=>t&&t.id&&t.name):[];
 promptTemplates=saved.length?saved.map(t=>({id:String(t.id),name:String(t.name).slice(0,40),prompt:String(t.prompt||''),system:String(t.system||savedPrompts.system||templates.system),baseId:t.baseId||(templates[t.id]?t.id:'keyword')})):builtinTemplateDefs.map(([id,name])=>({id,name,prompt:savedPrompts[id]||templates[id]||templates.keyword,system:savedPrompts.system||templates.system,baseId:id}));
 const normalized=ensureProtectedTemplate(promptTemplates,templates);
 if(JSON.stringify(normalized)!==JSON.stringify(promptTemplates))await persistPromptTemplates(normalized);else promptTemplates=normalized;
 renderTemplateOptions(promptTemplates[0].id);
}
async function persistPromptTemplates(next=promptTemplates){
 const legacy={...savedPrompts};for(const t of promptTemplates)if(!next.some(item=>item.id===t.id))delete legacy[t.id];for(const t of next)legacy[t.id]=t.prompt;
 await chrome.storage.local.set({promptTemplates:next.map(({id,name,prompt,system,baseId})=>({id,name,prompt,system,baseId})),prompts:legacy});
 promptTemplates=next;savedPrompts=legacy;
}
async function loadAiOptions(){
 taskSnapshot=null;showTaskSnapshot=false;taskBaseline='';
 if(!current){$('aiFields').replaceChildren();renderTemplateOptions(promptTemplates[0]?.id);return;}
 const task=await db.getTask(current),options=task.aiOptions||{};
 taskSnapshot=taskTemplate(options,promptTemplates,templates);showTaskSnapshot=true;
 $('aiInputMode').value=task.workflow==='ai'||options.inputMode==='ai'?'ai':'full';
 const fields=await db.originalFields(current);$('aiFields').replaceChildren();
 for(const field of fields){const label=node('label'),input=document.createElement('input');input.type='checkbox';input.value=field;input.checked=!options.fields||options.fields.includes(field);label.append(input,document.createTextNode(field));$('aiFields').append(label);}
 renderTemplateOptions(taskSnapshot.id);taskBaseline=settingsFingerprint(aiOptions(false));updateTemplateState();
}
function aiOptions(validate=true){if(validate&&!$('prompt').value.trim())throw new Error('请填写分析提示词，再应用到任务');return {inputMode:$('aiInputMode').value,template:selectedTemplate,templateName:activeTemplate()?.name||'',baseTemplate:activeTemplate()?.baseId||'keyword',prompt:$('prompt').value,system:activeTemplate()?.system||templates.system,outputContract:keywordContract(activeTemplate()?.baseId||'keyword'),fields:[...$('aiFields').querySelectorAll('input:checked')].map(e=>e.value)};}
function markTaskApplied(){taskBaseline=settingsFingerprint(aiOptions(false));taskSnapshot={...editorValue()};showTaskSnapshot=true;updateTemplateState();}
bind('aiEnabled','change',async()=>{
 if(!current)return;const enabled=$('aiEnabled').checked,task=await db.getTask(current);
 if(task.state==='running')await message({type:'pause',taskId:current});
 await db.updateTask(current,{workflow:enabled?$('aiInputMode').value:'collect',aiOptions:aiOptions()});
 markTaskApplied();$('aiOptionsPanel').open=enabled;await refresh();notify(task.state==='running'?'任务已暂停，AI '+(enabled?'已开启':'已关闭')+'。点击继续即可。':'AI '+(enabled?'已开启':'已关闭'));
});
bind('configureAi','click',()=>{$('aiOptionsPanel').open=true;$('aiOptionsPanel').scrollIntoView({block:'nearest',behavior:'smooth'});});
bind('template','change',async()=>{const next=$('template').value;$('template').value=selectedTemplate;if(next===selectedTemplate||!await allowDiscard(true))return;showTaskSnapshot=next===taskSnapshot?.id&&!promptTemplates.some(t=>t.id===next);renderTemplateOptions(next);});
bind('prompt','input',updateTemplateState);
for(const id of ['aiInputMode','aiFields'])bind(id,'change',updateTemplateState);
bind('savePrompt','click',async()=>{
 const next=saveTemplate(promptTemplates,editorValue());$('savePrompt').disabled=true;
 try{await persistPromptTemplates(next);showTaskSnapshot=false;renderTemplateOptions(selectedTemplate);notify('模板已保存到本机模板库。点击“应用到当前任务”使用这些设置。');}finally{updateTemplateState();}
});
let creatingTemplate=false;
function creatorDirty(){return !!($('newTemplateName').value.trim()||$('newTemplatePrompt').value.trim());}
async function closeCreator(){if(creatorDirty()&&!await confirmAction('舍弃新模板草稿？','名称和提示词尚未创建为模板。','舍弃草稿'))return;$('createTemplateForm').reset();$('templateCreator').open=false;}
bind('cancelTemplate','click',closeCreator);
for(const [id,key]of [['exampleOpportunity','opportunity'],['exampleRepurchase','repurchase']])bind(id,'click',async()=>{if($('newTemplatePrompt').value.trim()&&!await confirmAction('使用示例替换草稿？','将替换新建区的提示词，模板名称保留。','使用示例'))return;$('newTemplatePrompt').value=promptExamples[key];$('newTemplatePrompt').focus();});
bind('createTemplateForm','submit',async e=>{
 e.preventDefault();if(creatingTemplate)return;
 const draft={id:'custom_'+crypto.randomUUID(),name:$('newTemplateName').value,prompt:$('newTemplatePrompt').value,system:templates.system,baseId:'keyword'};
 const next=saveTemplate(promptTemplates,draft);creatingTemplate=true;$('createTemplate').disabled=true;
 try{await persistPromptTemplates(next);const choice=$('template').value;$('template').append(new Option(draft.name.trim(),draft.id));$('template').value=choice;$('createTemplateForm').reset();$('templateCreator').open=false;notify('新模板已创建，请在分析模板中选择，再应用到当前任务。');}finally{creatingTemplate=false;$('createTemplate').disabled=false;}
});
bind('deleteTemplate','click',async()=>{
 const t=promptTemplates.find(t=>t.id===selectedTemplate);if(!t||t.id===PROTECTED_TEMPLATE_ID)return;
 if(!await confirmAction('删除模板“'+t.name+'”？','仅从本机模板库移除。使用它的任务仍保留原有提示词和分析结果。编辑区未保存的修改会一起舍弃。','删除模板',true))return;
 const next=removeTemplate(promptTemplates,t.id);await persistPromptTemplates(next);
 if(current){const task=await db.getTask(current);taskSnapshot=taskTemplate(task.aiOptions||{},next,templates);showTaskSnapshot=true;}renderTemplateOptions(taskSnapshot?.id||next[0].id);notify('模板已从模板库移除，任务已有的设置和分析结果保留。');
});
bind('resetPrompt','click',async()=>{
 if(editorDirty()&&!await confirmAction('恢复初始提示词？','将替换编辑区中的分析提示词，保存后写入模板库。','恢复内容'))return;
 const base=activeTemplate()?.baseId||'keyword';$('prompt').value=templates[base]||templates.keyword;updateTemplateState();
});
for(const [id,checked]of [['selectAllFields',true],['clearFields',false]])bind(id,'click',()=>{for(const input of $('aiFields').querySelectorAll('input'))input.checked=checked;updateTemplateState();});
bind('analyze','click',async()=>{if(!current)throw new Error('请先导入任务');const options=aiOptions(),t=await db.getTask(current);if(t.state==='running')await message({type:'pause',taskId:current});await db.updateTask(current,{workflow:$('aiEnabled').checked?$('aiInputMode').value:'collect',aiOptions:options});markTaskApplied();await refresh();notify('已应用到当前任务，点击开始或继续执行。');});
bind('aiBack','click',()=>{$('aiOptionsPanel').open=false;});
window.addEventListener('beforeunload',e=>{if(editorDirty()||settingsDirty()||creatorDirty()){e.preventDefault();e.returnValue='';}});
bind('resultFilters','submit',e=>e.preventDefault());
bind('resetFilters','click',async()=>{for(const id of ['query','sourceFilter','statusFilter','aiStatusFilter',...UI_FILTER_RANGES.flatMap(r=>[r.min,r.max])])$(id).value='';page=1;await refresh();});
for(const b of document.querySelectorAll('th button[data-sort]'))b.onclick=guarded(async()=>{const same=$('sort').value===b.dataset.sort;$('sort').value=b.dataset.sort;$('sortDirection').value=same?($('sortDirection').value==='asc'?'desc':'asc'):'asc';page=1;await refresh();});
async function permit(url){const u=new URL(url);const granted=await chrome.permissions.request({origins:[u.origin+'/*']});if(!granted)throw new Error('尚未允许连接此地址，配置未保存。');}
const aiFormConfig=()=>({baseUrl:$('baseUrl').value.trim(),apiKey:$('apiKey').value.trim(),model:$('model').value.trim()});
function updateAiEndpoint(){try{$('aiEndpoint').textContent='实际请求：'+endpointUrl($('baseUrl').value);}catch{$('aiEndpoint').textContent='填写接口地址后显示实际请求路径。';}$('aiConnectionResult').hidden=true;}
for(const id of ['baseUrl','model','apiKey'])bind(id,'input',updateAiEndpoint);
bind('settingsForm','submit',async e=>{e.preventDefault();const ai=aiFormConfig();endpointUrl(ai.baseUrl);await permit(ai.baseUrl);await chrome.storage.local.set({ai});notify('中转站配置已保存在当前 Chrome。');});
bind('testAiConnection','click',async()=>{
 if(!$('settingsForm').reportValidity())return;const button=$('testAiConnection'),result=$('aiConnectionResult'),config=aiFormConfig();endpointUrl(config.baseUrl);if(!config.apiKey)throw new Error('请填写 API Key 后测试连接');
 const controls=[...$('settingsForm').querySelectorAll('input,button')].map(element=>({element,disabled:element.disabled}));for(const {element}of controls)element.disabled=true;button.textContent='测试中…';result.hidden=false;result.className='connection-result';result.textContent='正在验证接口与模型…';
 try{await permit(config.baseUrl);const tested=await testConnection(config,AbortSignal.timeout(30000));result.className='connection-result success';result.textContent='连接成功 · '+tested.model+' · '+tested.endpoint;}
 catch(e){result.className='connection-result error';result.textContent=e.message;}
 finally{for(const {element,disabled}of controls)element.disabled=disabled;button.textContent='测试连接';}
});
bind('clearKey','click',async()=>{const {ai={}}=await chrome.storage.local.get('ai');ai.apiKey='';await chrome.storage.local.set({ai});$('apiKey').value='';updateAiEndpoint();notify('API Key 已清除。');});
bind('collectionForm','submit',async e=>{e.preventDefault();const concurrency=Number($('concurrency').value),delayMs=Number($('delayMs').value);if(![1,3,5].includes(concurrency)||delayMs<500||delayMs>30000)throw new Error('采集设置超出范围');await chrome.storage.local.set({collection:{concurrency,delayMs}});notify('已保存，将在下次开始或继续时生效。');});
bind('docsLink','click',e=>{e.preventDefault();notify('请打开下载文件夹内的 docs/使用教程.md 和对应系统的安装教程。');});
const config=await chrome.storage.local.get(['lastTask','ai','collection']);for(const id of ['baseUrl','model','apiKey'])$(id).value=config.ai?.[id]||'';for(const id of ['concurrency','delayMs'])if(config.collection?.[id])$(id).value=config.collection[id];
updateAiEndpoint();
try{await loadPromptTemplates();await loadTasks(config.lastTask);await loadAiOptions();showWorkspace();}catch(e){notify(e.message,true);}
setInterval(()=>refresh(false).catch(e=>notify(e.message,true)),4000);

const profitSaved=await chrome.storage.local.get(['profitDefaults','profitInputs']),profitDefaults=resolveProfitSettings(profitSaved.profitDefaults,profitSaved.profitInputs);
const profitSettingFields={sea:'profitSeaRate','red-express':'profitRedRate',quantity:'profitDefaultQuantity',seaTarget:'profitSeaTarget',airTarget:'profitAirTarget'};
for(const [key,id]of Object.entries(profitSettingFields))$(id).value=profitDefaults[key];
bind('profitSettingsForm','submit',async e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(profitSettingFields).map(([key,id])=>[key,$(id).value]));if(!validProfitSettings(values))throw new Error('首批数量须为正整数，运输单价须大于 0，目标净利率须在 0–100% 之间');const settings=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Number(value)]));await chrome.storage.local.set({profitDefaults:settings});notify('测算参数已保存，下次打开利润工具即生效。');});
