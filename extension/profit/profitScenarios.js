// Ported from the owner’s 4175 calculator. No project records or configuration included.
import { quoteFbaFee,                } from "./fbaFees.js";
import { calculateFirstLegFreight, DEFAULT_FIRST_LEG_FREIGHT_RATES,                                                      } from "./firstLegFreight.js";

                                                                
                
                             
                         
                 
                       
                    
 

                                          
                      
                      
                        
                
                    
                 
 

/** The existing main calculation formula, also used by independent price trials. */
export function calculateProfit(inputs                  , fbaUsd        , rates                              = DEFAULT_FIRST_LEG_FREIGHT_RATES)                                 {
  const firstLegQuote = calculateFirstLegFreight(inputs, rates);
  if (inputs.purchaseRmb === null || firstLegQuote === null) return null;
  const safePrice = Math.max(0.01, inputs.price);
  const safeExchangeRate = Math.max(0.01, inputs.exchangeRate);
  const purchaseUsd = Math.max(0, inputs.purchaseRmb) / safeExchangeRate;
  const firstLegUsd = firstLegQuote.freightRmb / safeExchangeRate;
  const commissionUsd = safePrice * (Math.max(0, inputs.commissionRate) / 100);
  const adUsd = safePrice * (Math.max(0, inputs.adRate) / 100);
  const profitUsd = safePrice - purchaseUsd - firstLegUsd - Math.max(0, fbaUsd) - commissionUsd - adUsd;
  return { purchaseUsd, firstLegUsd, commissionUsd, adUsd, profitUsd, margin: profitUsd / safePrice * 100 };
}

function validCosts(inputs                  ) {
  return inputs.purchaseRmb !== null && Number.isFinite(inputs.purchaseRmb) && inputs.purchaseRmb >= 0
    && Number.isFinite(inputs.exchangeRate) && inputs.exchangeRate > 0
    && Number.isFinite(inputs.commissionRate) && inputs.commissionRate >= 0 && inputs.commissionRate <= 100
    && Number.isFinite(inputs.adRate) && inputs.adRate >= 0 && inputs.adRate <= 100;
}

export function calculatePriceScenario(inputs                  , price               , rates                             , zeroAds = false) {
  const trial = { ...inputs, price: price ?? 0, adRate: zeroAds ? 0 : inputs.adRate };
  const quote = quoteFbaFee({ ...trial, priceUsd: trial.price });
  const fbaUsd = quote.totalFeeUsd;
  const result = price === null || !Number.isFinite(price) || price <= 0 || !validCosts(trial) || fbaUsd === null
    ? null : calculateProfit(trial, fbaUsd, rates);
  return { quote, fbaUsd, result };
}

/** Solve each actual FBA price band, then choose the lowest non-losing cent. */
export function findZeroAdBreakEvenPrice(inputs                  , rates                             )                {
  const trial = { ...inputs, adRate: 0 };
  const freight = calculateFirstLegFreight(trial, rates);
  if (!validCosts(trial) || !freight || trial.commissionRate >= 100) return null;
  const contribution = 1 - trial.commissionRate / 100;
  const fixedCost = (trial.purchaseRmb  + freight.freightRmb) / trial.exchangeRate;
  const candidates           = [];
  for (const [min, max] of [[0.01, 9.99], [10, 50], [50.01, Infinity]]) {
    const quote = quoteFbaFee({ ...trial, priceUsd: min });
    if (!quote.confirmationReady || quote.totalFeeUsd === null) continue;
    const raw = Math.max(min, (fixedCost + quote.totalFeeUsd) / contribution);
    let price = Math.ceil(raw * 100 - Number.EPSILON * Math.max(1, raw * 100) * 8) / 100;
    if (!Number.isFinite(price) || price > max) continue;
    let result = calculatePriceScenario(trial, price, rates, true).result;
    const tolerance = Number.EPSILON * Math.max(1, price, fixedCost) * 16;
    if (result && result.profitUsd < -tolerance) {
      price = Math.round((price + .01) * 100) / 100;
      result = calculatePriceScenario(trial, price, rates, true).result;
    }
    if (price <= max && result && result.profitUsd >= -tolerance) candidates.push(price);
  }
  return candidates.length ? Math.min(...candidates) : null;
}
