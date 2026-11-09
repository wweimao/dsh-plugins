# DSH Plugins · DeepSeek Harness 插件集合

本仓库汇集了针对 [DeepSeek Harness](https://github.com/deepseek-ai) 开发的自研插件集合，包含模型池动态调度、安全 SSH 服务器工具以及本地计划本与轻量工单管理。

---

## 插件清单

| 插件目录 | 包名 | 说明 | 核心能力 |
|---|---|---|---|
| [`dsh-model-hub`](./dsh-model-hub) | `@local/dsh-model-hub` | 统一模型池与跨渠道调度 | 汇集各挂载渠道模型，主 Agent 动态挑选子代理，支持两阶段授权与安全过滤 |
| [`dsh-named-ssh`](./dsh-named-ssh) | `@local/dsh-named-ssh` | 独立 SSH 服务器别名工具 | 用户设置页保管凭据与主机指纹，Agent 仅通过别名受控执行远程命令 |
| [`dsh-planner`](./dsh-planner) | `@local/dsh-planner` | 本地计划本与任务备忘 | 原生 storageDomain 持久化，提供工单、纯文本备忘、月历看板及 AI 工具 |

---

## 仓库结构

```text
dsh-plugins/
├── README.md                  # 仓库总览与使用说明
├── LICENSE                    # MIT 开源协议
├── .gitignore                 # 依赖、构建生成物与敏感数据忽略规则
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

各个插件为独立的 DSH 插件包，可按需安装具体插件子目录：

### 方式一：通过 DSH Plugin Manager（推荐）
在 DSH 插件管理界面中安装或通过命令：
```sh
# 安装单个插件（例如 dsh-planner）
dsh plugin --profile web add ./dsh-plugins/dsh-planner
```

### 方式二：开发模式软链接
在 profile 中以 `link:` 方式引入具体插件目录：
```json
{
  "dependencies": {
    "@local/dsh-planner": "link:/path/to/dsh-plugins/dsh-planner"
  }
}
```

---

## 本地开发与测试

环境要求：Node.js >= 22。

```sh
# 检查各插件语法
cd dsh-model-hub && node --check index.js core.js pool.js client.js
cd ../dsh-named-ssh && node --check index.js core.js client.js
cd ../dsh-planner && node --check index.js core.js runtime.js tools.js client.js

# 运行各插件的自动化测试
cd dsh-model-hub && node --test test/core.test.js test/pool.test.js
cd ../dsh-named-ssh && node --test test/*.test.js
cd ../dsh-planner && node --test test/*.test.js
```

---

## 安全设计原则

1. **凭据隔离**：SSH 凭据仅由用户在设置面板中输入并经系统凭据域托管，不进入模型上下文、提示词或聊天记录。
2. **两阶段授权**：模型池新增渠道与候选模型需经用户显式勾选与确认，避免意外暴露推理权限。
3. **安全数据流**：本地计划本数据仅保存在原生 storageDomain，跨会话隔离且不自动注入系统提示词。
4. **排除敏感信息**：仓库中排除了本地调试过程文档、开发私有路径、临时 token 及环境运行数据。

---

## License

[MIT](./LICENSE)
