// Ported from the owner’s 4175 calculator. No project records or configuration included.
                                           
                                                               
                         
                    
                    
                    
                    
                   
                    
                     
                        

                                         

                          
                     
                
                    
                 
                 
                            
                        
                          
    
 

                           
                    
                 
                          
                      
 

                                
                   
                   
                  
                   
                          
                    
                                                                            
                                     
 

                           
                  
                                                        
                             
                               
                        
                                 
                         
                          
                                                      
                                   
                                                                                
                                     
                                    
                             
                                 
                             
                            
                     
 

                                   
                                        
                 
                   
 

                                           
                                                
                          
                          
                                
                                         
                       
                    
                     
 

export const FBA_FEE_VERSION = "2026-US-NON-APPAREL-v5-FUEL-3.5";
export const FBA_SOURCE_LABEL = "2026 美国站 Amazon FBA 配送费速查 · 非服装";
// Amazon US FBA fuel and logistics surcharge, effective 2026-04-17.
// Applies to the delivery fee including additional weight, never to sale price.
export const FBA_FUEL_SURCHARGE_RATE = 0.035;

const OZ_G = 28.3495;
const LB_G = 453.592;
const IN_CM = 2.54;
const EPSILON = 1e-7;

const oz = (value        ) => value * OZ_G;
const lb = (value        ) => value * LB_G;
const inches = (value        ) => value * IN_CM;

const smallStandardRows                   = [
  { maxWeightG: oz(2), label: "≤57 g / ≤2 oz", regular: [2.43, 3.32, 3.58], peak: [2.62, 3.51, 3.77] },
  { maxWeightG: oz(4), label: ">57–113 g / 2–4 oz", regular: [2.49, 3.42, 3.68], peak: [2.68, 3.61, 3.87] },
  { maxWeightG: oz(6), label: ">113–170 g / 4–6 oz", regular: [2.56, 3.45, 3.71], peak: [2.76, 3.65, 3.91] },
  { maxWeightG: oz(8), label: ">170–227 g / 6–8 oz", regular: [2.66, 3.54, 3.8], peak: [2.86, 3.74, 4] },
  { maxWeightG: oz(10), label: ">227–283 g / 8–10 oz", regular: [2.77, 3.68, 3.94], peak: [2.98, 3.89, 4.15] },
  { maxWeightG: oz(12), label: ">283–340 g / 10–12 oz", regular: [2.82, 3.78, 4.04], peak: [3.03, 3.99, 4.25] },
  { maxWeightG: oz(14), label: ">340–397 g / 12–14 oz", regular: [2.92, 3.91, 4.17], peak: [3.14, 4.13, 4.39] },
  { maxWeightG: oz(16), label: ">397–454 g / 14–16 oz", regular: [2.95, 3.96, 4.22], peak: [3.17, 4.18, 4.44] },
];

const largeStandardRows                   = [
  { maxWeightG: oz(4), label: "≤113 g / ≤4 oz", regular: [2.91, 3.73, 3.99], peak: [3.15, 3.97, 4.23] },
  { maxWeightG: oz(8), label: ">113–227 g / 4–8 oz", regular: [3.13, 3.95, 4.21], peak: [3.39, 4.21, 4.47] },
  { maxWeightG: oz(12), label: ">227–340 g / 8–12 oz", regular: [3.38, 4.2, 4.46], peak: [3.66, 4.48, 4.74] },
  { maxWeightG: oz(16), label: ">340–454 g / 12–16 oz", regular: [3.78, 4.6, 4.86], peak: [4.07, 4.89, 5.15] },
  { maxWeightG: lb(1.25), label: ">454–567 g / 1–1.25 lb", regular: [4.22, 5.04, 5.3], peak: [4.52, 5.34, 5.6] },
  { maxWeightG: lb(1.5), label: ">567–680 g / 1.25–1.5 lb", regular: [4.6, 5.42, 5.68], peak: [4.91, 5.73, 5.99] },
  { maxWeightG: lb(1.75), label: ">680–794 g / 1.5–1.75 lb", regular: [4.75, 5.57, 5.83], peak: [5.07, 5.89, 6.15] },
  { maxWeightG: lb(2), label: ">794–907 g / 1.75–2 lb", regular: [5, 5.82, 6.08], peak: [5.33, 6.15, 6.41] },
  { maxWeightG: lb(2.25), label: ">907 g–1.02 kg / 2–2.25 lb", regular: [5.1, 5.92, 6.18], peak: [5.47, 6.29, 6.55] },
  { maxWeightG: lb(2.5), label: ">1.02–1.13 kg / 2.25–2.5 lb", regular: [5.28, 6.1, 6.36], peak: [5.67, 6.49, 6.75] },
  { maxWeightG: lb(2.75), label: ">1.13–1.25 kg / 2.5–2.75 lb", regular: [5.44, 6.26, 6.52], peak: [5.84, 6.66, 6.92] },
  { maxWeightG: lb(3), label: ">1.25–1.36 kg / 2.75–3 lb", regular: [5.85, 6.67, 6.93], peak: [6.26, 7.08, 7.34] },
  {
    maxWeightG: lb(20),
    label: ">1.36–9.07 kg / 3–20 lb",
    regular: [6.15, 6.97, 7.23],
    peak: [6.69, 7.51, 7.77],
    incremental: { includedWeightG: lb(3), unitWeightG: oz(4), feePerUnitUsd: 0.08 },
  },
];

const oversizeRules                                              = {
  "small-standard": null,
  "large-standard": null,
  "small-oversize": { regular: [6.78, 7.55, 7.55], peak: [7.82, 8.59, 8.59], includedWeightG: lb(1), feePerLbUsd: 0.38 },
  "large-oversize": { regular: [8.58, 9.35, 9.35], peak: [9.62, 10.39, 10.39], includedWeightG: lb(1), feePerLbUsd: 0.38 },
  "oversize-0-50": { regular: [25.56, 26.33, 26.33], peak: [28.29, 29.06, 29.06], includedWeightG: lb(1), feePerLbUsd: 0.38 },
  "oversize-50-70": { regular: [36.55, 37.32, 37.32], peak: [39.36, 40.13, 40.13], includedWeightG: lb(51), feePerLbUsd: 0.75 },
  "oversize-70-150": { regular: [50.55, 51.32, 51.32], peak: [54.97, 55.74, 55.74], includedWeightG: lb(71), feePerLbUsd: 0.75 },
  "oversize-over-150": { regular: [194.18, 194.95, 194.95], peak: [202.69, 203.46, 203.46], includedWeightG: lb(151), feePerLbUsd: 0.19 },
};

const sizeTierLabels                              = {
  "small-standard": "小号标准尺寸",
  "large-standard": "大号标准尺寸",
  "small-oversize": "小号大件",
  "large-oversize": "大号大件",
  "oversize-0-50": "超大件 · 0–50 lb",
  "oversize-50-70": "超大件 · >50–70 lb",
  "oversize-70-150": "超大件 · >70–150 lb",
  "oversize-over-150": "超大件 · >150 lb",
};

                               
                    
                                
                                            
                                
 

const tierReductionTargets                        = [
  {
    tier: "small-standard",
    maxCalculationWeightG: lb(1),
    maxDimensionsCm: [inches(15), inches(12), inches(0.75)],
  },
  {
    tier: "large-standard",
    maxCalculationWeightG: lb(20),
    maxDimensionsCm: [inches(18), inches(14), inches(8)],
  },
  {
    tier: "small-oversize",
    maxCalculationWeightG: lb(50),
    maxDimensionsCm: [inches(37), inches(28), inches(20)],
    maxLengthPlusGirthCm: inches(130),
  },
  {
    tier: "large-oversize",
    maxCalculationWeightG: lb(50),
    maxDimensionsCm: [inches(59), inches(33), inches(33)],
    maxLengthPlusGirthCm: inches(130),
  },
];

const sizeTierOrder                = [
  "small-standard",
  "large-standard",
  "small-oversize",
  "large-oversize",
  "oversize-0-50",
  "oversize-50-70",
  "oversize-70-150",
  "oversize-over-150",
];

function priceBandFor(priceUsd        )                                                       {
  if (priceUsd < 10) return { band: "under-10", index: 0, label: "< $10" };
  if (priceUsd <= 50) return { band: "10-to-50", index: 1, label: "$10–$50" };
  return { band: "over-50", index: 2, label: "> $50" };
}

function within(value        , maximum        ) {
  return value <= maximum + EPSILON;
}

function incrementalUnits(weightG        , includedWeightG        , unitWeightG        ) {
  const excess = Math.max(0, weightG - includedWeightG);
  if (excess <= EPSILON) return 0;
  return Math.ceil((excess - EPSILON) / unitWeightG);
}

function classifySize(
  sortedDimensionsCm                          ,
  calculationWeightG        ,
  shippingWeightG        ,
) {
  const [longest, middle, shortest] = sortedDimensionsCm;
  const lengthPlusGirthCm = longest + (2 * (middle + shortest));

  if (
    within(calculationWeightG, lb(1))
    && within(longest, inches(15))
    && within(middle, inches(12))
    && within(shortest, inches(0.75))
  ) return { tier: "small-standard"         , lengthPlusGirthCm };

  if (
    within(calculationWeightG, lb(20))
    && within(longest, inches(18))
    && within(middle, inches(14))
    && within(shortest, inches(8))
  ) return { tier: "large-standard"         , lengthPlusGirthCm };

  if (
    within(calculationWeightG, lb(50))
    && within(longest, inches(37))
    && within(middle, inches(28))
    && within(shortest, inches(20))
    && within(lengthPlusGirthCm, inches(130))
  ) return { tier: "small-oversize"         , lengthPlusGirthCm };

  if (
    within(calculationWeightG, lb(50))
    && within(longest, inches(59))
    && within(middle, inches(33))
    && within(shortest, inches(33))
    && within(lengthPlusGirthCm, inches(130))
  ) return { tier: "large-oversize"         , lengthPlusGirthCm };

  if (within(calculationWeightG, lb(50))) return { tier: "oversize-0-50"         , lengthPlusGirthCm };
  if (within(calculationWeightG, lb(70))) return { tier: "oversize-50-70"         , lengthPlusGirthCm };
  if (within(calculationWeightG, lb(150))) return { tier: "oversize-70-150"         , lengthPlusGirthCm };

  return { tier: "oversize-over-150", lengthPlusGirthCm };
}

function emptyQuote(warnings          )           {
  return {
    quoted: false,
    quoteStatus: "unavailable",
    confirmationReady: false,
    sizeTier: null,
    sizeTierLabel: "待补包装数据",
    priceBand: null,
    priceBandLabel: "—",
    weightBandLabel: "—",
    sortedDimensionsCm: null,
    lengthPlusGirthCm: null,
    calculationWeightG: null,
    tableFeeUsd: null,
    additionalWeightFeeUsd: 0,
    fulfillmentFeeUsd: null,
    fuelSurchargeRate: FBA_FUEL_SURCHARGE_RATE,
    fuelSurchargeUsd: null,
    totalFeeUsd: null,
    sourcePage: null,
    warnings,
  };
}

// User-selected dimensional divisor: cm³ / 2277.8 gives lb, converted to g
// before comparison with packaged actual weight and the fee-table thresholds.
export const TAIL_VOLUMETRIC_DIVISOR_CM3_PER_LB = 2277.8;
export function calculateTailVolumetricWeightG(input) {
  const dimensions = [input.lengthCm, input.widthCm, input.heightCm];
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0)) return null;
  return dimensions.reduce((volume, side) => volume * side, 1) / TAIL_VOLUMETRIC_DIVISOR_CM3_PER_LB * LB_G;
}

export function quoteFbaFee(input               )           {
  const numericInputs = [input.priceUsd, input.lengthCm, input.widthCm, input.heightCm, input.shippingWeightG];
  if (numericInputs.some((value) => !Number.isFinite(value) || value <= 0)) {
    return emptyQuote(["补齐有效售价、包装后三边和包装实重，才能自动报价。"]);
  }
  const sortedDimensionsCm = [input.lengthCm, input.widthCm, input.heightCm]
    .sort((a, b) => b - a)                            ;
  if (!["regular", "peak"].includes(input.period)) return emptyQuote(["请选择淡季或旺季费率。"]);
  const volumetricWeightG = calculateTailVolumetricWeightG(input);
  const calculationWeightG = Math.max(input.shippingWeightG, volumetricWeightG);
  const { tier, lengthPlusGirthCm } = classifySize(sortedDimensionsCm, calculationWeightG, input.shippingWeightG);
  const priceBand = priceBandFor(input.priceUsd);
  const warnings           = [];
  let tableFeeUsd = 0;
  let additionalWeightFeeUsd = 0;
  let weightBandLabel = "";
  let sourcePage = input.period === "regular" ? 2 : 3;

  if (tier === "small-standard" || tier === "large-standard") {
    const rows = tier === "small-standard" ? smallStandardRows : largeStandardRows;
    const row = rows.find((candidate) => within(calculationWeightG, candidate.maxWeightG));
    if (!row) return emptyQuote(["重量超出当前标准尺寸费表覆盖范围，请人工复核尺寸分段。"]);
    tableFeeUsd = row[input.period][priceBand.index];
    weightBandLabel = row.label;
    if (row.incremental) {
      const units = incrementalUnits(calculationWeightG, row.incremental.includedWeightG, row.incremental.unitWeightG);
      additionalWeightFeeUsd = units * row.incremental.feePerUnitUsd;
      if (units > 0) warnings.push("超出首重部分按每 4 oz 向上取整估算；最终以 Amazon 账单为准。");
    }
  } else {
    const rule = oversizeRules[tier];
    if (!rule) return emptyQuote(["未找到匹配的大件费率规则，请人工复核。"]);
    sourcePage = 4;
    tableFeeUsd = rule[input.period][priceBand.index];
    const units = incrementalUnits(calculationWeightG, rule.includedWeightG, lb(1));
    additionalWeightFeeUsd = units * rule.feePerLbUsd;
    weightBandLabel = `${(calculationWeightG / LB_G).toFixed(2)} lb 计费重`;
    if (units > 0) warnings.push("大件超出首重部分按每 1 lb 向上取整估算；最终以 Amazon 账单为准。");
  }

  if (!within(sortedDimensionsCm[0], inches(96)) || !within(lengthPlusGirthCm, inches(130))) {
    warnings.push("最长边或长度加围长超过特别处理阈值，可能另收未列明的处理费。");
  }

  const fulfillmentFeeUsd = Number((tableFeeUsd + additionalWeightFeeUsd).toFixed(2));
  const fuelSurchargeUsd = Math.round((fulfillmentFeeUsd * FBA_FUEL_SURCHARGE_RATE + Number.EPSILON) * 100) / 100;
  const totalFeeUsd = Number((fulfillmentFeeUsd + fuelSurchargeUsd).toFixed(2));

  return {
    quoted: true,
    quoteStatus: "confirmed",
    confirmationReady: true,
    sizeTier: tier,
    sizeTierLabel: sizeTierLabels[tier],
    priceBand: priceBand.band,
    priceBandLabel: priceBand.label,
    weightBandLabel,
    sortedDimensionsCm,
    lengthPlusGirthCm,
    calculationWeightG,
    actualWeightG: input.shippingWeightG,
    volumetricWeightG,
    tableFeeUsd,
    additionalWeightFeeUsd,
    fulfillmentFeeUsd,
    fuelSurchargeRate: FBA_FUEL_SURCHARGE_RATE,
    fuelSurchargeUsd,
    totalFeeUsd,
    sourcePage,
    warnings,
  };
}

function roundForDisplay(value        ) {
  return Math.round(value * 100) / 100;
}

function ceilForDisplay(value        ) {
  return Math.ceil((value - EPSILON) * 100) / 100;
}

function dimensionsForTarget(
  currentDimensionsCm                          ,
  target                     ,
)                           {
  const dimensions = currentDimensionsCm.map((dimension, index) => (
    Math.min(dimension, target.maxDimensionsCm[index])
  ))                            ;

  if (target.maxLengthPlusGirthCm) {
    const maximumCrossSectionSum = (target.maxLengthPlusGirthCm - dimensions[0]) / 2;
    const currentCrossSectionSum = dimensions[1] + dimensions[2];
    if (currentCrossSectionSum > maximumCrossSectionSum) {
      const scale = maximumCrossSectionSum / currentCrossSectionSum;
      dimensions[1] *= scale;
      dimensions[2] *= scale;
    }
  }

  return dimensions;
}

function weightReductionTargets(currentCalculationWeightG        ) {
  const standardThresholds = [...smallStandardRows, ...largeStandardRows].map((row) => row.maxWeightG);
  const tierThresholds = tierReductionTargets.map((target) => target.maxCalculationWeightG);
  const incrementalThresholds           = [];

  for (const rule of Object.values(oversizeRules)) {
    if (!rule || currentCalculationWeightG <= rule.includedWeightG) continue;
    const currentUnits = incrementalUnits(currentCalculationWeightG, rule.includedWeightG, lb(1));
    for (let units = currentUnits - 1; units >= 0; units -= 1) {
      incrementalThresholds.push(rule.includedWeightG + (units * lb(1)));
    }
  }

  return Array.from(new Set([...standardThresholds, ...tierThresholds, ...incrementalThresholds]))
    .filter((weight) => weight < currentCalculationWeightG - EPSILON)
    .sort((a, b) => b - a);
}

/**
 * Calculates only package changes that can reach a lower fee tier under the
 * same local fee table. Each proposal recomputes actual and dimensional weight.
 */
export function getFbaTierReductionProposals(input               )                             {
  const currentQuote = quoteFbaFee(input);
  if (!currentQuote.quoted || !currentQuote.sizeTier || currentQuote.totalFeeUsd === null || !currentQuote.sortedDimensionsCm) {
    return [];
  }

  const currentFeeUsd = currentQuote.totalFeeUsd;
  const currentDimensionsCm = currentQuote.sortedDimensionsCm;
  const currentTierIndex = sizeTierOrder.indexOf(currentQuote.sizeTier);
  if (currentTierIndex <= 0) return [];

  const calculationWeightG = input.shippingWeightG;
  const lowerTierTargets = tierReductionTargets
    .filter((target) => sizeTierOrder.indexOf(target.tier) < currentTierIndex)
    .reverse();
  const weightTargets = weightReductionTargets(calculationWeightG);
  const dimensionLabels                               = ["最长边", "次长边", "最短边"];

  const buildProposal = (
    strategy                                      ,
    desiredDimensionsCm                          ,
    desiredCalculationWeightG        ,
    expectedTier              ,
  )                                  => {
    const requiredReductions                     = currentDimensionsCm
      .map((dimension, index) => ({
        metric: dimensionLabels[index],
        amount: ceilForDisplay(Math.max(0, dimension - desiredDimensionsCm[index])),
        unit: "cm"         ,
      }))
      .filter((reduction) => reduction.amount > 0);
    const weightReductionG = ceilForDisplay(Math.max(0, calculationWeightG - desiredCalculationWeightG));
    if (weightReductionG > 0) requiredReductions.push({ metric: "包装实重", amount: weightReductionG, unit: "g" });

    const hasDimensionReduction = requiredReductions.some((reduction) => reduction.unit === "cm");
    const hasWeightReduction = requiredReductions.some((reduction) => reduction.unit === "g");
    if (
      requiredReductions.length === 0
      || (strategy === "dimension" && (!hasDimensionReduction || hasWeightReduction))
      || (strategy === "weight" && (hasDimensionReduction || !hasWeightReduction))
      || (strategy === "combined" && (!hasDimensionReduction || !hasWeightReduction))
    ) return null;

    const displayedDimensionsCm = [...currentDimensionsCm]                            ;
    requiredReductions.forEach((reduction) => {
      const index = dimensionLabels.indexOf(reduction.metric);
      if (index >= 0) displayedDimensionsCm[index] -= reduction.amount;
    });
    const displayedCalculationWeightG = calculationWeightG - weightReductionG;
    const targetQuote = quoteFbaFee({
      ...input,
      lengthCm: displayedDimensionsCm[0],
      widthCm: displayedDimensionsCm[1],
      heightCm: displayedDimensionsCm[2],
      shippingWeightG: Math.min(input.shippingWeightG, displayedCalculationWeightG),
    });
    if (
      targetQuote.totalFeeUsd === null
      || targetQuote.sizeTier === null
      || (expectedTier && targetQuote.sizeTier !== expectedTier)
      || targetQuote.totalFeeUsd >= currentFeeUsd - EPSILON
    ) return null;

    const packageWarning = "目标档位按改包后的包装尺寸与包装实重复算；实际配送费以 Amazon 账单为准。";
    return {
      strategy,
      targetTier: targetQuote.sizeTier,
      targetTierLabel: targetQuote.sizeTierLabel,
      targetWeightBandLabel: targetQuote.weightBandLabel,
      requiredReductions,
      targetFeeUsd: targetQuote.totalFeeUsd,
      savingUsd: roundForDisplay(currentFeeUsd - targetQuote.totalFeeUsd),
      warnings: Array.from(new Set([...targetQuote.warnings, packageWarning])),
    };
  };

  const dimensionCandidates = lowerTierTargets
    .filter((target) => calculationWeightG <= target.maxCalculationWeightG + EPSILON)
    .map((target) => buildProposal("dimension", dimensionsForTarget(currentDimensionsCm, target), calculationWeightG, target.tier))
    .filter((proposal)                                       => proposal !== null);
  const weightCandidates = weightTargets
    .map((targetWeightG) => buildProposal("weight", currentDimensionsCm, targetWeightG))
    .filter((proposal)                                       => proposal !== null);
  const combinedCandidates = lowerTierTargets.flatMap((target) => weightTargets
    .filter((targetWeightG) => targetWeightG <= target.maxCalculationWeightG + EPSILON)
    .map((targetWeightG) => buildProposal(
      "combined",
      dimensionsForTarget(currentDimensionsCm, target),
      targetWeightG,
      target.tier,
    )))
    .filter((proposal)                                       => proposal !== null);

  const prioritized = [dimensionCandidates[0], weightCandidates[0], combinedCandidates[0]].filter(
    (proposal)                                       => proposal !== undefined,
  );
  const remaining = [...dimensionCandidates.slice(1), ...weightCandidates.slice(1), ...combinedCandidates.slice(1)];
  const unique = [...prioritized, ...remaining].filter((proposal, index, proposals) => {
    const signature = JSON.stringify(proposal.requiredReductions);
    return proposals.findIndex((candidate) => JSON.stringify(candidate.requiredReductions) === signature) === index;
  });
  return unique.slice(0, 3);
}

export const FBA_BUSINESS_TIME_ZONE = "America/Los_Angeles";

export function getFbaPeriodForDate(date      )                   {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FBA_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type                              ) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  const dateKey = `${part("year")}-${part("month")}-${part("day")}`;
  if (dateKey >= "2026-01-15" && dateKey <= "2026-10-14") return "regular";
  if (dateKey >= "2026-10-15" && dateKey <= "2027-01-14") return "peak";
  return null;
}
