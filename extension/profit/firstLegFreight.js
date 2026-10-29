// Ported from the owner’s 4175 calculator. No project records or configuration included.
export const FIRST_LEG_VOLUMETRIC_DIVISOR = 6000;
export const FIRST_LEG_AIR_VOLUMETRIC_DIVISOR = 5000;
export const FIRST_LEG_SEA_RATE_RMB_PER_KG = 15;
export const FIRST_LEG_RED_EXPRESS_RATE_RMB_PER_KG = 70;
                                                        

                                       
              
                        
 

export const DEFAULT_FIRST_LEG_FREIGHT_RATES                       = Object.freeze({
  sea: FIRST_LEG_SEA_RATE_RMB_PER_KG,
  "red-express": FIRST_LEG_RED_EXPRESS_RATE_RMB_PER_KG,
});

export function validFirstLegFreightRates(value         )                                {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rates = value                                 ;
  return [rates.sea, rates["red-express"]].every((rate) => typeof rate === "number" && Number.isFinite(rate) && rate > 0);
}

export function getFirstLegFreightRate(mode                      = "sea", rates                              = DEFAULT_FIRST_LEG_FREIGHT_RATES) {
  return validFirstLegFreightRates(rates) ? rates[mode] : null;
}

export function getProfitMarginThreshold(mode = "sea", targets = {}) {
  const key=mode === "red-express" ? 'airTarget' : 'seaTarget';
  const target=targets[key];
  return typeof target==='number'&&Number.isFinite(target)&&target>=0&&target<=100?target:(mode === "red-express" ? 15 : 20);
}

export function meetsProfitMarginThreshold(margin, mode = "sea", targets = {}) {
  if (margin === null || !Number.isFinite(margin)) return false;
  const threshold = getProfitMarginThreshold(mode, targets);
  // Currency subtraction may turn mathematical 20% into 19.999999999999993%.
  // This tolerance covers only machine precision, never rounded UI percentages.
  const arithmeticTolerance = Number.EPSILON * Math.max(1, Math.abs(margin), threshold) * 8;
  return margin >= threshold || threshold - margin <= arithmeticTolerance;
}

                                       
                   
                  
                   
                          
                                    
 

                                       
                             
                         
                             
                       
                     
 

export function calculateVolumetricWeightKg(input                                                                 ) {
  const dimensions = [input.lengthCm, input.widthCm, input.heightCm];
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  const divisor = input.freightMode === "red-express" ? FIRST_LEG_AIR_VOLUMETRIC_DIVISOR : FIRST_LEG_VOLUMETRIC_DIVISOR;
  return (input.lengthCm * input.widthCm * input.heightCm) / divisor;
}

export function calculateFirstLegFreight(input                      , rates                              = DEFAULT_FIRST_LEG_FREIGHT_RATES)                              {
  const values = [input.lengthCm, input.widthCm, input.heightCm, input.shippingWeightG];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;

  const volumetricWeightKg = calculateVolumetricWeightKg(input);
  if (volumetricWeightKg === null) return null;
  const actualWeightKg = input.shippingWeightG / 1000;
  const chargeableWeightKg = Math.max(volumetricWeightKg, actualWeightKg);
  const rateRmbPerKg = getFirstLegFreightRate(input.freightMode, rates);
  if (rateRmbPerKg === null) return null;
  const freightRmb = Number(
    (chargeableWeightKg * rateRmbPerKg).toFixed(12),
  );

  return {
    volumetricWeightKg,
    actualWeightKg,
    chargeableWeightKg,
    rateRmbPerKg,
    freightRmb,
  };
}
