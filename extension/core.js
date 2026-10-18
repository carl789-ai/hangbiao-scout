export const SITES = {com:'美国',de:'德国',fr:'法国','co.uk':'英国','co.jp':'日本',ca:'加拿大',it:'意大利',es:'西班牙'};
export function keywordOf(row) {
 const aliases=['搜索词','关键词','搜索关键词','searchterm','searchterms','keyword','keywords','searchquery'];
 const key=Object.keys(row).find(k=>aliases.includes(k.replace(/[\s_\-]/g,'').toLowerCase()));
 return key?String(row[key]??'').trim():'';
}
export const norm = value => String(value??'').trim().toLocaleLowerCase('en-US');
export function summary(items) {
 let total=0,completed=0,failed=0,search=0,redirect=0,working=0;
 for(const i of items){total++;if(i.status==='done'){completed++;if(i.data?.outcome==='non_search_redirect')redirect++;else search++;}else if(i.status==='failed')failed++;else if(i.status==='working')working++;}
 return {total,completed,failed,search,redirect,working,pending:total-completed,untouched:total-completed-failed-working};
}
export function number(text) {
 if(text==null||!String(text).trim())return null;
 let s=String(text).replace(/\u00a0/g,' ').trim();
 const m=s.match(/([\d][\d.,\s]*)\s*([kKmM])?/);if(!m)return null;
 let n=m[1].replace(/\s/g,'');
 if(m[2]){if(n.includes(',')&&!n.includes('.'))n=n.replace(',','.');else n=n.replace(/,/g,'');return Math.round(Number(n)*({k:1000,m:1e6}[m[2].toLowerCase()]));}
 if(/^\d{1,3}(?:[.,]\d{3})+$/.test(n))n=n.replace(/[.,]/g,'');
 else if(n.includes(',')&&n.includes('.')&&n.lastIndexOf(',')>n.lastIndexOf('.'))n=n.replace(/\./g,'').replace(',','.');
 else if(n.includes(',')&&!n.includes('.'))n=n.replace(',','.');else n=n.replace(/,/g,'');
 return Number.isFinite(Number(n))?Number(n):null;
}
export function purchaseLabel(text){const m=String(text||'').match(/(\d[\d.,]*\s*[KkMm]?\+?)\s*(?:bought|gekauft|achet[ée]s?|acquistat[ioe]|comprados?)/i);return m?number(m[1]):null;}
export class CollectionError extends Error{constructor(message,kind='network'){super(message);this.kind=kind;}}
export function parseSearch(html,keyword,site='com',parse=html=>new DOMParser().parseFromString(html,'text/html')){
 const doc=parse(html), title=doc.title||'';
 if(doc.querySelector('form[action*="validateCaptcha"],#captchacharacters')||/captcha|robot check|sorry! something went wrong/i.test(title)||/sorry[,!]?\s*we (?:just )?need to make sure/i.test(doc.body?.textContent||''))throw new CollectionError('Amazon 返回验证页或错误页，请在浏览器确认后继续。','blocked');
 if(!doc.querySelector('.s-result-list')){
  const match=html.match(/window\.location\.replace\(\s*("(?:\\.|[^"\\])*")\s*\)/);
  let dest;try{dest=match?new URL(JSON.parse(match[1]),`https://www.amazon.${site}`):null;}catch{}
  if(dest?.hostname===`www.amazon.${site}`&&/^\/(b|shop|stores)(\/|$)/.test(dest.pathname))return {keyword,outcome:'non_search_redirect',redirectUrl:dest.href,url:`https://www.amazon.${site}/s?k=${encodeURIComponent(keyword)}`,uniqueAsinCount:null,lowReviewItemsCount:null,homeBlueSeaRatio:null,totalResults:null,totalSales:null,lowReviewTotalSales:null,averagePrice:null,averageReviews:null,averageRating:null,products:[],collectedAt:new Date().toISOString()};
  throw new CollectionError('未找到有效搜索结果，可能是 Amazon 错误页（变狗）或页面结构变化。','invalid_page');
 }
 const products=[], seen=new Set();
 for(const el of doc.querySelectorAll('[data-component-type="s-search-result"]')){
  const asin=el.getAttribute('data-asin');if(!asin||seen.has(asin)||el.querySelector('.puis-sponsored-label-text,.s-sponsored-label-text,span[class*="sponsored"]'))continue;
  seen.add(asin);
  const block=el.querySelector('[data-cy="reviews-block"]');
  const label=Array.from(block?.querySelectorAll('a[aria-label]')||[]).map(a=>a.getAttribute('aria-label')).find(t=>/ratings?|reviews?|bewertungen|évaluations|avis|recensioni|valoraciones|評価/i.test(t));
  const reviewText=label||block?.querySelector('a[href*="#customerReviews"] span,.s-underline-text')?.textContent;
  // Compatibility rule: an unreadable review count is treated as zero, but remains explicitly flagged.
  const reviews=number(reviewText), price=number(el.querySelector('.a-price .a-offscreen')?.textContent), rating=number(el.querySelector('.a-icon-alt')?.textContent);
  const bought=Array.from(el.querySelectorAll('.a-size-base.a-color-secondary')).map(e=>purchaseLabel(e.textContent)).find(n=>n!=null)??null;
  const img=el.querySelector('.s-image');let imageUrl=img?.getAttribute('src')||img?.getAttribute('data-src')||'';if(!/^https:\/\//.test(imageUrl))imageUrl='';
  products.push({asin,title:el.querySelector('h2')?.textContent?.trim()||asin,price,reviews,rating,purchaseLabelCount:bought,imageUrl,url:`https://www.amazon.${site}/dp/${asin}`});
 }
 if(!products.length && !/no results|keine ergebnisse|aucun résultat|没有结果|一致する商品はありません/i.test(doc.body?.textContent||''))throw new CollectionError('搜索页没有可解析的自然商品，已暂停以免记录错误的零值。','invalid_page');
 const low=products.filter(p=>(p.reviews??0)<=100), n=products.length;
 const avg=key=>{const known=products.filter(p=>p[key]!=null);return known.length?known.reduce((s,p)=>s+p[key],0)/known.length:null;};
 const breadcrumb=doc.querySelector('.s-breadcrumb')?.textContent||'';
 const total=breadcrumb.match(/(?:of\s+(?:over\s+)?|sur\s+(?:plus de\s+)?|von\s+(?:mehr als\s+)?)([\d.,]+)\s*(?:results?|résultats?|Ergebnissen)/i);
 return {keyword,outcome:'search',url:`https://www.amazon.${site}/s?k=${encodeURIComponent(keyword)}`,uniqueAsinCount:n,lowReviewItemsCount:low.length,homeBlueSeaRatio:n?low.length/n:0,unknownReviewItems:products.filter(p=>p.reviews==null).length,totalResults:total?number(total[1]):null,totalSales:products.reduce((s,p)=>s+(p.purchaseLabelCount||0),0),lowReviewTotalSales:low.reduce((s,p)=>s+(p.purchaseLabelCount||0),0),averagePrice:avg('price'),averageReviews:avg('reviews'),averageRating:avg('rating'),products,collectedAt:new Date().toISOString()};
}
export function calculateProfit(e){
 const n=k=>Number(e[k]||0);const price=n('price'), orders=n('adOrders')+n('organicOrders');
 if(!(price>0)||!(orders>0)||Object.values(e).some(v=>!Number.isFinite(Number(v))||Number(v)<0))throw new Error('请输入非负数字，售价和总订单数须大于零。');
 const keep=1-Math.min(100,n('returnRatePercent'))/100, commission=Math.min(100,n('commissionPercent'))/100;
 const allocatedAdCost=n('adOrderCost')*n('adOrders')/orders;
 const profit=price*keep*(1-commission)-n('purchaseCost')-n('inboundShipping')-n('fbaFee')-n('otherFees')-allocatedAdCost;
 return {profit,allocatedAdCost,margin:profit/price};
}
export function endpointUrl(base){const u=new URL(String(base).trim());if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('请输入 http 或 https 的接口根地址，不包含账号、查询参数或片段。');u.pathname=u.pathname.replace(/\/+$/,'');if(!u.pathname.endsWith('/chat/completions'))u.pathname+='/chat/completions';return u.href;}
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else cell+=c;}else if(!quoted&&(c===','||c==='\t')){row.push(cell);cell='';}else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw new Error('CSV 引号未闭合');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 if(!rows.length)return [];
 const headers=rows.shift().map((h,i)=>h.replace(/^\uFEFF/,'').trim()||`列${i+1}`);
 if(new Set(headers).size!==headers.length)throw new Error('表头有重复列名，请先区分列名以免覆盖原字段。');
 return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}
export const csvCell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
