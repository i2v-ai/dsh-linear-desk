<p align="center">
  <strong>English</strong> | <a href="./README.zh.md">简体中文</a>
</p>

<p align="center">
  <a href="https://i2v.ai">
    <img src="https://i2v.ai/brand/folded-rabbit-light.png" alt="i2v.ai" width="96">
  </a>
</p>

<h1 align="center">dsh-linear-desk</h1>

<p align="center">
  Read Linear issues inside DeepSeek Harness: a sidebar desk panel backed by the Linear MCP tools.<br>
  <a href="https://i2v.ai">Website</a> ·
  <a href="https://github.com/i2v-ai">Organization</a> ·
  <a href="./docs/DETAIL.md">Panel reference</a>
</p>

<p align="center">
  <img alt="DSH bundle" src="https://img.shields.io/badge/DSH-bundle-6366f1?style=flat-square">
  <img alt="Languages" src="https://img.shields.io/badge/languages-English%20·%20中文-0ea5e9?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square">
</p>

<br>

No browser tab, no bookmark. Open the desk from the sidebar, scan the issues assigned to you, read the description and comments, then hand the issue to a session with one click.

## What it does

| Part | File | Role |
| --- | --- | --- |
| Host half | `lib/index.js` | Serves `/linear-desk/*`, translates panel requests into `mcp__linear__*` tool calls |
| Client half | `lib/client.js` | Registers the sidebar entry (`sidebar.panellist`) and the main panel (`main`, key `linear-desk`) |
| Panel page | `assets/panel.html` | Single-file HTML/CSS/JS rendered inside the panel iframe |
| Translations | `assets/i18n/*.json` | Flat key/value dictionaries, one file per language |

- Sidebar entry **Linear desk**, main panel with filters, a status-grouped issue list, and a detail column.
- Default view: **assigned to me + open**, sorted by status, then priority, then last update.
- Detail shows description, recent comments, parent issue, sub-issues, relations, attachments, and the full property grid.
- **Start work in a session** turns the issue into a session draft. The draft is pre-filled, never auto-sent.
- **Copy as Markdown** produces a pasteable digest for a prompt or a handoff note.

## Requirements

Node.js 20 or newer, plus a DeepSeek Harness profile where the Linear MCP server is configured (see [Dependencies](#dependencies)).

## Install

```bash
git clone https://github.com/i2v-ai/dsh-linear-desk.git
```

Then, inside DeepSeek Harness, install the bundle by pointing `plugin_manager` at the checkout:

```
plugin_manager install_bundle /absolute/path/to/dsh-linear-desk
```

The install may report `application: "restart-required"` with `restartReason: "unmanaged-plugin"` even though the plugin is already live. Verify with `plugin_manager list_plugins` — the entry `include:linear-desk` should show `enabled: true` and `fiberPhase: active`.

After editing Host code, toggle the plugin off and on again to hot-reload:

```
plugin_manager set_plugin include:linear-desk enabled=false
plugin_manager set_plugin include:linear-desk enabled=true
```

Replacing the installed JavaScript itself needs a host restart.

## Dependencies

The plugin reuses the `mcp-linear` server already configured in the profile (`@deepseek-ai/dsh-mcp-client`, `serverName: linear`). It never opens its own Linear connection, so OAuth and token refresh stay in `mcp-linear`.

```yaml
- insert:
    - id: mcp-linear
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: linear
        transport: stdio
        command: npx
        args: ['-y', 'mcp-remote', 'https://mcp.linear.app/mcp']
```

If the tools are missing, the panel header shows a red status and an explanation instead of an empty page. A common cause is `spawn npx ENOENT` in the host log: the desktop app cannot resolve `npx` on `PATH`. Check `mcp-linear` under **Settings → Plugins**, or restart the host to reconnect.

## Panel API

The panel page calls these routes on the host half. Everything is read-only in this version.

| Route | Backed by MCP tool | Notes |
| --- | --- | --- |
| `GET /linear-desk/` | — | Panel page |
| `GET /linear-desk/api/health` | — | Reads `tools` / `mcpManager` registration state |
| `GET /linear-desk/api/locales` | — | Returns `{ locales, fallback }` |
| `GET /linear-desk/api/bootstrap` | `whoami`, `list_teams` | Workspace and team list |
| `GET /linear-desk/api/issues` | `list_issues` | `view`, `team`, `state`, `priority`, `query`, `limit` |
| `GET /linear-desk/api/issue?id=` | `get_issue`, `list_comments` | Plus parent and sub-issue lookups |

`state=open` is a value the panel synthesises: Linear's `state` argument accepts a single state, so the host fetches a larger page and filters out completed and canceled issues locally.

## Capability and limits

- Read-only. No status change, comment, assignment, or issue creation in this version.
- In-memory cache only: lists for 60 seconds, details for 30 seconds, workspace bootstrap for 10 minutes.
- Panel calls run through `ctx.tools.execute` without an agent or a session log, so nothing lands in a conversation trajectory.
- One MCP connection is shared with the agent. Refreshes are throttled because `mcp-remote` is single-client.
- Issues in another workspace (for example a `DAW-` parent) resolve to an ID link only — the current credentials cannot read them.

## Languages

English and Chinese ship today. A new language is one JSON file plus one line of code:

1. Copy `assets/i18n/en.json` to `assets/i18n/<lang>.json` and translate the values. Keep the keys and the `{n}` / `{s}` placeholders.
2. Add the code to `LOCALES` in `lib/index.js` and to `LABELS` in `lib/client.js`.

The panel asks the host which languages exist and falls back to English, then to the raw key, so a missing translation never blanks the UI.

## Tests

```bash
# Host routes driven by a stub ctx: registration, health, and the missing-tool 502 path
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host-check.mjs

# Every language aligned with English, no empty values, no unknown keys used by the panel
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/locale-check.mjs
```

`DSH_NODE_EXECUTABLE` is exported by the running host. Without it, use any Node.js 20+ binary.

## For AI agents

- Panel and dependency reference: [`docs/DETAIL.md`](./docs/DETAIL.md)
- Host contract: `lib/index.js` (routes, MCP tool names, cache TTLs)
- Client contract: `lib/client.js` (slot registrations, `startSession` handoff)

## Related repositories

| Surface | Repository |
| --- | --- |
| i2v.ai developer hub | [i2v-agent-tools](https://github.com/i2v-ai/i2v-agent-tools) |
| API examples | [i2v-api-examples](https://github.com/i2v-ai/i2v-api-examples) |

## License

MIT. See [LICENSE](./LICENSE). Report vulnerabilities privately — see [SECURITY.md](./SECURITY.md).
