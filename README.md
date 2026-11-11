# Deja 记忆增强（本地可靠性覆盖包）

基于 `dsh-deja 0.23.5` 的本地改进，面向 DSH `0.2.2-rc.1` 及其当前接口。保留 upstream MIT 许可；不是官方发布版，不修改 deja-vu 的 Go 索引、历史文件格式或检索算法。

## 改进

- 六个原有工具与 `/deja` 统一使用 `workingDirectory.get(session)`，切换目录或 worktree 后不再继承宿主启动目录。
- 惰性异步探测 CLI、共享成功探测结果、可取消子进程、执行总超时、输出上限与终止升级；不在模块加载或上下文组装时同步执行命令。
- 区分缺少可执行文件、权限错误、超时、取消、输出超限、非零退出。失败不再冒充“无匹配”，分页失败不再猜测需要升级。写入失败不自动重试。
- 自动召回在 `agent/pre-step` 中异步计算，同步 `systemPrompt.context` 仅读缓存；宿主的 `refreshContext` 会将最终文本记入会话日志，不修改预步骤消息决策。
- 按会话的 LRU 缓存、TTL、当前目录和 human-message 身份失效；取消或过期结果不发布。启动摘要不会在首次组装后、刷新前被吃掉。
- 项目、问题、文件、错误召回可分别关闭；总上下文字符预算、每条工具注释预算、每轮注释次数上限；历史始终标记为参考数据，不是执行授权。
- 增加 `/deja-status`，显示运行版本、调用/失败/命中数、最后失败类别及缓存条目数。不会执行搜索，也不显示历史文本、输入或原始 stderr。
- 通过宿主 session projection 读取已提交的人类输入；不在每步扫描整份会话日志。

原有六个工具的模型可见名称、描述、参数保持完全一致，回归测试逐字比较，因此首轮工具 schema 的 token 增量为 **0**。

## 安装与回滚

本地目录采用链接安装，因此先在此源码目录执行 `pnpm install --ignore-scripts` 准备锁定依赖，再通过 DSH `plugin_manager install_bundle` 安装此目录。不要在 profile 目录运行包管理器或手工修改其文件。

本包的 patch 禁用原 `deja` 行，然后启用 `deja-reliability` 行。原版包和原有配置仍然保留。若需回滚，在插件管理器停用整个 `@local/dsh-deja-reliability` **bundle**；不要仅停用它的插件行，否则禁用原版的覆盖仍在。

安装是否实时生效，以插件管理器的 `application` 和 `nextStep` 返回值为准。此目录是本地安装的源码，请不要安装后随意移动或删除。

## 配置默认值

| 字段 | 默认值 | 含义 |
|---|---:|---|
| autoRecall | true | 自动召回总开关，手动工具保持可用 |
| projectRecall / promptRecall | true | 项目摘要 / 人类提问召回 |
| fileRecall / errorRecall | true | 文件历史 / 命令报错经验 |
| captureCompaction | true | 压缩前记录恢复信息 |
| timeoutMs | 20000 | 手动调用总超时（含可执行文件探测） |
| hookTimeoutMs | 2500 | 每个自动 hook 的超时 |
| cacheTtlMs | 300000 | 问题召回缓存有效期 |
| maxSessions | 128 | 最多缓存会话数 |
| maxContextChars | 12000 | 项目和问题召回合计字符预算（不是 token 数） |
| maxToolNoteChars | 3000 | 单条文件/报错注释字符预算 |
| maxToolNotesPerTurn | 8 | 每轮最多自动注释次数 |

CLI 查找沿用 `DEJA_BIN`、PATH、npm 平台二进制的顺序。保留原版 CLI 安装器重复注册避让规则。

## 测试

```sh
node --test test/*.test.js
```

测试使用隔离的 Node 子进程及宿主替身，不写真实记忆。覆盖所有工具当前目录、失败分类、CLI argv、分页、prompt schema 不变、多会话 A/B/A 缓存、目录/TTL/压缩失效、上下文预算、安全分隔、取消、卸载和子进程终止。

## 边界

- 这不是召回准确率评测，也没有引入 LLM 或向量服务。
- 自动项目摘要和问题召回可能各等待一个 hookTimeoutMs，但等待不会阻塞宿主事件循环。
- 文件和报错注释保留原 CLI 的去重语义；本包额外在每轮去重和限额。
- 当前通知面板沿用 upstream 的取走即删机制，尚未改为确认式交付；不把这一点宣称为已修复。
- 正常 session/disposed 异步清理 CLI 的活跃会话标记；插件卸载按顺序取消普通召回、以最多四路并发在最多两秒内排空清理，再销毁执行器。强制退出或超时未清理的标记由 CLI 自身的过期规则处理，不使用阻塞进程退出的同步调用。

## 本机验收（2026-11-10）

- 39 项回归测试全部通过，含真实 Node 子进程、宿主接口替身、真实 Config 校验与模块加载。
- 插件管理器返回 `application: applied`，增强行已激活，原版行已停用但包仍保留。
- 已验证实际 `deja_recall` 查询，以及当前会话运行上下文中的增强版自动召回。
- 已确认客户端通知槽位和安装后的中英文元数据、原创 SVG 资源；未进行截图式视觉验收。

## 来源与资源

`lib.js`、`client.js` 及 `upstream/index.js` 来源于 Vladislav Shulcz 的 `deja-vu/extensions/dsh` 0.23.5（MIT）。`upstream/` 仅供本地回归比较，不参与发布。`icon.svg` 为本地原创矢量图标，随本包按 MIT 许可使用。
