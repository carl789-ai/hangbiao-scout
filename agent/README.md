> beta.4 已移除工作台的 Agent 连接设置。以下插件连接方式为历史开发接口说明，普通用户不需要使用；独立适配器调用方式仍保留。

# Agent接入

插件必须先安装；Chrome及工作台保持打开。普通用户无需运行此服务。

1. Node20+运行 `node agent/server.mjs`，默认仅本机43129端口。
2. 将打印的URL与随机令牌填到插件的设置页，点击授权并连接。
3. Agent设置环境变量`HANGBIAO_TOKEN`为该令牌；可选`HANGBIAO_URL`修改本机服务地址。不要把令牌提交到GitHub或贴进日志。
4. `node agent/client.mjs 请求.json`会入队并等待工作台响应。客户端超时后用已打印请求ID查询，不应无条件重复创建。

HTTP请求均需`Authorization: Bearer <令牌>`。提交`POST /commands`，响应`{id,state}`。轮询`GET /commands/<id>`，状态done时读取response，response.ok=false包含错误原因。

允许动作：

```json
{"type":"create","name":"US选品","site":"com","source":"agent.csv","rows":[{"关键词":"small plastic container","原字段":"保留"}]}
```

```json
{"type":"start","taskId":"上一步返回的taskId"}
```

```json
{"type":"pause","taskId":"..."}
```

```json
{"type":"status"}
```

```json
{"type":"page","taskId":"...","page":1,"size":100,"status":"done","query":""}
```

```json
{"type":"export","taskId":"...","format":"csv"}
```

导出格式：csv/html/remaining/backup；返回text，请agent写入用户指定文件。大任务推荐按page读取（最多1000条/次），通过界面保存大备份。创建行数最多100000，原始行必须有可识别的关键词列。首次创建不自动启动；必须再发送start。

AI配置由用户在插件内保存，HTTP/HTTPS中转站均可；任务接口不返回密钥，也不自动发起AI计费请求。

## 无需安装插件的直接调用

源码包支持把解析与落盘核心接入agent自己的已连接日常Chrome。先`npm ci --ignore-scripts`，实现`adapter.example.mjs`中的fetchInBrowser接口，再运行：

```sh
node agent/collect.mjs 输入.json 自己的浏览器适配器.mjs 输出目录
```

输入格式：`{"site":"com","keywords":["small plastic container"],"concurrency":3,"delayMs":1200}`。程序逐条追加results.jsonl并更新progress.json，重跑同一命令会跳过成功词；遇异常暂停。该路径需要agent自行提供浏览器连接，不把个人Chrome Bridge路径写死到公开源码。普通用户仍使用插件版。

需要直接调用AI时，可在Node中导入`extension/ai.js`的analyze(config,prompt,data,signal)，config包括baseUrl、apiKey、model，支持HTTP/HTTPS。仅在用户授权调用时运行，不要把密钥写入输入JSON或公开仓库。
