# Antigravity App 原生工具调用兼容补丁

版本：0.1.0-rc.5.appctx.1；2026-11-08。

## 已确认的问题

DSH 0.2.2-rc.1 的 pi-ai 1.3.0 在 dispatch 前把 systemPrompt/tools 转为消息列表中的 system.content/toolsAdded。此插件的 pi-ai 0.82.1 传输仍从根字段读取，并跳过 system 消息。离线复现确认：原输入的系统提示和 working_directory 声明在实际 HTTP body 中消失。

另有非 STOP/MAX_TOKENS 结束原因被折成 error 后丢弃原枚举，已有工具调用还可能将它覆盖为 toolUse；SSE error 标签和顶层 error 也未处理。历史两次 Gemini 失败只剩 PI_AI_ERROR，无法倒推出当时具体停止原因；不将其猜测成鉴权、额度或某个确定的安全拦截。

## 修复边界

- 增加无依赖上下文桥：兼容旧输入和 SDK 1.x transcript，合并系统文本/sections，应用工具删除与重定义；不新增宿主未提供的权限或工具。
- 保持原有 wire model 选择、响应模型重放和签名规则。
- 在输出工具调用前识别当前帧的上游失败，保留 usage/responseId；失败不伪装成功。
- 诊断只保留有限枚举和安全整数代码；不记录原始错误正文、prompt、token、签名或 headers。未知值明确标 UNKNOWN。
- 保留 SSE 多行、UTF-8 分块、CRLF、EOF、DONE 与取消处理；畸形 JSON 不回显原始数据。
- 未更改 OAuth、账号数据、模型开关、额度/计费设置、原生授权或 Model Hub。Argon 验证继续暂停。
- 插件私有 pi-ai 固定到此次验证的 0.82.1，不升级宿主 SDK。

## 验证与仍待验收

41 项离线回归通过：真实宿主 PiAiAdapter + SDK 1.3 + 实际旧 Google 转换器配合模拟 HTTP，证明声明传递和错误传播；另有模拟工具调用/结果两轮、签名、系统/工具更新、SSE、取消、脱敏、发布文件白名单和未改文件哈希检查。初始三项关键回归已先在原代码失败，再经修复通过。

这些没有发出真实模型请求，不证明当前账户或 Gemini 端到端可用。部署后须在已经允许 google-antigravity/gemini-3.8-flash 的会话中，用新的标记进行一次原生子代理只读工具回合；本次旧维护会话仍只有 Codex 权限，不能绕过它来调用 Gemini。失败时应报告新错误，不自动切供应商或恢复 Argon。

## 构建与回退说明

本补丁基于当前安装包的 42 文件快照，保留其既有 App-only、Typert、目录与界面修复。原包的部分 src 与 lib 已存在差异，因此此次没有重新生成整个 lib，避免覆盖已验证修复；仅同步此次 API hooks 和新 helper 源码，运行时以发布的 lib 为准。发布清单明确包含所有新静态 import。

禁用插件可暂停使用而不撤销授权；如需回退，可恢复同次保存的旧安装包/快照，不应回退到会丢失 App 修复的上游旧产物。未来更新上游包前应重新跑该兼容回归。
