import {csvCell,PARSER_VERSION} from './core.js';
import {node,fmt,searchUrl} from './research-view.js';

const currencies={com:'USD',de:'EUR',fr:'EUR','co.uk':'GBP','co.jp':'JPY',ca:'CAD',it:'EUR',es:'EUR'};
function amazonLink(url,site,fallback){try{const u=new URL(url);if(u.protocol==='https:'&&u.hostname===`www.amazon.${site}`)return u.href;}catch{}return fallback;}
export function sampleContext(context){
 const {item,task,rows=[]}=context,site=task.site||'com',data=item.data||{};
 return {...context,rows,site,currency:currencies[site]||site,sourceUrl:amazonLink(data.url,site,searchUrl(item.keyword,site)),products:data.products||[],collectedAt:data.collectedAt||'',sources:[...new Set(rows.map(r=>r.source))]};
}
export function renderSamples(container,context){
 const c=sampleContext(context);Object.assign(context,c);container.replaceChildren();
 const meta=node('dl',undefined,'sample-meta');
 for(const [label,value]of [['来源','Amazon 搜索页'],['采集时间',c.collectedAt?new Date(c.collectedAt).toLocaleString():'尚未采集'],['已存样本',c.products.length+' 个商品'],['任务',c.task.name]]){const row=node('div');row.append(node('dt',label),node('dd',value));meta.append(row);}container.append(meta);
 const source=node('p',undefined,'sample-source'),link=node('a',c.sourceUrl);link.href=c.sourceUrl;link.target='_blank';link.rel='noopener';source.append(link);container.append(source);
 container.append(node('p','以下为该关键词本次采集保存的自然商品样本，已去除广告并按 ASIN 去重。点击商品可到 Amazon 核对。','sample-explanation'));
 if(c.item.data&&c.item.data.parserVersion!==PARSER_VERSION)container.append(node('p','此关键词使用旧版解析，评论与蓝海指标待重新核验。','issue'));
 if(!c.products.length){const empty=node('div',undefined,'sample-empty');empty.append(node('h3',c.item.data?.outcome==='non_search_redirect'?'Amazon 跳转到了专题页':'尚无已存商品样本'),node('p',c.item.data?.outcome==='non_search_redirect'?'此词未返回搜索结果页，没有商品样本与搜索指标。':c.item.error?.message||'此关键词尚未采集到商品样本，完成采集后再查看。'));container.append(empty);}
 else{
  const wrap=node('div',undefined,'sample-table-wrap');wrap.tabIndex=0;wrap.setAttribute('aria-label','已保存商品样本表格');
  const table=node('table',undefined,'sample-table'),head=node('thead'),header=node('tr');
  for(const label of ['序号','商品 / ASIN','价格（'+c.currency+'）','评论数','评分','购买标签'])header.append(node('th',label));head.append(header);table.append(head);
  const body=node('tbody');c.products.forEach((p,i)=>{const tr=node('tr'),index=node('td',String(i+1)),info=node('td',undefined,'sample-product');index.dataset.label='序号';
   const image=node('img');if(/^https:\/\//.test(p.imageUrl||'')){image.src=p.imageUrl;image.alt='';image.loading='lazy';image.referrerPolicy='no-referrer';info.append(image);}
   const text=node('div'),a=node('a',p.title||p.asin);a.href=amazonLink(p.url,c.site,`https://www.amazon.${c.site}/dp/${encodeURIComponent(p.asin||'')}`);a.target='_blank';a.rel='noopener';text.append(a,node('small',p.asin));info.append(text);tr.append(index,info);
   for(const [label,value,digits]of [['价格',p.price,2],['评论数',p.reviews,0],['评分',p.rating,1],['购买标签',p.purchaseLabelCount,0]]){const td=node('td',fmt(value,digits));td.dataset.label=label;tr.append(td);}body.append(tr);
  });table.append(body);wrap.append(table);container.append(wrap);
 }
 if(c.rows.length){const originals=node('details',undefined,'sample-originals');originals.append(node('summary','导入来源 · '+c.rows.length+' 条原始行'));for(const row of c.rows){originals.append(node('h3',row.source));const dl=node('dl',undefined,'original-fields');for(const [key,value]of Object.entries(row.original||{})){const div=node('div');div.append(node('dt',key),node('dd',value==null?'—':typeof value==='object'?JSON.stringify(value):String(value)));dl.append(div);}originals.append(dl);}container.append(originals);}
}
export function* sampleCsv(context){
 const c=sampleContext(context);
 yield '\uFEFF'+['序号','关键词','ASIN','商品标题','价格','币种','评论数','评分','购买标签数量','商品链接','图片链接','采集时间','Amazon 搜索页','任务','导入来源'].map(csvCell).join(',')+'\r\n';
 for(let i=0;i<c.products.length;i++){const p=c.products[i];yield [i+1,c.item.keyword,p.asin,p.title,p.price,c.currency,p.reviews,p.rating,p.purchaseLabelCount,amazonLink(p.url,c.site,`https://www.amazon.${c.site}/dp/${encodeURIComponent(p.asin||'')}`),p.imageUrl,c.collectedAt,c.sourceUrl,c.task.name,c.sources.join('；')].map(csvCell).join(',')+'\r\n';}
}
