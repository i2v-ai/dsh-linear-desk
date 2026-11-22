# dsh-linear-desk

在 DeepSeek Harness 里直接查看 Linear issue，不用切到浏览器标签页。

## 它是什么

一个 DSH bundle 插件，包含三部分：

| 部分 | 文件 | 作用 |
|---|---|---|
| Host 半边 | `lib/index.js` | 挂 `/linear-desk/*` HTTP 路由，把面板请求翻译成 `mcp__linear__*` 工具调用 |
| Client 半边 | `lib/client.js` | 注册侧栏入口（`sidebar.panellist`）和中央面板（`main` key `linear-desk`） |
| 面板页面 | `assets/panel.html` | 单文件 HTML/CSS/JS，在中央面板的 iframe 里渲染列表与详情 |

## 依赖

复用 profile 里已装的 `mcp-linear`（`@deepseek-ai/dsh-mcp-client`，`serverName: linear`）。插件**不**自己建 Linear 连接，OAuth 与 token 刷新都交给 mcp-linear。

如果 MCP 没连上，面板顶部显示红色状态与提示，而不是白屏。

## 安装

```bash
# 在 DSH 里通过 plugin_manager 安装（target 指向本目录绝对路径）
plugin_manager install_bundle /path/to/dsh-linear-desk
```

安装后若返回 `restart-required`，插件通常已热加载；改完 Host 代码可用「停用 → 启用」热重载。

## 接口

| 接口 | 背后的 MCP 工具 |
|---|---|
| `GET /linear-desk/` | 面板页面 |
| `GET /linear-desk/api/health` | 无（读 `tools` / `mcpManager` 注册状态） |
| `GET /linear-desk/api/bootstrap` | `whoami`、`list_teams` |
| `GET /linear-desk/api/issues` | `list_issues` |
| `GET /linear-desk/api/issue?id=` | `get_issue`、`list_comments` |

## 测试

```bash
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host-check.mjs
```

用假 ctx 驱动路由，验证注册、health、以及工具缺失时的 502 降级。
