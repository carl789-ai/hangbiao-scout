import {createServer} from 'node:http';import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';import {pathToFileURL} from 'node:url';
export function createBridge({token=randomBytes(24).toString('hex')}={}){
 const queue=new Map();
 const server=createServer(async(req,res)=>{
 const origin=req.headers.origin||'';if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403);res.end('Origin rejected');return;}
 if(origin)res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST');res.writeHead(204);res.end();return;}
 const authorization=req.headers.authorization||'',expected='Bearer '+token;
 if(Buffer.byteLength(authorization)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(authorization),Buffer.from(expected))){res.writeHead(401);res.end('Unauthorized');return;}
 const reply=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 try{let body;const url=new URL(req.url,'http://127.0.0.1');if(req.method==='POST'){let n=0,parts=[];for await(const p of req){n+=p.length;if(n>64*1024*1024){reply({error:'Body too large'},413);return;}parts.push(p);}body=JSON.parse(Buffer.concat(parts).toString('utf8'));}
 for(const [id,item]of queue)if(Date.now()-item.createdAt>3600000)queue.delete(id);
 if(req.method==='GET'&&url.pathname==='/health')return reply({ok:true,version:'2.0.0-beta.1'});
 if(req.method==='POST'&&url.pathname==='/commands'){
 if(!['create','start','pause','status','page','export'].includes(body?.type))return reply({error:'Unknown command'},400);if(queue.size>=100)return reply({error:'Too many commands'},429);
 const id=randomUUID();queue.set(id,{id,payload:body,state:'queued',createdAt:Date.now()});return reply({id,state:'queued'},202);}
 if(req.method==='GET'&&url.pathname==='/commands/next'){const command=[...queue.values()].find(c=>c.state==='queued');if(!command)return reply(null);command.state='claimed';return reply(command);}
 const match=url.pathname.match(/^\/commands\/([\w-]+)(\/complete)?$/);if(match){const item=queue.get(match[1]);if(!item)return reply({error:'Not found'},404);if(req.method==='POST'&&match[2]){item.state='done';item.response=body;delete item.payload;return reply({ok:true});}if(req.method==='GET'&&!match[2])return reply(item);}
 reply({error:'Not found'},404);
 }catch(e){if(!res.headersSent)reply({error:e.message},400);else res.end();}
 });return {server,token};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const port=Number(process.env.HANGBIAO_PORT||43129);const {server,token}=createBridge();server.listen(port,'127.0.0.1',()=>console.log(`航标 Agent 本机服务\n地址：http://127.0.0.1:${port}\n令牌：${token}\n在插件“设置与帮助”中填入。服务仅监听本机，关闭此窗口即停止。`));}
