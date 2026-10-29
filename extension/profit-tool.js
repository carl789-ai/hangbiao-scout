import {quoteFbaFee,getFbaPeriodForDate,calculateTailVolumetricWeightG} from './profit/fbaFees.js';
import {calculateFirstLegFreight,calculateVolumetricWeightKg,getProfitMarginThreshold,meetsProfitMarginThreshold,DEFAULT_FIRST_LEG_FREIGHT_RATES} from './profit/firstLegFreight.js';
import {calculateProfit,calculatePriceScenario,findZeroAdBreakEvenPrice,DEFAULT_RETURN_RATE,DEFAULT_AD_RATE} from './profit/profitScenarios.js';
import {resolveProfitSettings} from './profit/settings.js';
const fmt=(value,digits=2)=>value==null?'—':value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const number=value=>value===''||value==null||!Number.isFinite(Number(value))?null:Number(value);
export function readProfitInputs(raw){
 const kg=number(raw.shippingWeightKg),input={...raw,adRate:raw.adRate??String(DEFAULT_AD_RATE),returnRate:raw.returnRate??String(DEFAULT_RETURN_RATE)};
 for(const key of ['price','purchaseRmb','lengthCm','widthCm','heightCm','exchangeRate','quantity','commissionRate','adRate','returnRate','seaTarget','airTarget'])input[key]=number(input[key]);
 input.shippingWeightG=kg===null?0:Number((kg*1000).toPrecision(15));
 input.freightMode=raw.freightMode==='red-express'?'red-express':'sea';
 const rates={sea:number(raw.seaRate),'red-express':number(raw.redRate)};
 return {input,rates};
}
export function evaluateProfit(raw){
 const {input,rates}=readProfitInputs(raw),freight=calculateFirstLegFreight(input,rates);
 const valid=input.price>0&&input.purchaseRmb!==null&&input.purchaseRmb>=0&&input.exchangeRate>0&&Number.isInteger(input.quantity)&&input.quantity>=1&&[input.commissionRate,input.adRate,input.returnRate].every(v=>v!==null&&v>=0&&v<=100);
 const seasons=Object.fromEntries(['regular','peak'].map(period=>{
  const quote=input.feeSite&&input.feeSite!=='com'?null:quoteFbaFee({...input,period,priceUsd:input.price});
  const fbaUsd=quote?.totalFeeUsd??null;
  const result=valid&&freight&&fbaUsd!==null&&fbaUsd>=0?calculateProfit(input,fbaUsd,rates):null;
  return [period,{quote,fbaUsd,result}];
 }));
 const selected=seasons[['regular','peak'].includes(input.detailPeriod)?input.detailPeriod:(input.period==='peak'?'peak':'regular')];
 return {input,rates,...selected,freight,seasons,threshold:getProfitMarginThreshold(input.freightMode,input),marginReached:!!selected.result&&meetsProfitMarginThreshold(selected.result.margin,input.freightMode,input)};
}
export function initProfitTool({storage,onError=console.error,onSettings=()=>{}}={}){
 const $=id=>document.getElementById(id),dialog=$('profitDialog'),form=$('profitForm');
 let ready,scenarioOverrides={};
 const fields={
  cost:[['建议售价','price','$','0.01'],['采购成本','purchaseRmb','¥','0.1'],['汇率','exchangeRate','¥ / $','0.01']],
  package:[['包装长','lengthCm','cm','0.1'],['包装宽','widthCm','cm','0.1'],['包装高','heightCm','cm','0.1'],['包装实重','shippingWeightKg','kg','0.001']],
  settings:[['佣金比例','commissionRate','%','1'],['广告占比','adRate','%','1'],['退货率','returnRate','%','1']]
 };
 for(const [group,list]of Object.entries(fields))for(const [label,key,unit,step,readOnly]of list){
  const l=document.createElement('label'),name=document.createElement('span'),box=document.createElement('div'),el=document.createElement('input'),u=document.createElement('i');
  name.textContent=label;box.className='unit-input'+(readOnly?' readonly-input':'');el.name=key;el.type='number';el.min=['price','exchangeRate','seaRate','redRate'].includes(key)?'0.01':key==='quantity'?'1':'0';el.step=step;el.placeholder='待补';el.setAttribute('aria-label',label);el.readOnly=!!readOnly;
  if(['commissionRate','adRate','returnRate'].includes(key))el.max='100';u.textContent=unit;box.append(el,u);l.append(name,box);$('profit-'+group).append(l);
 }
 const defaults={price:'',purchaseRmb:'',lengthCm:'',widthCm:'',heightCm:'',shippingWeightKg:'',exchangeRate:'',commissionRate:'15',adRate:String(DEFAULT_AD_RATE),returnRate:String(DEFAULT_RETURN_RATE),quantity:'30',seaRate:String(DEFAULT_FIRST_LEG_FREIGHT_RATES.sea),redRate:String(DEFAULT_FIRST_LEG_FREIGHT_RATES['red-express']),seaTarget:'20',airTarget:'15',freightMode:'sea',period:getFbaPeriodForDate(new Date())||'regular',detailPeriod:getFbaPeriodForDate(new Date())||'regular',feeSite:'com'};
 const rawInputs=()=>Object.fromEntries(Object.keys(defaults).map(key=>[key,form.elements[key].value]));
 function pairs(host,entries){host.replaceChildren();for(const [label,value]of entries){const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;d.append(dt,dd);host.append(d);}}
 function scenarioFor(state,price,zero){
  if(price===null||price<=0||!state.result)return {result:null,fbaUsd:null};
  return calculatePriceScenario({...state.input,period:state.input.detailPeriod},price,state.rates,zero);
 }
 function renderScenarios(state){
  const {input,rates,result,quote,freight,fbaUsd}=state,host=$('profitScenarioRows');host.replaceChildren();
  let breakEven=null;
  if(result&&freight&&quote?.quoted)breakEven=findZeroAdBreakEvenPrice({...input,period:input.detailPeriod},rates);
  const names={even:'零广告保本',lower:'低于当前价',current:'当前售价',higher:'高于当前价'},defaults={even:breakEven,lower:input.price==null?null:input.price-2,current:input.price,higher:input.price==null?null:input.price+2};
  const rows=Object.keys(names).map((id,index)=>({id,index,raw:scenarioOverrides[id]?.raw??(defaults[id]==null?'':defaults[id].toFixed(2)),sortRaw:scenarioOverrides[id]?.sortRaw??defaults[id]})).sort((a,b)=>a.id==='even'?-1:b.id==='even'?1:(number(a.sortRaw)??Infinity)-(number(b.sortRaw)??Infinity)||a.index-b.index);
  for(const entry of rows){
   const tr=document.createElement('tr'),first=document.createElement('td'),label=document.createElement('label'),title=document.createElement('span'),box=document.createElement('div'),currency=document.createElement('i'),trial=document.createElement('input');
   title.textContent=entry.id==='even'&&scenarioOverrides.even?'零广告试算':names[entry.id];box.className='unit-input';currency.textContent='$';trial.type='number';trial.step='0.01';trial.min='0.01';trial.value=entry.raw;trial.setAttribute('aria-label',names[entry.id]+'情景售价');box.append(trial,currency);label.append(title,box);first.append(label);tr.append(first);
   const cells=Array.from({length:4},()=>{const td=document.createElement('td');tr.append(td);return td;});
   const update=()=>{const scenario=scenarioFor(state,number(trial.value),entry.id==='even'),r=scenario.result;cells[0].textContent=r?fmt(r.margin)+'%':'—';cells[0].className=r?(r.profitUsd>=0?'positive':'negative'):'';cells[1].textContent=scenario.fbaUsd==null?'—':'$'+fmt(scenario.fbaUsd);cells[2].textContent=r?'$'+fmt(r.profitUsd,3):'—';cells[3].textContent=r?'¥'+fmt(r.profitUsd*input.exchangeRate*input.quantity,0):'—';};
   trial.oninput=()=>{scenarioOverrides[entry.id]={raw:trial.value,sortRaw:entry.sortRaw};update();};trial.onchange=()=>{scenarioOverrides[entry.id]={raw:trial.value,sortRaw:trial.value};renderScenarios(state);};update();host.append(tr);
  }
  $('profitScenarioQuantity').textContent=(input.quantity??'首批')+' 套净利润';
 }
 async function render(persist=true){
  const raw=rawInputs(),state=evaluateProfit(raw),{input,rates,quote,fbaUsd,freight,result,threshold,marginReached,seasons}=state,mode=input.freightMode==='red-express'?'空运 / 红单':'海运';
  const volume=calculateVolumetricWeightKg(input),tail=calculateTailVolumetricWeightG(input);
  $('profitVolume').textContent=volume==null?'—':volume.toFixed(3);$('profitTailVolume').textContent=tail==null?'—':(tail/1000).toFixed(3);$('profitFreight').textContent=freight?fmt(freight.freightRmb):'—';
  $('profitDefaultsSummary').textContent='首批 '+input.quantity+' 套 · '+mode+'目标净利率 '+threshold+'%';
  $('profitRateSummary').textContent=mode+' ¥'+(input.freightMode==='sea'?raw.seaRate:raw.redRate)+'/kg · 计费 '+(freight?fmt(freight.chargeableWeightKg,3)+' kg':'—');
  for(const [period,season]of Object.entries(seasons)){
   const r=season.result;
   const usd=$('profit-'+period+'-usd'),cny=$('profit-'+period+'-cny'),margin=$('profit-'+period+'-margin'),roi=$('profit-'+period+'-roi');
   usd.textContent=r?'$'+fmt(r.profitUsd):'—';cny.textContent=r?'¥'+fmt(r.profitUsd*input.exchangeRate):'—';margin.textContent=r?fmt(r.margin)+'%':'—';roi.textContent=r&&r.roi!==null?fmt(r.roi)+'%':'—';
   for(const cell of [usd,cny,margin,roi]){cell.classList.toggle('positive',!!r&&r.profitUsd>=0);cell.classList.toggle('negative',!!r&&r.profitUsd<0);}
   $('profit-'+period+'-fee').textContent=season.fbaUsd==null?'FBA —':'FBA $'+fmt(season.fbaUsd);
  }
  const seasonLabel=input.detailPeriod==='peak'?'旺季':'淡季',validResults=Object.values(seasons).filter(s=>s.result).length;
  $('profitResultStatus').textContent=input.feeSite!=='com'?'美国站费表':validResults===2?'实时测算':'待补成本';
  $('profitTarget').textContent=input.feeSite!=='com'?'此工具使用美国站非服装 FBA 费表':result?mode+' · '+seasonLabel+'净利率'+(marginReached?'达到':'低于')+' '+threshold+'% 目标':'补齐售价、采购、包装与汇率';
  $('profitTarget').classList.toggle('profit-below-target',!!result&&!marginReached);
  $('profitCapital').textContent=input.purchaseRmb!==null&&freight&&Number.isInteger(input.quantity)&&input.quantity>=1?'¥'+fmt((input.purchaseRmb+freight.freightRmb)*input.quantity,0):'—';
  $('profitBatchLabel').textContent=seasonLabel+' · '+(input.quantity??'首批')+' 套净利润';$('profitBatch').textContent=result?'¥'+fmt(result.profitUsd*input.exchangeRate*input.quantity,0):'—';
  $('profitCostPeriod').textContent=seasonLabel+' · USD / 套';
  const costs=result?[['采购',result.purchaseUsd],['头程',result.firstLegUsd],['FBA 配送费',quote.fulfillmentFeeUsd],['燃油附加费（3.5%）',quote.fuelSurchargeUsd],['佣金',result.commissionUsd],['广告',result.adUsd],['退货损耗',result.returnLossUsd],['净利润',result.profitUsd]]:[];
  pairs($('profitCosts'),costs.map(([label,value])=>[label,'$'+fmt(value)]));
  if(!costs.length)$('profitCosts').textContent='补齐成本后显示';
  for(const button of document.querySelectorAll('[data-profit-season]'))button.setAttribute('aria-pressed',String(button.dataset.profitSeason===input.detailPeriod));
  renderScenarios(state);if(persist)await storage?.set({profitInputs:{...raw,version:4}});return state;
 }
 const applySettings=settings=>{for(const [key,value]of Object.entries({quantity:settings.quantity,seaRate:settings.sea,redRate:settings['red-express'],seaTarget:settings.seaTarget,airTarget:settings.airTarget}))form.elements[key].value=value;};
 form.oninput=()=>render().catch(onError);
 for(const button of document.querySelectorAll('[data-profit-season]'))button.onclick=()=>{form.elements.detailPeriod.value=button.dataset.profitSeason;form.elements.period.value=button.dataset.profitSeason;render().catch(onError);};form.onsubmit=e=>{e.preventDefault();render().catch(onError);};$('closeProfit').onclick=()=>dialog.close();
 $('profitEditDefaults').onclick=()=>{dialog.close();onSettings();};
 ready=(async()=>{const savedSettings=await storage?.get(['profitInputs','profitDefaults']),saved=savedSettings?.profitInputs||{};const migrated=saved.version>=2?saved:{...saved,shippingWeightKg:saved.shippingWeightG==null?'':String(Number(saved.shippingWeightG)/1000)};if(!['regular','peak'].includes(migrated.detailPeriod))migrated.detailPeriod=migrated.period==='peak'?'peak':'regular';migrated.period=migrated.detailPeriod;for(const [key,value]of Object.entries({...defaults,...migrated}))if(form.elements[key])form.elements[key].value=value;applySettings(resolveProfitSettings(savedSettings?.profitDefaults,saved));await render(false);})();ready.catch(onError);
 return async(price,unsupportedSite=false)=>{await ready;const saved=await storage?.get(['profitInputs','profitDefaults']);applySettings(resolveProfitSettings(saved?.profitDefaults,saved?.profitInputs));form.elements.feeSite.value=unsupportedSite?'unsupported':'com';if(price!=null)form.elements.price.value=price;scenarioOverrides={};dialog.showModal();await render(false);};
}
