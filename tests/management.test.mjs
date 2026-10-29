import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as db from '../extension/db.js';
import {copyName,saveTemplate,removeTemplate,taskTemplate,ensureProtectedTemplate} from '../extension/template-library.js';
const defaults={keyword:'Default keyword prompt',system:'System requirements'};
const entries=[{id:'keyword',name:'综合分析',prompt:'Original',system:'System',baseId:'keyword'},{id:'blue_ocean',name:'蓝海分析',prompt:'Blue',system:'System',baseId:'blue_ocean'}];
test('new draft and saving a copy do not overwrite the original library',()=>{
 const original=structuredClone(entries),draft={...entries[0],id:'copy',name:copyName(entries[0].name,entries),prompt:'Edited'};
 assert.deepEqual(entries,original);
 const saved=saveTemplate(entries,draft);assert.equal(saved.length,3);assert.deepEqual(saved[0],entries[0]);assert.equal(saved[2].prompt,'Edited');
 assert.throws(()=>saveTemplate(entries,{...draft,name:' 综合分析 '}),/同名/);
 assert.throws(()=>saveTemplate(entries,{...draft,name:' '}),/名称/);
 assert.throws(()=>saveTemplate(entries,{...draft,prompt:' '}),/不能为空/);
});
test('deleting a library template preserves task prompt, identity and results',()=>{
 const task={aiOptions:{template:'blue_ocean',templateName:'任务原模板',prompt:'Task saved prompt',system:'Task system'},analysis:{keyword:{state:'done',score:66}}},before=structuredClone(task);
 const reduced=removeTemplate(entries,'blue_ocean'),snapshot=taskTemplate(task.aiOptions,reduced,defaults);
 assert.equal(reduced.length,1);assert.equal(snapshot.id,'blue_ocean');assert.equal(snapshot.prompt,'Task saved prompt');assert.deepEqual(task,before);
 assert.throws(()=>removeTemplate(reduced,'keyword'),/不可删除/);
});
test('task snapshots use explicitly saved empty strings rather than library fallbacks',()=>{
 const snapshot=taskTemplate({template:'keyword',prompt:'',system:''},entries,defaults);assert.equal(snapshot.prompt,'');assert.equal(snapshot.system,'');
});
test('task deletion is scoped, transactional, and rejects running/importing tasks',async()=>{
 const a=await db.createTask('Delete target'),b=await db.createTask('Keep target');
 for(const task of [a,b]){await db.appendRows(task.id,[{'关键词':'candle'},{'关键词':'bottle'}],'qa.csv');await db.updateTask(task.id,{state:'paused',aiOptions:{template:'keyword',prompt:'Saved'}});}
 await db.updateTask(a.id,{state:'running'});await assert.rejects(db.deleteTask(a.id),/暂停/);assert.equal((await db.stats(a.id)).total,2);
 await db.updateTask(a.id,{state:'importing'});await assert.rejects(db.deleteTask(a.id),/暂停/);
 await db.updateTask(a.id,{state:'paused'});await db.renameTask(a.id,'  Renamed  ');assert.equal((await db.getTask(a.id)).name,'Renamed');
 await assert.rejects(db.renameTask(a.id,' '),/1–80/);await assert.rejects(db.renameTask(a.id,'x'.repeat(81)),/1–80/);
 await db.setMeta('rotateTask',a.id);await db.setMeta('unrelated','preserve');
 await db.deleteTask(a.id);assert.equal(await db.getTask(a.id),undefined);assert.equal((await db.stats(a.id)).total,0);assert.deepEqual(await db.originalFields(a.id),[]);assert.equal(await db.getMeta('rotateTask'),undefined);
 assert.equal((await db.stats(b.id)).total,2);assert.equal((await db.getTask(b.id)).aiOptions.prompt,'Saved');assert.equal(await db.getMeta('unrelated'),'preserve');
 await db.deleteTask(b.id);assert.equal((await db.tasks()).length,0);
});
test('backup restore preserves custom template identity and its existing results',async()=>{
 const restored=await db.restoreBackup({format:'hangbiao-task-v2',task:{name:'Custom template task',site:'com',workflow:'ai',aiOptions:{template:'custom_saved-template',templateName:'我的选品',baseTemplate:'blue_ocean',outputContract:'summary-v1',prompt:'Saved custom prompt',system:'Saved custom system',fields:['关键词']}},items:[{key:'candle',keyword:'candle',status:'pending',analysis:{'custom_saved-template':{state:'done',data:{summary:'Retained result'}}}}],rows:[{id:0,key:'candle',keyword:'candle',source:'qa',original:{'关键词':'candle'}}]});
 const task=await db.getTask(restored.id);assert.equal(task.aiOptions.template,'custom_saved-template');assert.equal(task.aiOptions.templateName,'我的选品');assert.equal(task.aiOptions.baseTemplate,'blue_ocean');assert.equal(task.aiOptions.outputContract,'summary-v1');assert.equal(task.aiOptions.prompt,'Saved custom prompt');assert.equal((await db.getItem(restored.id,'candle')).analysis['custom_saved-template'].state,'done');await db.deleteTask(restored.id);
});

test('restore only the protected template without overwriting saved prompts or readding deleted optional templates',()=>{
 const custom={id:'custom_saved',name:'Custom',prompt:'Keep',system:'System',baseId:'keyword'};
 const restored=ensureProtectedTemplate([custom],defaults);assert.equal(restored[0].id,'keyword');assert.equal(restored[0].prompt,defaults.keyword);assert.deepEqual(restored[1],custom);assert.equal(restored.length,2);assert.throws(()=>removeTemplate(restored,'keyword'),/不可删除/);
 const edited=ensureProtectedTemplate(entries,defaults);assert.equal(edited[0].prompt,'Original');assert.deepEqual(ensureProtectedTemplate(edited,defaults),edited);
});
