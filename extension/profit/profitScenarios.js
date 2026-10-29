// Shared by the main calculator and editable price scenarios.
import {quoteFbaFee} from './fbaFees.js';
import {calculateFirstLegFreight,DEFAULT_FIRST_LEG_FREIGHT_RATES} from './firstLegFreight.js';
export const DEFAULT_RETURN_RATE = 5;
export const DEFAULT_AD_RATE = 15;
const returnRate = inputs => inputs.returnRate === undefined ? DEFAULT_RETURN_RATE : inputs.returnRate;
function validCosts(inputs) {
  return inputs.purchaseRmb !== null && Number.isFinite(inputs.purchaseRmb) && inputs.purchaseRmb >= 0
    && Number.isFinite(inputs.exchangeRate) && inputs.exchangeRate > 0
    && [inputs.commissionRate,inputs.adRate,returnRate(inputs)].every(value => Number.isFinite(value) && value >= 0 && value <= 100);
}
export function calculateProfit(inputs,fbaUsd,rates=DEFAULT_FIRST_LEG_FREIGHT_RATES) {
  const freight=calculateFirstLegFreight(inputs,rates);
  if (!validCosts(inputs) || !freight || !Number.isFinite(inputs.price) || inputs.price <= 0 || !Number.isFinite(fbaUsd) || fbaUsd < 0) return null;
  const purchaseUsd=inputs.purchaseRmb/inputs.exchangeRate,firstLegUsd=freight.freightRmb/inputs.exchangeRate;
  const commissionUsd=inputs.price*inputs.commissionRate/100,adUsd=inputs.price*inputs.adRate/100;
  // Reserve a loss equal to the returned share of sales. No inventory recovery
  // or commission rebate is assumed; the original unit costs remain incurred.
  const returnLossUsd=inputs.price*returnRate(inputs)/100;
  const inventoryCostUsd=purchaseUsd+firstLegUsd;
  const profitUsd=inputs.price-inventoryCostUsd-fbaUsd-commissionUsd-adUsd-returnLossUsd;
  return {purchaseUsd,firstLegUsd,commissionUsd,adUsd,returnLossUsd,inventoryCostUsd,profitUsd,
    margin:profitUsd/inputs.price*100,roi:inventoryCostUsd>0?profitUsd/inventoryCostUsd*100:null};
}
export function calculatePriceScenario(inputs,price,rates,zeroAds=false) {
  const trial={...inputs,price:price??0,adRate:zeroAds?0:inputs.adRate};
  const quote=quoteFbaFee({...trial,priceUsd:trial.price}),fbaUsd=quote.totalFeeUsd;
  const result=price===null?null:calculateProfit(trial,fbaUsd,rates);
  return {quote,fbaUsd,result};
}
/** Solve each actual FBA price band, including the return-loss reserve. */
export function findZeroAdBreakEvenPrice(inputs,rates) {
  const trial={...inputs,adRate:0},freight=calculateFirstLegFreight(trial,rates);
  if (!validCosts(trial) || !freight) return null;
  const contribution=1-(trial.commissionRate+returnRate(trial))/100;
  if (contribution<=0) return null;
  const fixedCost=(trial.purchaseRmb+freight.freightRmb)/trial.exchangeRate,candidates=[];
  for (const [min,max] of [[0.01,9.99],[10,50],[50.01,Infinity]]) {
    const quote=quoteFbaFee({...trial,priceUsd:min});
    if (!quote.confirmationReady || quote.totalFeeUsd===null) continue;
    const raw=Math.max(min,(fixedCost+quote.totalFeeUsd)/contribution);
    let price=Math.ceil(raw*100-Number.EPSILON*Math.max(1,raw*100)*8)/100;
    if (!Number.isFinite(price) || price>max) continue;
    let result=calculatePriceScenario(trial,price,rates,true).result;
    const tolerance=Number.EPSILON*Math.max(1,price,fixedCost)*16;
    if (result && result.profitUsd < -tolerance) {
      price=Math.round((price+.01)*100)/100;
      result=calculatePriceScenario(trial,price,rates,true).result;
    }
    if (price<=max && result && result.profitUsd>=-tolerance) candidates.push(price);
  }
  return candidates.length?Math.min(...candidates):null;
}
