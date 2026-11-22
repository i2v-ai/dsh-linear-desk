# Distribution plan

How this plugin reaches users, and what is left before each step can run.

## Where the plugin is today

| Surface | State |
| --- | --- |
| Repository | Public: <https://github.com/i2v-ai/dsh-linear-desk> |
| Install from source | Works: `plugin_manager install_bundle /absolute/path/to/dsh-linear-desk` |
| Install from git | Works: `plugin_manager install_bundle github:i2v-ai/dsh-linear-desk` |
| npm | Package name `dsh-linear-desk` is still free; nothing published |
| Marketplace listings | Not listed anywhere yet |
| Storefront metadata | `icon`, `screenshots.json`, bilingual README in place |

## 1. npm

Publishing matters for two reasons, and neither is "discovery":

- Prebuilt installs skip pnpm's build-approval step (`allowBuilds`), which is where most
  source installs of a git-hosted plugin trip.
- Storefronts read npm's 30-day download count and can sort by it.

### Steps

```bash
cd /path/to/dsh-linear-desk
npm login              # needs the publishing account, plus a 2FA code
npm publish            # publishConfig.access is already "public"
```

Then confirm:

```bash
npm view dsh-linear-desk version
plugin_manager install_bundle dsh-linear-desk     # registry spec, no path
```

### Package name

`dsh-linear-desk` — the unscoped name is free, matches the repository, and the `dsh-` prefix
is the local convention (matching `dsh-media-desk`, `dsh-better-sidebar`, `dsh-notify-me`).
An `@i2v-ai/` scope is available too, but nothing in either marketplace keys off the npm
scope: both link a package to a repository through the published `repository` field.

### Before the next version

Bump `version`, then republish. The host loads the installed JavaScript once per process, so
users pick up a new version after restarting DeepSeek Harness.

## 2. Marketplace listings

Both storefronts read from one catalog, so there is really one submission here plus one
follow-up.

### awesome-dsh-plugin (the only submission form)

Everything else mirrors this repository, so this is the file to change:
`data/plugins/i2v-ai__dsh-linear-desk.yml`

```yaml
url: https://github.com/i2v-ai/dsh-linear-desk
name: i2v-ai/dsh-linear-desk
category: ui
description:
  en: 'Adds a sidebar issue desk backed by the Linear MCP server: status-grouped list, issue detail with parent and sub-issues, and one-click handoff to a new session draft.'
  zh: '在侧栏加一个 Linear 任务工作台：按状态分组的列表、含父票与子任务的详情，并支持一键把 issue 带进新会话草稿。'
icon: https://raw.githubusercontent.com/i2v-ai/dsh-linear-desk/main/assets/brand/icon-180.png
```

Rules that apply to this entry, all already satisfied except the age bar:

| Gate | State |
| --- | --- |
| `package.json` declares `dsh.bundle` | Yes |
| `cordis.patch.yml` at repository root | Yes |
| Repository is at least one day old | **No** — created 2026-11-22T07:52Z; eligible after 2026-11-23T07:52Z |
| `dsh-plugin` topic | Yes |
| Description matches the code | Yes — read-only panel, two cached endpoints, one MCP dependency |

Open one pull request that adds that single file. The generated README must not be edited by
hand. If a maintainer asks for a change, push to the same branch and leave one comment.

`realguan`'s index (11k+ plugins) is rebuilt from this catalog every day and takes no
submissions of its own.

### dshopen.org

Requires a public repository, an npm release, and a license — so it comes after step 1.
Submission is a GitHub request on their repository; once accepted, the entry can carry a
likes badge:

```md
<a href="https://dshopen.org/i2v-ai/dsh-linear-desk"><img alt="dshopen" src="https://dshopen.org/api/card/i2v-ai/dsh-linear-desk?lang=en"></a>
```

### dshfind.com

A community browser of the same catalog with editorial pages. There is no public submission
form; contact the maintainer once the npm release and the catalog entry exist.

## 3. GitHub repository metadata

- **About**: one sentence, no superlatives.
  `Read Linear issues inside DeepSeek Harness: a sidebar desk panel backed by the Linear MCP tools.`
- **Homepage**: `https://i2v.ai` (not the repository URL).
- **Topics**: `dsh`, `dsh-plugin`, `deepseek-harness`, `linear`, `mcp`, `mcp-server` — six, matching the org standard.
- **Social preview**: upload `assets/screenshots/panel-zh.webp` as a 1280×640 crop, or a dedicated card under `https://i2v.ai/brand/`.

## 4. i2v.ai

The site has no plugins section today (`content/pages` holds policy and comparison pages
only). Two placement options, cheapest first:

1. A documentation page under the existing docs tree, written from `docs/DETAIL.md`, linking
   to the repository. No new route, no new component.
2. A model-page-style landing page if the plugin line grows past a handful of entries.

## 5. Release rhythm

| When | What |
| --- | --- |
| Now | Repository is public and installable from git |
| After `npm login` | Publish `dsh-linear-desk@0.1.0`, switch the README install command to the registry spec |
| 2026-11-23T07:52Z+ | Open the awesome-dsh-plugin entry |
| After the catalog merge | dshopen request, then dshfind contact |
| Any later version | Bump, publish, and leave the catalog alone — it reads npm and the repository |

## Notes on the honest limits

Two things worth stating in the listing, because reviewers read the code against the claims:

- The panel is **read-only**: it never mutates a Linear issue.
- The panel reads through the Linear MCP server, so it shares one connection with the agent
  and cannot show issues from a workspace the current credentials cannot read.
