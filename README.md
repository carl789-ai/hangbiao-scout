# 航标选品 · Hangbiao Scout

本地优先的 Amazon 关键词与商品研究工具。2.0.0-beta.1 是新的独立实现，不依赖原供应商账号、原前端包、Codex、Chrome AI Bridge 或本地后端。普通用户只需 Chrome 116+。代码开放，采集结果只保存在自己的 Chrome。

## 下载与安装

从 [GitHub 下载页](https://github.com/carl789-ai/hangbiao-scout/releases)选择对应系统的 ZIP。发布包分为 **Mac** 和 **Windows** 两份，插件代码一致，教程分别对应系统。解压后在 Chrome 的 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，选中 `extension` 文件夹。也可将这个文件夹拖进已开启开发者模式的扩展管理页。不能将普通 ZIP 直接当作商店扩展安装。

- [Mac 安装教程](docs/安装-Mac.md)
- [Windows 安装教程](docs/安装-Windows.md)
- [使用教程](docs/使用教程.md)
- [技术与内存说明](docs/技术说明.md)
- [版本验收范围](docs/验收记录.md)

普通用户无需 Node、Python、agent 或终端。不要移动或删除已加载的插件文件夹。

## 能力

- 多份 XLSX / CSV / TSV / TXT 导入；识别 ABA 搜索词列。关键词按站点内去重采集，原始行与来源保留。
- 非广告商品按 ASIN 去重；首页商品数、蓝海值、蓝海比率、均价、评论和购买标签汇总。
- 每个词事务保存；异常暂停；同电脑继续或 JSON 任务备份恢复。已完成 HTML / CSV 和未完成清单随时导出。
- 清晰区分已采集、待采集、待重试、正常搜索与专题跳转；关键词/来源/状态/蓝海筛选、排序、页码跳转。
- 从已打开的 Amazon 搜索页读取商品资料；按实际输入计算利润；7类可编辑 AI 分析模板。
- 用户自行配置 OpenAI Chat Completions 兼容中转站，支持 **http://** 和 **https://**。采集本身不调用 AI。
- 可选本机 Agent 接口，支持建立、启动、暂停、查询、分页读取和导出任务。

缺失的供应商服务端指标（FBA自动费率、父子体月销、云端商品库等）不会伪造。FBA必须手动输入，购买标签不等于精确月销。旧数据文件和旧还原版不在此包内，也未被本次修改。

## Agent 接入

有 Node.js 20+ 时运行 `node agent/server.mjs`。将输出的本机 URL 和令牌填入插件设置，保持工作台页打开。详见 [Agent 接入](agent/README.md) 和 [AGENTS.md](AGENTS.md)。AI URL / Key 在插件设置中填写；接入本机服务不会自动配置或调用 AI。

## 开发

```sh
npm ci --ignore-scripts
npm test
python3 scripts/package.py
```

运行插件不安装 npm 依赖；测试依赖仅用于开发。发布脚本输出 Mac、Windows 和源码包及 SHA256 校验文件；`.github/workflows/release.yml` 可在 GitHub tag 推送时生成 Release 附件。公开仓库：<https://github.com/carl789-ai/hangbiao-scout>；安装包见 [Releases](https://github.com/carl789-ai/hangbiao-scout/releases)。

## 授权

本项目新增源码以 MIT 授权。XLSX 解压依赖 `fflate 0.8.2`，其 MIT 许可附在 `extension/vendor/fflate.LICENSE`。不包含原厂商前端、品牌、密钥或用户采集数据。
