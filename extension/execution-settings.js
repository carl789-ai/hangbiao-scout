// Offscreen documents have runtime messaging, not chrome.storage access.
export async function readAiConfig(runtime=chrome.runtime){
 const response=await runtime.sendMessage({type:'getAiConfig'});
 if(!response?.ok)throw new Error(response?.error||'无法读取 AI 配置，请重新加载插件');
 return response.config||{};
}
