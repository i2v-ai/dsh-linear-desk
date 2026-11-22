![Linear 工作台面板：左侧 issue 列表，右侧 issue 详情与「在会话中开始处理」按钮](preview.svg)

# Linear 工作台

在 DeepSeek Harness 里直接查看指派给你的 Linear issue，不用切到浏览器标签页。

## 它做什么

- 侧栏新增一个 **Linear 工作台** 入口（待办清单图标，order 7）。
- 主区域是一个三栏面板：顶部筛选项、左侧 issue 列表、右侧详情（描述 + 最近 15 条评论）。
- 默认视图是 **指派给我 + 未完成**，按「状态 → 优先级 → 更新时间」排序。
- 列表按状态分组（和 Linear 一样），组头可折叠，并显示组内计数。
- 详情是 Linear 式属性网格，另有父票、带进度的子任务、关联关系、附件与评论。
- 点 **在会话中开始处理**：把 issue 编号、标题、状态、链接和描述拼成一段草稿，开一个新会话并预填到输入框 —— **不会自动发送**，你补完自己的话再发。
- **复制为 Markdown** 把同样内容放到剪贴板。

## 它不做什么

- 不写 Linear：没有改状态、加评论、改指派、建 issue 的入口（这一版只读）。
- 不落盘：所有缓存都在内存里，进程重启即失效。
- 不碰会话记录：面板取数走 `ctx.tools.execute` 且不传会话，所以不会出现在任何对话的 trajectory 里。

## 数据从哪来

复用已有的 `mcp-linear` 连接（`mcp__linear__*` 工具），不在插件里另建一条 Linear 连接，因此 OAuth 登录、token 刷新都由 mcp-linear 负责。

面板页面通过 `/linear-desk/api/*` 取数，宿主半边把请求翻译成对 MCP 工具的调用：

| 接口 | 背后的 MCP 工具 |
|---|---|
| `GET /linear-desk/api/health` | 无（读 `tools` / `mcpManager` 的注册状态） |
| `GET /linear-desk/api/locales` | 无（返回随包的语言列表） |
| `GET /linear-desk/api/bootstrap` | `whoami`、`list_teams` |
| `GET /linear-desk/api/issues?view=&team=&state=&priority=&query=` | `list_issues` |
| `GET /linear-desk/api/issue?id=` | `get_issue`、`list_comments`，另加父票查询与 `list_issues({ parentId })` 取子任务 |

状态筛选里的 **未完成**（`state=open`）是面板自己合成的：Linear 的 `state` 参数只接受单一状态，表达不了「非 Done」，所以宿主不下发这个条件，而是多取一些结果后按 `statusType` 在本地过滤掉 completed / canceled。

跨工作区的父票（例如 `DAW-306`）用当前凭据读不到，面板降级成只显示 ID 链接，而不是让整个详情报错。

## 依赖与失败表现

依赖 profile 里已装的 `mcp-linear`（`@deepseek-ai/dsh-mcp-client`，`serverName: linear`）。

如果 MCP 没连上（例如宿主进程的 PATH 里找不到 `npx`，日志里会出现 `mcp-client(linear): ... spawn npx ENOENT`），面板顶部会变成红色状态并给出说明，而不是白屏。此时到「设置 → 插件」检查 mcp-linear，或重启宿主让它重新连接。

## 多语言

目前随包提供中文与英文，语言包是 `assets/i18n/*.json` 的扁平 key/value 文件。面板会先问宿主有哪些语言，取不到就回退英文、再回退成显示 key，缺翻译不会白屏。新增语言 = 加一个 JSON 文件 + 在 `LOCALES` / `LABELS` 里加一行。

## 设置

这一版没有可配置项，`cordis.patch.yml` 不传 config。团队、状态、优先级筛选都在面板里即时生效，不做持久化。
