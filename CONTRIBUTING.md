# Contributing

Use Node.js 20 or newer. There is no build step: `lib/` and `assets/` are the runtime files, served as-is.

## Before opening a pull request

```bash
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host-check.mjs
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/locale-check.mjs
```

`DSH_NODE_EXECUTABLE` is exported by a running DeepSeek Harness host. Any Node.js 20+ binary also works with `NODE=node`.

Load the plugin in a real host before claiming a UI change works: install the checkout with `plugin_manager install_bundle`, then open the panel from the sidebar. Toggle the plugin off and on to hot-reload Host changes.

## Commit messages

English only, Conventional Commits prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Chinese is fine in code comments, documentation, and discussion.

```
✅ feat: group the issue list by status
✅ fix(panel): restore escaped markdown links
❌ feat: 列表按状态分组
```

## Translations

One flat JSON file per language under `assets/i18n/`. Keep the keys identical to `en.json` and keep the `{n}` / `{s}` placeholders. `test/locale-check.mjs` fails the build when the sets drift, when a value is empty, or when the panel uses a key that no language defines.

Adding a language means two edits: a new `assets/i18n/<lang>.json`, and one entry in `LOCALES` (`lib/index.js`) plus `LABELS` (`lib/client.js`).

## Panel code

`assets/panel.html` is a single file on purpose — it loads inside an iframe with no bundler and no framework. Keep it that way unless there is a strong reason.

- Do not hardcode user-visible strings in the markup. Every option label is filled from the dictionary at startup.
- Escape first, then whitelist. `renderMarkdown` unescapes Linear's `\[` / `\]` before HTML-escaping, strips `linear-*` tags, and only allows `http(s)` links.
- Keep the panel free of writes. This version reads Linear; write operations need their own design (confirmation, error surfacing, and the tool pipeline's pre-execute hooks).

## Reporting bugs

Open an issue with the DeepSeek Harness version, the Linear workspace type (personal or team), and the failing route or panel action. Redact tokens, cookies, and issue bodies before posting.
