import {endpointUrl,norm} from './core.js';
import {originalPrompts} from './prompts.js';
export const templates=originalPrompts;
export const analysisLabels={search_trend_ai:'搜索趋势',competition_level:'竞争程度',blue_ocean_potential:'蓝海潜力',brand_risk:'品牌风险',infringement_risk:'侵权风险',category_restriction:'类目限制',certification_analysis:'认证分析',compliance_risk:'合规风险',product_recommendation:'产品建议',target_audience:'目标人群',seasonality:'季节性',fda_required:'FDA',standard_product_type:'标品属性',improvement_potential:'改进空间',is_electric:'带电',repurchase:'复购',overall_score:'综合评分',llm_reason:'综合分析',level:'机会等级',rating:'评分',reason:'分析理由'};
export async function analyze(config,prompt,data,signal){
 if(!config.apiKey||!config.model)throw new Error('请先在设置中填写 API Key 和模型名称');const url=endpointUrl(config.baseUrl);
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.apiKey},body:JSON.stringify({model:config.model,messages:[{role:'system',content:prompt},{role:'user',content:typeof data==='string'?data:JSON.stringify(data)}],temperature:0.1,max_tokens:20240}),signal,redirect:'error'});
 if(!res.ok)throw new Error('中转站返回 HTTP '+res.status);const result=await res.json(),text=result?.choices?.[0]?.message?.content;if(typeof text!=='string')throw new Error('模型没有返回文本，请检查中转站接口与模型名称');return text;
}
// Stable per-batch IDs plus keyword checks prevent a shuffled answer attaching to a different row.
export function parseKeywordResults(text,items,template){
 let content=text.trim();const fenced=content.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fenced)content=fenced[1].trim();
 let obj;try{obj=JSON.parse(content);}catch{throw new Error('模型返回的结果不是有效 JSON，本批次可继续重试');}
 const rows=Array.isArray(obj)?obj:obj.selected_keywords||obj.results;if(!Array.isArray(rows))throw new Error('模型结果缺少 selected_keywords 或 results');
 const mapped=new Map(),issues=[];
 for(const row of rows){const supplied=row.keyword??row.keywords;let index;
 if(row.id!==undefined){if(!Number.isInteger(row.id)||row.id<0||row.id>=items.length){issues.push('返回了不存在的 ID');continue;}index=row.id;if(supplied&&norm(supplied)!==items[index].key){issues.push('关键词与 ID 不一致');continue;}}
 else index=items.findIndex(i=>norm(supplied||'')===i.key);
 if(index<0||index===undefined||mapped.has(index)){issues.push('返回了重复或无法匹配的关键词');continue;}
 const score=row.overall_score??row.rating;
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100){issues.push('评分需在 0–100 之间');continue;}
 const reason=row.llm_reason??row.reason;if(typeof reason!=='string'||!reason.trim()){issues.push('缺少分析理由');continue;}
 if(template==='keyword'){const required=Object.keys(analysisLabels).filter(k=>!['level','rating','reason'].includes(k));if(required.some(k=>row[k]===undefined||row[k]===null||row[k]==='')){issues.push('综合分析缺少部分字段');continue;}}
 mapped.set(index,{...row,id:index,keyword:items[index].keyword,overall_score:score,llm_reason:reason});
 }
 return {results:[...mapped].map(([index,result])=>({key:items[index].key,result})),missing:items.filter((_,idx)=>!mapped.has(idx)),issues};
}
export function buildKeywordPrompt(items,originals,{fields=[],prompt=templates.keyword,site='com',mode='full'}={}){
 const payload=items.map((item,id)=>({id,keyword:item.keyword,country:site,...(mode!=='ai'?{search:item.data?Object.fromEntries(Object.entries(item.data).filter(([k])=>!['products','top3Images'].includes(k))):null}:{}),original_rows:(originals[item.key]||[]).map(r=>({source:r.source,fields:Object.fromEntries(fields.filter(k=>Object.hasOwn(r.original,k)).map(k=>[k,r.original[k]]))}))}));
 return prompt.replaceAll('{{field_list}}',fields.join('、')||'无额外导入字段').replaceAll('{{keyword_data}}',JSON.stringify(payload))+'\n\n若自定义模板未插入数据，请同时分析以下批次：\n'+(prompt.includes('{{keyword_data}}')?'（数据已在上方提供）':JSON.stringify(payload))+'\n返回 JSON；每条使用以上 id 和 keyword，评分 overall_score（0–100）及 llm_reason，或 rating 及 reason。未知字段保留未知，购买标签只代表页面标签。';
}
export async function runKeywordBatch({items,task,config,originals,signal,request=analyze}){
 const opt=task.aiOptions||{},template=opt.template||'keyword',prompt=buildKeywordPrompt(items,originals,{fields:opt.fields||[],prompt:opt.prompt||templates[template],site:task.site,mode:task.workflow});
 return parseKeywordResults(await request(config,opt.system||templates.system,prompt,signal),items,template);
}

export const productWeights={'广告竞争':15,'类目容量':12,'利润健康度':12,'刚需度':10,'侵权安全度':10,'合规与准入':10,'季节性':8,'复购率':8,'供应链壁垒':8,'生命周期趋势':7};
export function parseProductResult(text,asin){const raw=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');let data;try{data=JSON.parse(raw);}catch{throw new Error('商品分析结果不是有效 JSON');}const list=Array.isArray(data)?data:[data];if(list.length!==1||list[0]?.parentAsin!==asin)throw new Error('模型返回的商品与当前 ASIN 不匹配');const result=list[0];if(typeof result.comprehensiveAnalysis!=='string'||!result.comprehensiveAnalysis.trim())throw new Error('模型缺少商品综合分析');if(!result.userScore)throw new Error('模型缺少十维评分');let sum=0;for(const [key,weight]of Object.entries(productWeights)){const value=result.userScore[key];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10)throw new Error('模型未正确返回“'+key+'”评分');sum+=value*weight/10;}return {...result,userScore:{...result.userScore,'产品综合得分':Math.round(sum)}};}
export async function analyzeProduct(config,product,rules,signal,request=analyze){const prompt=templates.product.replaceAll('{{COUNT}}','1').replaceAll('{{USER_RULES}}',rules||templates.score).replaceAll('{{PRODUCT_DATA}}',JSON.stringify({...product,parentAsin:product.asin}));return parseProductResult(await request(config,'逐商品独立分析，输出 JSON 数组。评分权重：'+JSON.stringify(productWeights),prompt,signal),product.asin);}
export async function analyzeMarket(config,products,signal,request=analyze){
 const known=(key)=>products.map(p=>p[key]).filter(v=>typeof v==='number'&&Number.isFinite(v));const avg=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
 const data={sampleScope:'当前 Amazon 搜索页自然商品样本',kpi:{sampleProducts:products.length,averagePrice:avg(known('price')),averageReviews:avg(known('reviews')),averageRating:avg(known('rating'))},opportunity:{top:products.filter(p=>p.reviews!==null&&p.reviews<=100).map(p=>({asin:p.asin,title:p.title,price:p.price,reviews:p.reviews,purchaseLabelCount:p.purchaseLabelCount}))},products,concentration:null,fulfillment:null,keywordsTop20:[]};
 const raw=await request(config,templates.market,JSON.stringify(data),signal);let result;try{result=JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('市场分析结果不是有效 JSON');}if(typeof result.category_score!=='number'||result.category_score<0||result.category_score>100||typeof result.comprehensive!=='string')throw new Error('模型未返回完整市场评分与综合分析');return result;
}
export function importedAnalysis(original){const saved={};for(const template of ['keyword','blue_ocean','ad_ppc']){const result={};for(const [key,label]of Object.entries(analysisLabels)){const value=original['AI-'+template+':'+label]??(template==='keyword'?(original[key]??original['AI-'+key]):undefined);if(value!==undefined&&value!==null&&value!=='')result[key]=value;}const score=Number(result.overall_score??result.rating),reason=result.llm_reason??result.reason;if(Number.isFinite(score)&&score>=0&&score<=100&&typeof reason==='string'&&reason.trim())saved[template]={state:'done',result:{...result,overall_score:score,llm_reason:reason},imported:true,updatedAt:Date.now()};}return saved;}
