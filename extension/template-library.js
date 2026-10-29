export const PROTECTED_TEMPLATE_ID='keyword';
export const PROTECTED_TEMPLATE_NAME='关键词综合分析与六层评分';
export function ensureProtectedTemplate(entries, defaults) {
  const existing=entries.find(t=>t.id===PROTECTED_TEMPLATE_ID);
  const fixed=existing?{...existing,name:PROTECTED_TEMPLATE_NAME}:{id:PROTECTED_TEMPLATE_ID,name:PROTECTED_TEMPLATE_NAME,prompt:defaults.keyword,system:defaults.system,baseId:'keyword'};
  return [fixed,...entries.filter(t=>t.id!==PROTECTED_TEMPLATE_ID)];
}
// The library and each task's saved prompt are independent snapshots.
export function templateName(value, entries, id) {
  const name = String(value || '').trim();
  if (!name) throw new Error('请填写模板名称');
  if (name.length > 40) throw new Error('模板名称不能超过 40 个字');
  if (entries.some(t => t.id !== id && t.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('已有同名模板，请换一个名称');
  return name;
}
export function copyName(name, entries) {
  const base = String(name || '新模板').slice(0, 32);
  let candidate = base + ' · 副本', index = 2;
  while (entries.some(t => t.name === candidate)) candidate = base + ' · 副本 ' + index++;
  return candidate;
}
export function saveTemplate(entries, draft) {
  const name = templateName(draft.id===PROTECTED_TEMPLATE_ID?PROTECTED_TEMPLATE_NAME:draft.name, entries, draft.id);
  if (!draft.prompt.trim() || !draft.system.trim()) throw new Error('系统要求和分析提示词都不能为空');
  const saved = {...draft, name};
  return entries.some(t => t.id === saved.id) ? entries.map(t => t.id === saved.id ? saved : t) : [...entries, saved];
}
export function removeTemplate(entries, id) {
  if (id===PROTECTED_TEMPLATE_ID) throw new Error('内置常用模板不可删除');
  if (!entries.some(t => t.id === id)) throw new Error('该模板仅保存在当前任务中');
  if (entries.length <= 1) throw new Error('至少保留一个分析模板');
  return entries.filter(t => t.id !== id);
}
export function taskTemplate(options, entries, defaults) {
  const id = options.template || entries[0]?.id || 'keyword';
  const stored = entries.find(t => t.id === id);
  return {
    id,
    name: options.templateName || stored?.name || '任务留存模板',
    prompt: options.prompt ?? stored?.prompt ?? defaults.keyword,
    system: options.system ?? stored?.system ?? defaults.system,
    baseId: options.baseTemplate || stored?.baseId || (defaults[id] ? id : 'keyword')
  };
}
