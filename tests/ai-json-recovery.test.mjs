import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {parseKeywordResults,runKeywordBatch,analysisLabels} from '../extension/ai.js';
import {Runner} from '../extension/runner.js';
import * as db from '../extension/db.js';
const items=Array.from({length:5},(_,id)=>({key:'word '+id,keyword:'word '+id}));
const row=id=>Object.fromEntries([['id',id],['keyword',items[id].keyword],...Object.keys(analysisLabels).filter(k=>!['level','rating','reason'].includes(k)).map(k=>[k,k==='overall_score'?70+id:'保留原文：含 [括号]、"引号" 和反斜杠 \\'])]);
test('接受 JSON 代码块和说明文字，但不更改模型文本或分数',()=>{
 const data=JSON.stringify({selected_keywords:[row(1),row(0)]});
 for(const response of [data,'\uFEFF'+data,'```json\n'+data+'\n```','以下是分析结果：\n'+data+'\n以上分析仅依赖提供的数据。']){
  const parsed=parseKeywordResults(response,items,'keyword');
  assert.deepEqual(parsed.results.map(r=>r.key),['word 1','word 0']);assert.equal(parsed.results[0].result.llm_reason,row(1).llm_reason);
 }
});
test('截断的数组只保留完整记录；断开的字符串、错误 ID 或缺字段记录均不补造',()=>{
 const text='{"selected_keywords":['+JSON.stringify(row(0))+','+JSON.stringify(row(1))+',{"id":2,"keyword":"word 2","llm_reason":"未写完';
 const parsed=parseKeywordResults(text,items,'keyword',{finishReason:'length'});
 assert.deepEqual(parsed.results.map(r=>r.key),['word 0','word 1']);assert.equal(parsed.missing.length,3);assert.match(parsed.issues[0],/长度上限/);
 const wrong={...row(1),id:3};const missing={...row(2)};delete missing.compliance_risk;
 const bad=parseKeywordResults('['+JSON.stringify(row(0))+','+JSON.stringify(wrong)+','+JSON.stringify(missing)+',{"id":4',items,'keyword');
 assert.deepEqual(bad.results.map(r=>r.key),['word 0']);assert.equal(bad.missing.length,4);
 assert.throws(()=>parseKeywordResults('[{"id":0,"reason":"断开的字符串',items,'keyword',{finishReason:'length'}),/被截断/);
 assert.throws(()=>parseKeywordResults('没有 JSON',items),/JSON/);
 assert.throws(()=>parseKeywordResults('null',items),/缺少/);
 assert.equal(parseKeywordResults('[null,12]',items).results.length,0);
});
test('真实 HTTP 路径传递 finish_reason，截断响应不丢失已完成结果',async()=>{
 const server=createServer((req,res)=>{req.resume();res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:'['+JSON.stringify(row(0))+',{"id":1'}}]}));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const parsed=await runKeywordBatch({items,task:{site:'com',workflow:'ai',aiOptions:{template:'keyword'}},originals:{},config:{baseUrl:'http://127.0.0.1:'+server.address().port+'/v1',apiKey:'TEST_ONLY',model:'test'},signal:AbortSignal.timeout(2000)});
  assert.equal(parsed.results.length,1);assert.match(parsed.issues[0],/长度上限/);
 }finally{server.close();server.closeAllConnections();}
});
test('暂停保留成功项，继续时失败项逐词领取，普通新项仍按五词一批',async()=>{
 const task=await db.createTask('JSON recovery test');await db.appendRows(task.id,items.map(i=>({'关键词':i.keyword})),'test');
 await db.updateTask(task.id,{state:'ready',workflow:'ai',aiOptions:{template:'keyword'}});await db.prepareRun(task.id);
 let calls=0;
 const broken=()=>runKeywordBatch({items,task:{workflow:'ai',aiOptions:{template:'keyword'}},originals:{},config:{},request:async()=>{calls++;return '['+JSON.stringify(row(0))+','+JSON.stringify(row(1))+',{"id":2';}});
 await new Runner({aiConfig:async()=>({model:'test'}),analyzeBatch:broken}).run(task.id);
 assert.equal(calls,1);assert.equal((await db.getTask(task.id)).state,'paused');assert.equal((await db.analysisStats(task.id,'keyword','ai')).completed,2);
 await db.prepareRun(task.id);const resumed=[];
 await new Runner({aiConfig:async()=>({model:'test'}),analyzeBatch:async({items:batch})=>{assert.equal(batch.length,1);resumed.push(batch[0].key);return {results:[{key:batch[0].key,result:row(Number(batch[0].key.at(-1)))}],missing:[],issues:[]};}}).run(task.id);
 assert.deepEqual(resumed,['word 2','word 3','word 4']);assert.equal((await db.analysisStats(task.id,'keyword','ai')).completed,5);assert.equal((await db.getTask(task.id)).state,'complete');
 const fresh=await db.createTask('fresh');await db.appendRows(fresh.id,items.map(i=>({'关键词':i.keyword})),'test');
 assert.equal((await db.claimAnalysis(fresh.id,'keyword','ai')).length,5);
});
