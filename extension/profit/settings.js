import {DEFAULT_FIRST_LEG_FREIGHT_RATES} from './firstLegFreight.js';

export const DEFAULT_PROFIT_SETTINGS=Object.freeze({
  sea:DEFAULT_FIRST_LEG_FREIGHT_RATES.sea,
  'red-express':DEFAULT_FIRST_LEG_FREIGHT_RATES['red-express'],
  quantity:30,seaTarget:20,airTarget:15,
});
const numeric=value=>value===''||value==null?NaN:Number(value);
export function validProfitSettings(value){
  if(!value||typeof value!=='object')return false;
  return ['sea','red-express'].every(key=>Number.isFinite(numeric(value[key]))&&numeric(value[key])>0)
    && Number.isInteger(numeric(value.quantity))&&numeric(value.quantity)>0
    && ['seaTarget','airTarget'].every(key=>Number.isFinite(numeric(value[key]))&&numeric(value[key])>=0&&numeric(value[key])<=100);
}
// Old installations saved only freight rates. Keep those and seed new fields.
export function resolveProfitSettings(saved={},legacyInputs={}){
  saved=saved&&typeof saved==='object'?saved:{};
  legacyInputs=legacyInputs&&typeof legacyInputs==='object'?legacyInputs:{};
  const values={...DEFAULT_PROFIT_SETTINGS,...saved};
  if(saved.quantity==null&&Number.isInteger(numeric(legacyInputs.quantity))&&numeric(legacyInputs.quantity)>0)values.quantity=numeric(legacyInputs.quantity);
  for(const key of Object.keys(DEFAULT_PROFIT_SETTINGS)){
    const n=numeric(values[key]),valid=key==='quantity'?Number.isInteger(n)&&n>0:['seaTarget','airTarget'].includes(key)?Number.isFinite(n)&&n>=0&&n<=100:Number.isFinite(n)&&n>0;
    values[key]=valid?n:DEFAULT_PROFIT_SETTINGS[key];
  }
  return values;
}
