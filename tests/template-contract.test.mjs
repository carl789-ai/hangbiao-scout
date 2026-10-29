import test from 'node:test';
import assert from 'node:assert/strict';
import {contractExample,contractIssue} from '../extension/keyword-contract.js';
import {runKeywordBatch} from '../extension/ai.js';
const items=[{key:'birthday candle',keyword:'birthday candle'}];
test('a user-authored rule receives the actual fixed contract and matches the rendered example',async()=>{
 const row=JSON.parse(contractExample('keyword')).results[0];
 let called=false;
 const result=await runKeywordBatch({items,task:{site:'com',workflow:'ai',aiOptions:{template:'custom_mine',baseTemplate:'keyword',outputContract:'detail-v1',prompt:'Find repeat purchases; output plain text.',system:'My business rules'}},config:{},originals:{},request:async(config,system,prompt)=>{
  called=true;assert.ok(system.includes('程序固定的输出协议'));assert.ok(prompt.includes('Find repeat purchases'));assert.ok(prompt.includes('"id":0'));assert.ok(prompt.includes('"overall_score":75'));assert.ok(prompt.indexOf('程序固定的输出协议')>prompt.indexOf('output plain text'));return JSON.stringify({results:[row]});
 }});
 assert.ok(called);assert.equal(result.results.length,1);assert.equal(result.missing.length,0);
});
test('malformed new-contract rows remain pending while valid siblings are retained',async()=>{
 const row=JSON.parse(contractExample('keyword')).results[0],other={...row,id:1,keyword:'trash bags',overall_score:'75'};
 const result=await runKeywordBatch({items:[...items,{key:'trash bags',keyword:'trash bags'}],task:{workflow:'ai',aiOptions:{template:'custom_mine',outputContract:'detail-v1',prompt:'Rules'}},config:{},originals:{},request:async()=>JSON.stringify({results:[row,other]})});
 assert.equal(result.results.length,1);assert.deepEqual(result.missing.map(i=>i.key),['trash bags']);assert.match(result.issues.join(','),/类型/);
 assert.match(contractIssue({...row,id:undefined},'detail-v1'),/id/);
 assert.match(contractIssue({...row,seasonality:'unknown'},'detail-v1'),/枚举/);
 assert.match(contractIssue({...row,overall_score:75.5},'detail-v1'),/整数/);
});
test('summary templates have a fixed compatible format and historical tasks remain readable',async()=>{
 const row=JSON.parse(contractExample('blue_ocean')).results[0];
 for(const contract of ['summary-v1',undefined]){
  const result=await runKeywordBatch({items,task:{workflow:'ai',aiOptions:{template:'blue_ocean',outputContract:contract}},config:{},originals:{},request:async()=>JSON.stringify({results:[row]})});assert.equal(result.results[0].result.overall_score,75);
 }
});
