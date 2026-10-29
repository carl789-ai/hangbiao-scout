import {PARSER_VERSION,SITES} from './core.js';import {analysisLabels} from './ai.js';
export const fmt=(n,d=0)=>n==null?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d});
export const searchUrl=(keyword,site='com')=>`https://www.amazon.${SITES[site]?site:'com'}/s?k=${encodeURIComponent(keyword)}`;
export function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
export function largeImageUrl(value){try{const u=new URL(value);if(u.protocol==='https:'&&/^(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com)$/.test(u.hostname))u.pathname=u.pathname.replace(/\._(?:AC|SL|SX|SY|UX|UY|UL|SS)[^.]*_\.(jpe?g|png|webp)$/i,'.$1');return u.href;}catch{return value;}}
function previewKeywordImage(url){
 let dialog=document.getElementById('keywordImageDialog');
 if(!dialog){dialog=node('dialog',undefined,'keyword-image-dialog');dialog.id='keywordImageDialog';const heading=node('div',undefined,'dialog-heading'),close=node('button','×');close.type='button';close.setAttribute('aria-label','关闭商品图片');close.onclick=()=>dialog.close();heading.append(node('h2','商品图片'),close);const image=node('img');image.alt='本次采集的商品图片';image.referrerPolicy='no-referrer';dialog.append(heading,image);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{if(!dialog.open)dialog.querySelector('img').removeAttribute('src');});document.body.append(dialog);}
 const image=dialog.querySelector('img');image.onerror=()=>{image.onerror=null;if(dialog.open)image.src=url;};image.src=largeImageUrl(url);dialog.showModal();
}
export function metricPairs(data){const d=data||{};return [['搜索结果数',fmt(d.totalResults)+(d.totalResultsRelation==='gte'?'+':'')],['蓝海值',fmt(d.lowReviewItemsCount)],['蓝海比率',d.homeBlueSeaRatio==null?'—':fmt(d.homeBlueSeaRatio*100,1)+'%'],['购买标签合计',fmt(d.totalSales)],['低评论商品购买标签',fmt(d.lowReviewTotalSales)],['平均评论',fmt(d.averageReviews,1)],['平均评分',fmt(d.averageRating,2)],['平均价格',fmt(d.averagePrice,2)],['未知评论商品',fmt(d.unknownReviewItems)]];}
export function analysisCard(record,{showScore=true,showReason=true}={}){const wrap=node('div',undefined,'ai-card');if(!record){wrap.append(node('p','尚未分析'));return wrap;}if(record.state!=='done'){wrap.append(node('p',record.state==='working'?'正在分析…':record.error||'等待分析'));return wrap;}const r=record.result||{};if(showScore){const heading=node('div',undefined,'ai-score-heading');heading.append(node('strong',fmt(r.overall_score??r.rating)+'/100'),node('span',r.level||'综合评分'));wrap.append(heading);}if(showReason)wrap.append(node('p',r.llm_reason||r.reason||''));const list=node('dl',undefined,'analysis-fields');for(const [key,label]of Object.entries(analysisLabels)){if(['llm_reason','reason','level','overall_score','rating'].includes(key)||r[key]==null)continue;const compact=['seasonality','fda_required','standard_product_type','improvement_potential','is_electric','repurchase'].includes(key)&&String(r[key]).length<=24;const div=node('div',undefined,compact?undefined:'analysis-field-wide');div.append(node('dt',label),node('dd',r[key]===true||r[key]==='true'?'是':r[key]===false||r[key]==='false'?'否':String(r[key])));list.append(div);}wrap.append(list);return wrap;}
function analysisText(value){return value===true||value==='true'?'是':value===false||value==='false'?'否':String(value);}
function inlineAnalysis(record){
 const wrap=node('div',undefined,'inline-ai-analysis');wrap.dataset.state=record?.state||'pending';
 const head=node('div',undefined,'ai-compact-head');head.append(node('strong','AI 研判','ai-compact-label'));wrap.append(head);
 if(record?.state!=='done'){head.append(node('span',record?.state==='working'?'分析中':record?.state==='failed'?'待补齐':'未分析','ai-compact-meta'));if(record?.state==='failed'&&record.error)wrap.append(node('p',record.error,'ai-compact-reason'));return wrap;}
 const r=record.result||{};
 if(r.level)head.append(node('span',r.level,'ai-compact-level'));
 const score=r.overall_score??r.rating;if(score!=null){const rating=node('span','评分 ','ai-compact-rating');rating.append(node('strong',fmt(score)+'/100'));head.append(rating);}
 for(const [key,label]of [['seasonality','季节性'],['standard_product_type',''],['repurchase','']]){if(r[key]!=null&&r[key]!=='')head.append(node('span',(label?label+'：':'')+analysisText(r[key]),'ai-compact-meta'));}
 const brief=node('div',undefined,'ai-compact-brief');
 for(const [key,label]of [['brand_risk','品牌风险'],['infringement_risk','侵权风险'],['improvement_potential','改良空间'],['is_electric','带电'],['fda_required','FDA']]){if(r[key]!=null&&r[key]!==''){const text=analysisText(r[key]),field=node('span',label+'：'+text);if(['brand_risk','infringement_risk'].includes(key)&&/^高(?:风险)?(?:[，,。；;：:\s]|$)/.test(text.trim()))field.className='ai-risk-high';brief.append(field);}}
 if(brief.children.length)wrap.append(brief);
 const reason=r.llm_reason||r.reason;if(reason)wrap.append(node('p',reason,'ai-compact-reason'));
 const hasDetail=Object.keys(analysisLabels).some(key=>!['llm_reason','reason','level','overall_score','rating'].includes(key)&&r[key]!=null);
 if(hasDetail){const details=node('details',undefined,'ai-compact-details'),toggle=node('summary','查看详细分析');details.append(toggle,analysisCard(record,{showScore:false,showReason:false}));details.addEventListener('toggle',()=>{toggle.textContent=details.open?'收起详细分析':'查看详细分析';});wrap.append(details);}
 return wrap;
}
export function keywordRow(item,site,onDetail,template='keyword',mode='collect',onAnalysis=null){
 const tr=node('tr'),d=item.data,first=node('td'),recordWrap=node('div',undefined,'keyword-record'),text=node('div',undefined,'keyword-text'),link=node('a',item.keyword,'keyword-link');link.href=searchUrl(item.keyword,site);link.target='_blank';link.rel='noopener';link.title='打开 Amazon 搜索页';text.append(link);
 if(item.keywordChinese&&item.keywordChinese!==item.keyword)text.append(node('small',item.keywordChinese,'keyword-chinese'));recordWrap.append(text);if(d?.top3Images?.length){const images=node('div',undefined,'keyword-thumbnails');for(const url of d.top3Images){if(!/^https:\/\//.test(url))continue;const button=node('button',undefined,'keyword-image-button');button.type='button';button.setAttribute('aria-label','查看商品大图 '+(images.children.length+1));button.onclick=()=>previewKeywordImage(url);const image=node('img');image.src=url;image.alt='商品样本';image.loading='lazy';image.referrerPolicy='no-referrer';button.append(image);images.append(button);}recordWrap.append(images);}first.append(recordWrap);tr.append(first);
 const statusCell=node('td'),status=node('span',{done:d?.outcome==='non_search_redirect'?'专题跳转':d?.parserVersion!==PARSER_VERSION?'旧版待核验':'已采集',pending:mode==='ai'?'未采集':'等待采集',working:'采集中',failed:'待重试'}[item.status],'status '+item.status);statusCell.append(status);if(item.error)statusCell.title=item.error.message;tr.append(statusCell);
 const metrics=metricPairs(d);for(const idx of [0,1,2,3]){const [label,value]=metrics[idx],td=node('td',value);td.dataset.label=label;tr.append(td);}
 for(const [label,value]of [['均价',fmt(d?.averagePrice,2)],['平均评论',fmt(d?.averageReviews,1)],['平均评分',fmt(d?.averageRating,2)]]){const td=node('td',value);td.dataset.label=label;tr.append(td);}
 const action=node('td'),btn=node('button','资料','text-action');btn.onclick=()=>onDetail(item.key);action.append(btn);tr.append(action);return tr;
}
export function keywordAnalysisRow(item,template='keyword'){const tr=node('tr',undefined,'keyword-ai-row'),td=node('td');td.colSpan=10;td.append(inlineAnalysis(item.analysis?.[template]));tr.append(td);return tr;}
export function renderDetail(container,item,rows,template='keyword'){
 container.replaceChildren();const d=item.data;const metrics=node('dl',undefined,'detail-metrics');for(const [label,value]of metricPairs(d)){const el=node('div');el.append(node('dt',label),node('dd',value));metrics.append(el);}container.append(metrics);
 if(d?.outcome==='non_search_redirect')container.append(node('p','Amazon 将此词跳转到专题页，本次没有搜索指标。','issue'));
 if(item.error)container.append(node('p',item.error.message,'issue'));
 if(item.analysis?.[template]){const details=node('details',undefined,'detail-ai-analysis');details.open=true;details.append(node('summary','AI 分析'),analysisCard(item.analysis[template]));container.append(details);}
 const originals=node('details'),summary=node('summary','导入字段与来源 · '+rows.length+' 条原始行');originals.append(summary);for(const row of rows){originals.append(node('h4',row.source));const dl=node('dl',undefined,'original-fields');for(const [key,value]of Object.entries(row.original)){const div=node('div');div.append(node('dt',key),node('dd',typeof value==='object'?JSON.stringify(value):String(value??'—')));dl.append(div);}originals.append(dl);}container.append(originals);
 if(d?.collectedAt)container.append(node('small','采集时间：'+new Date(d.collectedAt).toLocaleString(),'footnote'));
}
