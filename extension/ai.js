import {outputContractText,contractIssue} from './keyword-contract.js';
import {endpointUrl,norm} from './core.js';
import {originalPrompts} from './prompts.js';
import {readKeywordJson} from './ai-json.js';
export const templates=originalPrompts;
export const analysisLabels={search_trend_ai:'搜索趋势',competition_level:'竞争程度',blue_ocean_potential:'蓝海潜力',brand_risk:'品牌风险',infringement_risk:'侵权风险',category_restriction:'类目限制',certification_analysis:'认证分析',compliance_risk:'合规风险',product_recommendation:'产品建议',target_audience:'目标人群',seasonality:'季节性',fda_required:'FDA',standard_product_type:'标品属性',improvement_potential:'改进空间',is_electric:'带电',repurchase:'复购',overall_score:'综合评分',llm_reason:'综合分析',level:'机会等级',rating:'评分',reason:'分析理由'};
function safeApiMessage(value,key){let text=String(value??'');if(key)text=text.split(key).join('（密钥已隐藏）');return text.replace(/sk-[a-zA-Z0-9_-]+/g,'（密钥已隐藏）').replace(/Bearer\s+[^\s"',}]+/gi,'Bearer （已隐藏）').replace(/[\r\n]+/g,' ').slice(0,500);}
export async function requestChat(config,messages,signal,{maxTokens=8192}={}){
 if(!config.apiKey?.trim()||!config.model?.trim())throw new Error('请先在设置中填写 API Key 和模型名称');const url=endpointUrl(config.baseUrl),key=config.apiKey.trim();
 const body={model:config.model.trim(),messages,max_tokens:maxTokens};
 for(let attempt=0;attempt<2;attempt++){
  let res;try{res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify(body),signal,redirect:'error'});}catch(e){if(signal?.aborted)throw new Error('接口请求已超时或中止，请重试。');throw new Error('未连接到中转站，请检查地址、网络与该地址的访问授权。');}
  let result;try{result=await res.json();}catch{throw new Error('接口返回 HTTP '+res.status+'，内容不是 Chat Completions JSON；请检查接口地址。');}
  if(!res.ok){const detail=safeApiMessage(result?.error?.message??result?.message??result?.error??result?.code,key);
   if(attempt===0&&res.status===400&&/max_tokens/i.test(detail)&&/max_completion_tokens/i.test(detail)){delete body.max_tokens;body.max_completion_tokens=maxTokens;continue;}
   const hint={400:'请求参数或模型配置不匹配',401:'密钥无效或未被接受',402:'账户额度不足',403:'该密钥或当前网络没有访问权限',404:'接口路径或模型不存在',429:'请求频率或账户额度受限'}[res.status]||(res.status>=500?'中转站服务异常':'接口请求失败');throw new Error('HTTP '+res.status+' · '+hint+(detail?'：'+detail:''));
  }
  if(!Array.isArray(result?.choices)||!result.choices.length)throw new Error('接口没有返回 Chat Completions 的 choices，请检查接口类型与模型名称');return result;
 }
}
export async function testConnection(config,signal){await requestChat(config,[{role:'user',content:'Reply with OK.'}],signal,{maxTokens:64});return {endpoint:endpointUrl(config.baseUrl),model:config.model.trim()};}
export async function analyze(config,prompt,data,signal,{onResponse}={}){
 const result=await requestChat(config,[{role:'system',content:prompt},{role:'user',content:typeof data==='string'?data:JSON.stringify(data)}],signal),text=result.choices[0]?.message?.content;
 onResponse?.({finishReason:result.choices[0]?.finish_reason});
 if(typeof text!=='string'||!text.trim())throw new Error(result.choices[0]?.finish_reason==='length'?'模型用完输出额度但未返回正文，请使用支持当前分析输出长度的模型。':'模型没有返回文本，请检查中转站接口与模型名称');return text;
}
// Stable per-batch IDs plus keyword checks prevent a shuffled answer attaching to a different row.
export function parseKeywordResults(text,items,template,metadata={}){
 const parsed=readKeywordJson(text,metadata),obj=parsed.value;
 const rows=Array.isArray(obj)?obj:obj?.selected_keywords||obj?.results;if(!Array.isArray(rows))throw new Error('模型结果缺少 selected_keywords 或 results；点击继续将逐词重试');
 const mapped=new Map(),issues=[];
 for(const row of rows){if(!row||typeof row!=='object'||Array.isArray(row)){issues.push('模型结果包含无效记录');continue;}const schemaIssue=contractIssue(row,metadata.outputContract);if(schemaIssue){issues.push(schemaIssue);continue;}const supplied=row.keyword??row.keywords;let index;
 if(row.id!==undefined){if(!Number.isInteger(row.id)||row.id<0||row.id>=items.length){issues.push('返回了不存在的 ID');continue;}index=row.id;if(supplied&&norm(supplied)!==items[index].key){issues.push('关键词与 ID 不一致');continue;}}
 else index=items.findIndex(i=>norm(supplied||'')===i.key);
 if(index<0||index===undefined||mapped.has(index)){issues.push('返回了重复或无法匹配的关键词');continue;}
 const score=row.overall_score??row.rating;
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100){issues.push('评分需在 0–100 之间');continue;}
 const reason=row.llm_reason??row.reason;if(typeof reason!=='string'||!reason.trim()){issues.push('缺少分析理由');continue;}
 if(template==='keyword'){const required=Object.keys(analysisLabels).filter(k=>!['level','rating','reason'].includes(k));if(required.some(k=>row[k]===undefined||row[k]===null||row[k]==='')){issues.push('综合分析缺少部分字段');continue;}}
 mapped.set(index,{...row,id:index,keyword:items[index].keyword,overall_score:score,llm_reason:reason});
 }
 const missing=items.filter((_,idx)=>!mapped.has(idx));if(missing.length&&(parsed.partial||metadata.finishReason==='length'))issues.unshift(parsed.error||'模型输出达到长度上限，部分关键词未返回；点击继续将逐词补齐未完成项');
 return {results:[...mapped].map(([index,result])=>({key:items[index].key,result})),missing,issues};
}
export function buildKeywordPrompt(items,originals,{fields=[],prompt=templates.keyword,site='com',mode='full',outputContract}={}){
 const payload=items.map((item,id)=>({id,keyword:item.keyword,country:site,...(mode!=='ai'?{search:item.data?Object.fromEntries(Object.entries(item.data).filter(([k])=>!['products','top3Images'].includes(k))):null}:{}),original_rows:(originals[item.key]||[]).map(r=>({source:r.source,fields:Object.fromEntries(fields.filter(k=>Object.hasOwn(r.original,k)).map(k=>[k,r.original[k]]))}))}));
 return prompt.replaceAll('{{field_list}}',fields.join('、')||'无额外导入字段').replaceAll('{{keyword_data}}',JSON.stringify(payload))+'\n\n若自定义模板未插入数据，请同时分析以下批次：\n'+(prompt.includes('{{keyword_data}}')?'（数据已在上方提供）':JSON.stringify(payload))+'\n返回 JSON；每条使用以上 id 和 keyword，评分 overall_score（0–100）及 llm_reason，或 rating 及 reason。未知字段保留未知，购买标签只代表页面标签。'+outputContractText(outputContract);
}
export async function runKeywordBatch({items,task,config,originals,signal,request=analyze}){
 const opt=task.aiOptions||{},template=opt.template||'keyword',prompt=buildKeywordPrompt(items,originals,{fields:opt.fields||[],prompt:opt.prompt||templates[template]||templates[opt.baseTemplate]||templates.keyword,site:task.site,mode:task.workflow,outputContract:opt.outputContract});
 let metadata={};const text=await request(config,(opt.system||templates.system)+outputContractText(opt.outputContract),prompt,signal,{onResponse:value=>{metadata=value;}});
 return parseKeywordResults(text,items,opt.outputContract==='detail-v1'?'keyword':template,{...metadata,outputContract:opt.outputContract});
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
