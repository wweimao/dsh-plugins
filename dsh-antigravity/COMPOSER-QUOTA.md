# 输入框额度徽标

本文记录quota.2的前端额度逻辑（2026-11-10），quota.3保持该客户端不变；新增宿主请求身份修正见 [Argon接入说明](<antigravity-repair/argon-integration/package/ARGON-ACCESS.md>)。

在 Codex 同款 `conversation.input.right` 公共插槽，显示当前 Antigravity 模型对应的 **5h + 周**剩余额度。普通 Gemini（如3.8 Flash）使用 Gemini Models 组；Gemini 4 Argon 使用独立 Argon 组；Claude/GPT 使用其共享组。Argon base与Low/Medium/High均禁止向普通Gemini组兜底，出现独立Argon组也不能污染普通Gemini的匹配。两个周期同时可见，切模型只重选已有快照，不改模型/账号/授权；非 Antigravity 模型不显示本徽标。

点徽标展开详情，可看重置时间、最后更新时间与手动刷新。页面可见且有对应模型消费者时，每60秒取数；本地15秒更新时钟；隐藏页面暂停轮询，离开所有对应模型后清除缓存与计时器。并发请求合并，30秒客户端等待上限；卸载、重连、登录/登出及模型设置操作隔离旧返回。客户端取消是忽略迟到结果，不能撤销宿主已开始的共享元数据请求。

只调用原有、已鉴权的 `antiGravityAuth.describe`，不新增HTTP路由、不读取模型凭据、不发起推理。使用服务明确提供的 `5h` / `weekly`，不会拿单模型 quotaInfo 或重置时间推测周期。真实0显示0%，缺失/非法/多义窗口显示 --；过期或刷新失败有标记，绝不按倒计时自动恢复100%。

## 构建与验证

当前安装包的TypeScript源码早于既有设置页/模型开关修复，不能整体重编译替换。此次采用可重复的纯JavaScript overlay构建：保留已安装客户端facade，只嵌入新 `src/client/composer-quota.js`、扩展locale、声明modelDirectories依赖和注册新插槽。对应构建工具/新安装基线/测试保存在工作区 argon-quota 目录；构建使用此前已审核的无composer基底，且开始修正前已确认安装产物与quota.1完全一致。没有改动宿主OAuth、额度接口、原生上下文/流或Typert产物。

保留38项离线检查：选择器、缓存/超时/生命周期、显式MOCK React组件、完整发布facade挂载、发布清单及基线哈希；增加Argon隔离专项并保留原生上下文/流回归。MOCK与facade测试不等于实际浏览器视觉验收。

用户截图证明 App 将 Argon 单独计量，且当时显示100%剩余；截图仅明确其周周期，不能推断未截全的其他周期，也不能拿截图百分比作为实时数据。本修正仅隔离额度匹配，没有宣称当前插件接口已返回Argon额度或已打通模型调用。专属组/周期缺失仍显示 --。

此前隔离浏览器访问GUI遇到正常认证保护；本次未读取登录令牌或App私有会话，未启动新服务器或进行真实推理。部署后须在已登录GUI刷新验收；Argon目录/调用测试是独立待办，不以本次界面逻辑测试替代。
