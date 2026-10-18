import test from 'node:test';import assert from 'node:assert/strict';import 'fake-indexeddb/auto';
import * as db from '../extension/db.js';import {Runner,fetchSearch} from '../extension/runner.js';import * as out from '../extension/exporter.js';import {DOMParser} from 'linkedom';
globalThis.DOMParser=DOMParser;
const result=k=>({keyword:k,outcome:'search',uniqueAsinCount:40,lowReviewItemsCount:10,homeBlueSeaRatio:.25,unknownReviewItems:0,totalSales:200,collectedAt:'2026-10-18T00:00:00Z',url:'https://www.amazon.com/s?k='+encodeURIComponent(k),products:[]});
async function collectText(iterator){let s='';for await(const c of iterator)s+=c;return s;}
test('500词在125成功后失败：导出、恢复与只采未完成，保留重复来源',async()=>{
 const task=await db.createTask('durability-500');for(let i=0;i<500;i+=250)await db.appendRows(task.id,Array.from({length:250},(_,j)=>({'关键词':'keyword '+String(i+j).padStart(5,'0'),'原字段':i+j})),'一号表');
 await db.appendRows(task.id,[{'关键词':'keyword 00000','原字段':'重复原始行'}],'二号表');await db.updateTask(task.id,{state:'ready'});await db.prepareRun(task.id);
 let successes=0,calls=0,rotations=0;const seen=new Set();
 const runner=new Runner({settings:()=>({concurrency:5}),wait:async()=>{},rotate:()=>rotations++,fetchItem:async item=>{calls++;if(successes>=125)throw new Error('模拟 Amazon 狗页');successes++;seen.add(item.key);return result(item.keyword);}});
 while((await db.getTask(task.id)).state==='running')await runner.run(task.id);
 const initial=await db.stats(task.id);assert.equal(initial.completed,125);assert.equal(initial.pending,375);assert.equal(initial.failed,5);assert.equal(rotations,0);
 const csv=await collectText(out.csv(task.id));assert.ok(csv.includes('重复原始行'));assert.ok(csv.includes('二号表'));assert.equal(csv.split('\r\n').length-2,126);
 const html=await collectText(out.html(task.id));assert.ok(html.includes('已采集 125 / 500'));assert.ok(html.includes('原始重复行与来源均保留'));assert.ok(!html.includes('keyword 00499'));
 const restored=await db.restoreBackup(JSON.parse(await collectText(out.backup(task.id))));assert.equal((await db.stats(restored.id)).completed,125);
 const pending=await collectText(out.csv(restored.id,true));assert.equal(pending.split('\r\n').length-2,375);assert.ok(!pending.includes('keyword 00000'));
 await db.resetItems(restored.id,'failed');await db.prepareRun(restored.id);let resumed=0;
 const next=new Runner({settings:()=>({concurrency:5}),wait:async()=>{},rotate:()=>{},fetchItem:async item=>{assert.ok(!seen.has(item.key),'已采集词被重复请求');resumed++;return result(item.keyword);}});
 while((await db.getTask(restored.id)).state==='running')await next.run(restored.id);
 const final=await db.stats(restored.id);assert.equal(final.completed,500);assert.equal(final.pending,0);assert.equal(resumed,375);assert.equal((await db.getTask(restored.id)).inputRows,501);
});
test('并发开始仅允许一个任务，已成功结果不可被失败覆盖',async()=>{const a=await db.createTask('a'),b=await db.createTask('b');for(const t of [a,b]){await db.appendRows(t.id,[{'关键词':'one'}],'x');await db.updateTask(t.id,{state:'ready'});}await db.prepareRun(a.id);await assert.rejects(()=>db.prepareRun(b.id));const [item]=await db.claim(a.id,1);await db.settle(item,'done',result('one'));await db.settle(item,'failed',null,{message:'stale'});assert.equal((await db.getItem(a.id,'one')).status,'done');await db.updateTask(a.id,{state:'complete'});});
test('事务中断不保留半条原始行',async()=>{const t=await db.createTask('atomic');await assert.rejects(()=>db.appendRows(t.id,[{'关键词':'ok'},{'关键词':'x'.repeat(1001)}],'x'));assert.equal((await db.stats(t.id)).total,0);assert.equal((await db.getTask(t.id)).inputRows,0);});
test('HTTP 403/429/503不解析成数据，断连保留失败原因',async()=>{for(const status of [403,429,503])await assert.rejects(()=>fetchSearch({keyword:'x'},'com',new AbortController().signal,async()=>({status,ok:false})),new RegExp('HTTP '+status));await assert.rejects(()=>fetchSearch({keyword:'x'},'com',new AbortController().signal,async()=>{throw new Error('offline')}),/网络连接失败/);});
