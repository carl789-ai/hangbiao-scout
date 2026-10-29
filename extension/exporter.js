import {offlineHeader,offlineFooter} from './offline-view.js';
import * as db from './db.js';import {csvCell,PARSER_VERSION} from './core.js';import {analysisLabels} from './ai.js';
const esc=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
const json=o=>JSON.stringify(o).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const clean=data=>data?Object.fromEntries(Object.entries(data).filter(([k])=>k!=='products')):null;
export const fields=['关键词','来源','采集状态','结果类型','搜索结果数','蓝海值','蓝海比率%','未知评论商品数','均价','购买标签合计','低评论购买标签合计','平均评论数','平均评分','采集时间','搜索链接'];
const aiFields=Object.keys(analysisLabels);
const hasAnalysis=item=>Object.values(item?.analysis||{}).some(a=>a.state==='done');
function values(row,item){const d=item?.data;return [row.keyword,row.source,item?.status==='done'?(d?.outcome==='search'&&d.parserVersion!==PARSER_VERSION?'旧版待核验':'已采集'):'未完成',d?.outcome||'',d?.totalResults,d?.lowReviewItemsCount,d?.homeBlueSeaRatio==null?'':d.homeBlueSeaRatio*100,d?.unknownReviewItems,d?.averagePrice,d?.totalSales,d?.lowReviewTotalSales,d?.averageReviews,d?.averageRating,d?.collectedAt,d?.url];}
export async function* csv(taskId,remaining=false){
 const cutoff=Date.now(),task=await db.getTask(taskId),originals=new Set(),columns=new Map(['keyword','blue_ocean','ad_ppc',task.aiOptions?.template].filter(Boolean).map(id=>[id,new Set(aiFields)]));
 for await(const items of db.chunks('items',taskId))for(const item of items)for(const [id,record]of Object.entries(item.analysis||{})){if(record.state!=='done')continue;if(!columns.has(id))columns.set(id,new Set(aiFields));for(const key of Object.keys(record.result||{}))if(!['id','keyword'].includes(key))columns.get(id).add(key);}
 for await(const rows of db.chunks('rows',taskId))for(const row of rows)Object.keys(row.original).forEach(k=>originals.add(k));
 const extra=[...originals],templateColumns=[...columns].flatMap(([template,keys])=>[...keys].map(key=>({template,key})));yield '﻿'+[...fields,...templateColumns.map(({template,key})=>'AI-'+template+':'+(analysisLabels[key]||key)),...extra.map(k=>'原表:'+k)].map(csvCell).join(',')+'\r\n';
 for await(const rows of db.chunks('rows',taskId))for(const row of rows){const item=await db.getItem(taskId,row.key);const done=item?.status==='done'&&(item.savedAt||0)<=cutoff;const aiDone=item?.analysis?.[task.aiOptions?.template||'keyword']?.state==='done',workflowDone=task.workflow==='ai'?aiDone:task.workflow==='full'?done&&aiDone:done;if(remaining?workflowDone:(!done&&!hasAnalysis(item)))continue;yield [...values(row,item),...templateColumns.map(({template,key})=>item?.analysis?.[template]?.state==='done'?item.analysis[template].result[key]:''),...extra.map(k=>row.original[k])].map(csvCell).join(',')+'\r\n';}
}
export async function* backup(taskId){const task=await db.getTask(taskId);yield '{"format":"hangbiao-task-v2","task":'+json(task)+',"items":[';let first=true;for await(const items of db.chunks('items',taskId))for(const item of items){yield (first?'':',')+json(item);first=false;}yield '],"rows":[';first=true;for await(const rows of db.chunks('rows',taskId))for(const row of rows){yield (first?'':',')+json(row);first=false;}yield ']}';}
export async function* html(taskId){
 const cutoff=Date.now(),task=await db.getTask(taskId),s={...await db.stats(taskId),completed:0,search:0,redirect:0};for await(const items of db.chunks('items',taskId))for(const item of items)if(item.status==='done'&&(item.savedAt||0)<=cutoff){s.completed++;if(item.data?.outcome==='non_search_redirect')s.redirect++;else s.search++;}s.pending=s.total-s.completed;const aiCounts=await db.analysisStats(taskId,task.aiOptions?.template||'keyword',task.workflow||'full');
 yield offlineHeader(task,s,aiCounts);
 let first=true;for await(const rows of db.chunks('rows',taskId))for(const row of rows){const item=await db.getItem(taskId,row.key);if((item?.status!=='done'&&!hasAnalysis(item))||(item.savedAt||0)>cutoff)continue;yield (first?'':',')+json({keyword:row.keyword,source:row.source,original:row.original,data:clean(item.data)||{url:`https://www.amazon.${task.site}/s?k=${encodeURIComponent(row.keyword)}`},analysis:item.analysis||{}});first=false;}
 yield offlineFooter(task.aiOptions?.template||'keyword');
}
export async function saveChunks(name,iterator,mime){
 let handle;
 if(typeof window.showSaveFilePicker==='function'){try{handle=await window.showSaveFilePicker({suggestedName:name});}catch(e){if(e.name==='AbortError')return false;throw e;}}
 if(handle){const writer=await handle.createWritable();try{for await(const chunk of iterator)await writer.write(chunk);await writer.close();}catch(e){await writer.abort();throw e;}return true;}
 const parts=[];let bytes=0;for await(const chunk of iterator){bytes+=new TextEncoder().encode(chunk).length;if(bytes>192*1024*1024)throw new Error('文件过大，请使用支持直接保存文件的最新版桌面 Chrome。');parts.push(chunk);}const url=URL.createObjectURL(new Blob(parts,{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return true;
}
