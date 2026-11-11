# DSH Plugins · DeepSeek Harness 插件集合

本仓库汇集了针对 [DeepSeek Harness](https://github.com/deepseek-ai) 开发的自研与深度定制插件集合，包含 Google Anti Gravity 直连与额度徽标、统一模型池调度、安全 SSH 服务器工具以及本地计划本与轻量工单管理。

---

## 插件清单

| 插件目录 | 包名 | 说明 | 核心能力 |
|---|---|---|---|
| [`dsh-antigravity`](./dsh-antigravity) | `@deepseek-ai/dsh-llm-pi-ai-antigravity` | Google Anti Gravity LLM Provider | 直连 Cloud Code Assist (Gemini / Claude / GPT)，macOS 签名导入与 Windows x64 固定版本显式批准导入、浏览器 OAuth、Thinking 档位映射、5h/周额度及原生上下文桥接 |
| [`dsh-model-hub`](./dsh-model-hub) | `@local/dsh-model-hub` | 统一模型池与跨渠道调度 | 汇集各挂载渠道模型，主 Agent 动态挑选子代理，支持两阶段授权与安全过滤 |
| [`dsh-named-ssh`](./dsh-named-ssh) | `@local/dsh-named-ssh` | 独立 SSH 服务器别名工具 | 用户设置页保管凭据与主机指纹，Agent 仅通过别名受控执行远程命令 |
| [`dsh-planner`](./dsh-planner) | `@local/dsh-planner` | 本地计划本与任务备忘 | 原生 storageDomain 持久化，提供工单、纯文本备忘、月历看板及 AI 工具 |
| [`dsh-allow-all-permission`](./dsh-allow-all-permission) | `@local/dsh-allow-all-permission` | 无限制全放行权限预设 | 增加 `allow-all`（无限制全放行）权限模式，放开沙箱限制并自动放行智能体的所有审核与工具调用 |

---

## 仓库结构

```text
dsh-plugins/
├── README.md                  # 仓库总览与使用说明
├── LICENSE                    # MIT 开源协议
├── .gitignore                 # 依赖、构建生成物与敏感数据忽略规则
├── dsh-antigravity/           # Google Anti Gravity LLM 驱动插件
│   ├── package.json           # 模块元数据与声明
│   ├── cordis.patch.yml       # Cordis 补丁定义
│   ├── README.md              # 插件说明 (英文)
│   ├── README.zh.md           # 插件说明 (中文)
│   ├── COMPOSER-QUOTA.md      # 输入框 5h/周额度设计与架构说明
│   ├── NATIVE-CONTEXT-REPAIR.md # 原生上下文与流式诊断修复说明
│   ├── lib/                   # 预构建运行文件 (OAuth、适配层、客户端、Typert)
│   ├── src/                   # TypeScript 与组件源码 (额度组件、OAuth、适配器)
│   └── test/                  # 额度控制器、UI 组件与流式诊断测试
├── dsh-model-hub/             # 统一模型池插件
│   ├── index.js               # 插件入口与生命周期
│   ├── core.js                # 配置校验与预设管理
│   ├── pool.js                # 模型池目录元数据管理
│   ├── client.js              # Web GUI 设置页
│   ├── cordis.patch.yml       # Cordis 补丁定义
│   ├── package.json           # 模块元数据与声明
│   ├── README.md              # 插件详细使用与 API 文档
│   └── test/                  # 核心、目录、UI 与 Host 桥接测试
├── dsh-named-ssh/             # SSH 服务器别名工具插件
│   ├── index.js               # 宿主工具与执行确认接口
│   ├── core.js                # 连接、指纹、凭据与输出脱敏
│   ├── client.js              # Web GUI 服务器配置面板
│   ├── icon.svg               # 原创插件图标
│   ├── cordis.patch.yml       # Cordis 补丁定义
│   ├── package.json           # 模块元数据与声明
│   ├── pnpm-lock.yaml         # 依赖版本锁定
│   ├── README.md              # 详细说明与安全边界
│   ├── locale/                # 中英文多语言定义
│   └── test/                  # 核心逻辑与宿主契约测试
└── dsh-planner/               # 本地计划本插件
    ├── index.js               # 插件生命周期与存储挂载
    ├── core.js                # 事项模型、CRUD 校验与冲突控制
    ├── runtime.js             # 存储域持久化与变更通知
    ├── tools.js               # AI 模型工具定义
    ├── client.js              # Web GUI 计划本与聊天浮窗组件
    ├── icon.svg               # 原创插件图标
    ├── cordis.patch.yml       # Cordis 补丁定义
    ├── package.json           # 模块元数据与声明
    ├── pnpm-lock.yaml         # 依赖版本锁定
    ├── README.md              # 详细说明与权限边界
    ├── locale/                # 中英文多语言定义
    └── test/                  # 存储、契约、静态规则与包完整性测试
```

---

## 安装使用

各个插件为独立的 DSH 插件包，可按需安装具体插件子目录。

**AntiGravity Windows 用户注意：** 仅支持已评审的 App 2.30.0 x64 构建，公开包不会自动批准未签名程序；需要本人核对来源与 SHA-256 并显式设置 `windowsApplicationSha256`，详见 [Windows 配置说明](./dsh-antigravity/README.zh.md#windows-支持010-rc5quota1windows1)。macOS 继续使用签名校验导入。

### 方式一：通过 DSH Plugin Manager（推荐）
在 DSH 插件管理界面中安装或通过命令：
```sh
# 安装单个插件（例如 dsh-antigravity 或 dsh-planner）
dsh plugin --profile web add ./dsh-plugins/dsh-antigravity
```

### 方式二：开发模式软链接
在 profile 中以 `link:` 方式引入具体插件目录：
```json
{
  "dependencies": {
    "@deepseek-ai/dsh-llm-pi-ai-antigravity": "link:/path/to/dsh-plugins/dsh-antigravity"
  }
}
```

---

## 本地开发与测试

环境要求：Node.js >= 22。

```sh
# 检查各插件语法
cd dsh-antigravity && npm run check
cd ../dsh-model-hub && npm run check
cd ../dsh-named-ssh && npm run check
cd ../dsh-planner && npm run check

# 运行各插件的自动化测试
cd dsh-antigravity && npm test
cd ../dsh-model-hub && npm test
cd ../dsh-named-ssh && npm test
cd ../dsh-planner && npm test
```

---

## 安全设计原则

1. **凭据隔离**：OAuth 客户端配置与用户 Token 均由 Harness 凭据服务在受限存储中管理，不进入模型上下文、提示词或聊天记录。
2. **两阶段授权**：模型池新增渠道与候选模型需经用户显式勾选与确认，避免意外暴露推理权限。
3. **安全数据流**：本地计划本数据仅保存在原生 storageDomain，跨会话隔离且不自动注入系统提示词。
4. **排除敏感信息**：仓库中严格排除了本地调试过程文档、开发私有路径、临时 token 及环境运行数据。

---

## License

[MIT](./LICENSE)
