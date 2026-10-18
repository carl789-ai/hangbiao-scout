import {endpointUrl} from './core.js';
export const templates={
 keyword:'根据提供的关键词及搜索首页数据，评价需求、竞争与差异化机会。逐条返回关键词、依据、缺失信息和建议。蓝海比率只是首页低评论商品占比，购买标签合计不是精确月销。不可虚构全市场销量、利润、专利结论。',
 product:'分析商品用途、目标用户、差异化方向、季节性、复购可能性、供应链难点与合规核查项。区分已知事实与推测，不凭标题断言专利安全、认证或销量。',
 score:'对类目需求、季节性、刚需度、复购率、侵权安全、合规准入、广告竞争、供应链壁垒、利润健康、生命周期逐项给0到10分并解释依据。信息不足的维度标为未知且不强行汇总总分。',
 market:'根据提供的样本归纳价格、评论、购买标签和头部集中情况，明确样本范围是单个搜索首页。指出无法从该样本推断的全市场指标和需要补充的数据。',
 risk:'检查商品的潜在专利、商标、外观、合规、运输及售后风险，给出后续应查询的公开数据库和目标语关键词。只能提供待核查事项，不能给出已通过审核的结论。',
 launch:'为商品制定验证需求、样品测试、供应链打样、关键词与广告实验的分阶段行动。预算、售价和成本缺失时列出待填项，不虚构收益。',
 custom:'按照用户自定义要求分析提供的数据。明确事实、假设与未知，不把缺失字段当成零。'
};
export async function analyze(config,prompt,data,signal){
 if(!config.apiKey||!config.model)throw new Error('请先保存 API Key 和模型名称');const url=endpointUrl(config.baseUrl);
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.apiKey},body:JSON.stringify({model:config.model,messages:[{role:'system',content:prompt},{role:'user',content:typeof data==='string'?data:JSON.stringify(data)}],temperature:0.3}),signal,redirect:'error'});
 if(!res.ok)throw new Error('中转站返回 HTTP '+res.status);const result=await res.json(),text=result?.choices?.[0]?.message?.content;if(typeof text!=='string')throw new Error('未收到 OpenAI Chat Completions 格式的文本响应');return text;
}
