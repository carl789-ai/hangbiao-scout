// Replace this with your agent's own daily-Chrome connection, not a new browser or direct supplier API.
export async function fetchInBrowser({url,timeoutMs}){
 // Example contract: evaluate fetch(url, {credentials:'include', signal:AbortSignal.timeout(timeoutMs)})
 // inside an already connected Amazon tab, returning HTTP status, final URL and HTML.
 // Verify the selected browser profile and handle challenge pages manually.
 throw new Error('请接入你自己的日常Chrome工具：返回 {status:200,url,html}，不要使用此占位适配器发起采集');
}
