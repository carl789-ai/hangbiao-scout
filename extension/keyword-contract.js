// Shared by the editor guide and actual keyword requests.
export const promptExamples={
 opportunity:'分析目标：寻找竞争较低、需求稳定的亚马逊细分产品。\n关注指标：搜索结果数、蓝海比率、平均评论、需求趋势、品牌与侵权风险。\n评分规则：需求稳定性占30%，竞争友好度占35%，差异化空间占20%，风险安全度占15%，按0–100分评价。\n建议要求：给出适合切入的产品方向、需要验证的风险与下一步行动。只引用输入数据，缺失指标明确说明，不推测精确销量。',
 repurchase:'分析目标：优先筛选有复购需求、可做组合或材质差异化的产品。\n关注指标：消耗属性、使用场景、价格区间、竞争强度、认证与侵权风险。\n评分规则：复购潜力占30%，差异化空间占30%，竞争友好度占25%，风险安全度占15%。\n建议要求：说明适合的目标人群、组合方式与验证重点。复购周期无法从输入确认时说明需验证，不编造利润、销量或认证结论。'
};
const detail={id:0,keyword:'birthday candle',country:'com',search_trend_ai:'根据输入说明搜索趋势；缺失时说明',competition_level:'结合评论、竞品与可用指标说明竞争',blue_ocean_potential:'说明可验证的差异化空间',brand_risk:'低/中/高及依据',infringement_risk:'低/中/高及待核查事项',category_restriction:'说明准入限制或需核查',certification_analysis:'按产品和站点说明认证需求，不确定时说明',compliance_risk:'标签、使用安全等风险',product_recommendation:'具体产品与切入建议',target_audience:'目标人群和使用场景',seasonality:'低',fda_required:'不需要',standard_product_type:'半标品',improvement_potential:'大',is_electric:'否',repurchase:'低复购',overall_score:75,llm_reason:'基于提供的数据给出连贯综合分析，说明机会、风险和下一步；未知数据明确说明，不能把示例值当成实际结论。'};
const summary={id:0,keyword:'birthday candle',level:'推荐',rating:75,reason:'引用输入数据说明机会、风险与建议；缺失数据明确说明。'};
export const keywordContract=base=>base==='keyword'?'detail-v1':'summary-v1';
export const contractExample=base=>JSON.stringify({results:[base==='keyword'?detail:summary]},null,2);
export function contractIssue(row,contract){
 if(!['detail-v1','summary-v1'].includes(contract))return '';
 if(!Number.isInteger(row.id)||typeof row.keyword!=='string'||!row.keyword.trim())return '固定格式缺少 id 或 keyword';
 const example=contract==='detail-v1'?detail:summary;
 for(const [key,value]of Object.entries(example)){
  if(typeof row[key]!==typeof value||(typeof value==='string'&&!row[key].trim()))return '固定格式字段类型不正确：'+key;
 }
 const score=contract==='detail-v1'?row.overall_score:row.rating;
 if(!Number.isInteger(score)||score<0||score>100)return '固定格式评分需为 0–100 整数';
 if(contract==='detail-v1'){
  const enums={seasonality:['低','中','高'],fda_required:['需要','不需要'],standard_product_type:['非标品','半标品','标品'],improvement_potential:['大','小'],is_electric:['是','否'],repurchase:['高复购','中复购','低复购']};
  for(const [key,values]of Object.entries(enums))if(!values.includes(row[key]))return '固定格式枚举值不正确：'+key;
 }
 return '';
}
export function outputContractText(contract){
 if(!['detail-v1','summary-v1'].includes(contract))return '';
 const detailed=contract==='detail-v1';
 return '\n\n【程序固定的输出协议 v1】以下协议优先于前文的输出示例或格式要求；前文只决定分析重点和评分规则。只输出一个 JSON 对象，不要 Markdown、代码围栏或前后解释。顶层只有 results 数组。每个输入关键词恰好返回一条，不能省略低分项。id 必须为输入中的整数，keyword 必须与该 id 的原词一致，禁止改变标识。字段名称和类型不可修改。'+
 (detailed?'评分 overall_score 必须为0–100整数；所有分析文字字段为非空字符串。llm_reason 用130–230字连贯中文说明。必须包含示例中的全部字段。seasonality 仅低/中/高；fda_required 仅需要/不需要；standard_product_type 仅非标品/半标品/标品；improvement_potential 仅大/小；is_electric 仅是/否；repurchase 仅高复购/中复购/低复购。country 原样使用输入值。':'评分 rating 必须为0–100整数；level 与 reason 为非空字符串。reason 用130–230字说明判断依据和缺失数据。')+
 '只依据输入证据，不编造缺失指标，购买标签不等于精确销量。以下仅演示字段与类型，示例关键词、评分及结论不得照抄：\n'+JSON.stringify({results:[detailed?detail:summary]});
}
