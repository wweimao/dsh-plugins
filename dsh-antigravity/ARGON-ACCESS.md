# Argon App hub 请求身份修正

版本：0.1.0-rc.5.quota.3（2026-11-10）。

## 已定位原因与证据

相同账号、项目和CCPA接口，请求体不变：旧的简写User-Agent无法取得Argon；公开App使用hub子客户端标识。当前App 2.29.0公开启动代码指定subclient_type=hub；公开Go UserAgent构造为name/subclient/ideVersion加平台详情。本版改为：

```
antigravity/hub/2.29.0 (aidev_client; os_type=darwin; arch=arm64)
```

10:27与10:32的只读实时对照分别验证带公开CL及不带任何可选详情的hub格式：daily和production均返回Argon Low/Medium/High，以及明确的Gemini 4 Argon独立weekly bucket。选择最小格式，不假造auth_method、CL、host_path、purpose、enterprise entitlement或X-Goog-User-Project；不复制App会话/令牌，不改账号、套餐、项目或请求体。

## 影响范围

仅修改共用antiGravityHeaders的UA，源码及运行产物保持一致。目录、额度、项目发现、生成请求统一经过此函数；OAuth token exchange本身不变。保留quota.2分组、模型开关、完整客户端、上下文/流兼容和Typert。Argon来自真正的服务端目录，不是手工追加路由。

当前服务明确返回Argon周额度，没有Argon 5h bucket；客户端沿用缺失周期显示 -- 的规则，不制造5h值或借普通Gemini额度。模型三档合并与默认启用规则原本已支持Argon，继续尊重用户显式关闭设置。

## 验收边界

已证实真实模型目录/额度响应，不等于真实推理已成功。离线mock传输仅验证请求header、路由与处理逻辑；必须另有正式原生允许路由的真实请求才能宣称调用成功。当前会话native子代理仅授权Codex，不能用直HTTP/脚本绕过。GUI仍需已登录窗口确认。

不整体重建旧TypeScript树（它含历史漂移），仅做已审函数的最小同义修改并保留其他字节。发布后通过完整回归、安装哈希与实时注册模型目录复核；回退使用quota.2完整归档。
