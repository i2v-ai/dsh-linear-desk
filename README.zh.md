<p align="center">
  <a href="https://i2v.ai">
    <img src="https://i2v.ai/brand/folded-rabbit-light.png" alt="i2v.ai" width="96">
  </a>
</p>

<h1 align="center">dsh-linear-desk</h1>

<p align="center">
  在 DeepSeek Harness 里直接看 Linear：侧栏一个工作台面板，数据来自 Linear 官方 MCP。<br>
  <a href="https://i2v.ai">官网</a> ·
  <a href="https://github.com/i2v-ai">组织</a> ·
  <a href="./docs/DETAIL.zh.md">面板说明</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-linear-desk"><img alt="npm version" src="https://img.shields.io/npm/v/dsh-linear-desk?style=flat-square&label=npm"></a>
  <img alt="DSH bundle" src="https://img.shields.io/badge/DSH-bundle-6366f1?style=flat-square">
  <img alt="Languages" src="https://img.shields.io/badge/languages-English%20·%20中文-0ea5e9?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square">
</p>

<br>

不用开浏览器标签页，也不用加书签。从侧栏打开工作台，扫一眼指派给自己的 issue，读完描述和评论，一键把这张票交接给新会话。

## 它做什么

| 部分 | 文件 | 职责 |
| --- | --- | --- |
| Host 半边 | `lib/index.js` | 提供 `/linear-desk/*` 路由，把面板请求翻译成 `mcp__linear__*` 工具调用 |
| Client 半边 | `lib/client.js` | 注册侧栏入口（`sidebar.panellist`）与主面板（`main`，key 为 `linear-desk`） |
| 面板页面 | `assets/panel.html` | 面板 iframe 内的单文件 HTML/CSS/JS |
| 语言包 | `assets/i18n/*.json` | 扁平键值字典，一种语言一个文件 |

- 侧栏入口 **Linear 工作台**，主面板含筛选条、按状态分组的 issue 列表、详情栏。
- 默认视图：**指派给我 + 未完成**，按状态、优先级、最后更新时间排序。
- 详情展示描述、最近评论、父票、子任务、关联、附件，以及完整的属性网格。
- **在会话中开始处理** 会把 issue 变成会话草稿。只预填，绝不自动发送。
- **复制为 Markdown** 生成一份可直接粘进 prompt 或交接单的摘要。

不离开列表就能用的快捷键：

| 按键 | 作用 |
| --- | --- |
| `j` / `k` 或 `↓` / `↑` | 在 issue 列表里移动 |
| `/` | 聚焦搜索框 |
| `r`、`Cmd+R`、`Ctrl+R` | 只刷新列表、不重载页面（筛选与选中都保留） |
| `Esc` | 退出搜索框 |

面板跟随系统外观，遵守「减少动态效果」与「提高对比度」；所有控件都有读屏可读的名字，键盘走查时焦点环始终可见。

## 环境要求

Node.js 20 或更高版本，DeepSeek Harness 0.2.1-rc.5 或更高版本。除此之外只需要一个 Linear 账号：不用 clone 仓库，不用 `npx`，也不用自己注册 OAuth 应用。

## 安装

在 DeepSeek Harness 里直接从 npm registry 安装：

```
plugin_manager install_bundle dsh-linear-desk
```

安装可能返回 `application: "restart-required"`、`restartReason: "unmanaged-plugin"`，但插件其实已经生效。用 `plugin_manager list_plugins` 核对：条目 `include:linear-desk` 应显示 `enabled: true` 与 `fiberPhase: active`。刷新一次页面就能在侧栏看到入口。

其他安装形态：

| 来源 | 命令 |
| --- | --- |
| npm registry | `plugin_manager install_bundle dsh-linear-desk` |
| 固定版本 | `plugin_manager install_bundle dsh-linear-desk@0.1.0` |
| git 仓库 | `plugin_manager install_bundle github:i2v-ai/dsh-linear-desk` |
| 本地路径 | `plugin_manager install_bundle /absolute/path/to/dsh-linear-desk` |

在本地 checkout 里改完 Host 代码后，关闭再启用即可热重载：

```
plugin_manager set_plugin include:linear-desk enabled=false
plugin_manager set_plugin include:linear-desk enabled=true
```

替换已安装的 JS 本身需要重启宿主。

## 接入 Linear

面板需要一条可用的 Linear MCP 连接。它按下面的顺序挑：

1. **你自己已经在跑的 `mcp-linear`**（`serverName: linear`，工具名形如 `mcp__linear__*`）。它连着，工作台就直接用它，不会再开第二条连接。
2. **插件自己注册的连接**（`serverName: linear_desk`，指向 Linear 官方只读端点 `https://mcp.linear.app/mcp/readonly`）。只有在完全找不到可用 Linear 工具、且名字没被占用时才会注册，所以不会跟你自己的配置打架。

走到第二条路径且还没存过 key 时，面板顶部会出现一个 Linear API key 输入框。去 **Linear → Settings → Security & access → Personal API keys** 建一个，粘贴进去就立刻连上。key 存进宿主凭据库的 `LINEAR_API_KEY`，通过 `${credential:LINEAR_API_KEY}` 传输模板注入请求头；面板不保存、不回显。

想自己接线也行，在 profile 的 `cordis.patch.yml` 里加下面这段，插件就会直接用它：

```yaml
- insert:
    - id: mcp-linear
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: linear
        transport: streamable-http
        url: https://mcp.linear.app/mcp/readonly
        headers:
          Authorization: Bearer ${credential:LINEAR_API_KEY}
```

如果连不上任何一条连接，面板顶部会显示红色状态和原因说明，而不是一片空白。

## 面板接口

面板页面调用 Host 半边的这些路由。issue 数据当前只读；唯一的写接口用来存 Linear API key。

| 路由 | 背后的 MCP 工具 | 说明 |
| --- | --- | --- |
| `GET /linear-desk/` | — | 面板页面 |
| `GET /linear-desk/api/health` | — | 当前使用的工具前缀、MCP 连接状态、凭据状态 |
| `GET /linear-desk/api/locales` | — | 返回 `{ locales, fallback }` |
| `GET /linear-desk/api/bootstrap` | `whoami`、`list_teams` | 工作区与团队列表 |
| `GET /linear-desk/api/issues` | `list_issues` | `view`、`team`、`state`、`priority`、`query`、`limit` |
| `GET /linear-desk/api/issue?id=` | `get_issue`、`list_comments` | 另外取父票与子任务 |
| `POST /linear-desk/api/credential` | — | `{ "value": "lin_api_…" }` 存入 `LINEAR_API_KEY`；空值表示删除 |

`state=open` 是面板合成的取值：Linear 的 `state` 参数只接受单个状态，所以 Host 多取一页，再在本地过滤掉已完成与已取消。

## 能力与限制

- issue 数据只读。当前版本不支持改状态、写评论、改指派或建票；唯一的写操作就是上面那条存 key 的路由。
- 连接择优：你自己的 `mcp-linear` 连着就用它，否则插件才注册 `linear_desk` 指向 Linear 官方只读端点。
- 只在内存里缓存：列表 60 秒、详情 30 秒、工作区元信息 10 分钟。
- 面板调用走 `ctx.tools.execute`，不带 agent 也不带会话日志，因此不会写进任何对话轨迹。
- MCP 连接与 agent 共用一条。单个 MCP server 进程同时服务两边，所以刷新做了节流。
- 其他工作区的 issue（例如 `DAW-` 开头的父票）只能解析成 ID 链接——当前凭据读不到。

## 多语言

目前提供英文与中文。新增一种语言 = 一个 JSON 文件加一行代码：

1. 复制 `assets/i18n/en.json` 为 `assets/i18n/<lang>.json` 并翻译取值。保留键名与 `{n}` / `{s}` 占位符。
2. 把语言代码加进 `lib/index.js` 的 `LOCALES` 与 `lib/client.js` 的 `LABELS`。

面板会先问宿主支持哪些语言，回退顺序是英文、然后是原始键名，所以缺翻译永远不会把界面变空白。

## 测试

```bash
# 用桩 ctx 驱动 Host 路由：注册、health、以及工具缺失时的 502 路径
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host-check.mjs

# 各语言与英文对齐、没有空值、面板用到的键都存在
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/locale-check.mjs
```

`DSH_NODE_EXECUTABLE` 由运行中的宿主导出。没有它时，用任意 Node.js 20+ 即可。

## 给 AI agent

- 面板与依赖说明：[`docs/DETAIL.zh.md`](./docs/DETAIL.zh.md)
- Host 契约：`lib/index.js`（路由、MCP 工具名、缓存 TTL）
- Client 契约：`lib/client.js`（slot 注册、`startSession` 交接）

## 相关仓库

| 面 | 仓库 |
| --- | --- |
| i2v.ai 开发者中心 | [i2v-agent-tools](https://github.com/i2v-ai/i2v-agent-tools) |
| API 示例 | [i2v-api-examples](https://github.com/i2v-ai/i2v-api-examples) |

## 许可

MIT。见 [LICENSE](./LICENSE)。安全问题请私下报告——见 [SECURITY.md](./SECURITY.md)。
