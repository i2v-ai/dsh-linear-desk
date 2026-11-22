// 语言包一致性检查：所有语言 key 必须对齐，且面板里用到的 key 必须都存在。
//   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/locale-check.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const I18N = join(ROOT, 'assets/i18n')

const files = readdirSync(I18N).filter((name) => name.endsWith('.json')).sort()
if (!files.length) {
  console.error('no locale files under assets/i18n')
  process.exit(1)
}

const dicts = new Map()
for (const file of files) {
  const lang = file.slice(0, -'.json'.length)
  dicts.set(lang, JSON.parse(readFileSync(join(I18N, file), 'utf8')))
}

const base = dicts.get('en') ?? dicts.get([...dicts.keys()][0])
const problems = []

for (const [lang, dict] of dicts) {
  for (const key of Object.keys(base)) {
    if (!(key in dict)) problems.push(`${lang}: missing key "${key}"`)
  }
  for (const key of Object.keys(dict)) {
    if (!(key in base)) problems.push(`${lang}: extra key "${key}"`)
  }
  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string' || !value.trim()) problems.push(`${lang}: "${key}" is not a non-empty string`)
  }
}

// 面板里 t('…') 用到的 key 必须都在语言包里
const panel = readFileSync(join(ROOT, 'assets/panel.html'), 'utf8')
const used = new Set([...panel.matchAll(/\bt\('([A-Za-z0-9_]+)'/g)].map((match) => match[1]))
for (const key of used) {
  if (!(key in base)) problems.push(`panel.html uses unknown key "${key}"`)
}

// 宿主声明的语言列表必须和磁盘上的文件对齐
const host = readFileSync(join(ROOT, 'lib/index.js'), 'utf8')
const declared = host.match(/const LOCALES = \[([^\]]*)\]/)
if (!declared) problems.push('lib/index.js does not declare LOCALES')
else {
  const list = [...declared[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  for (const lang of list) {
    if (!dicts.has(lang)) problems.push(`LOCALES declares "${lang}" but assets/i18n/${lang}.json is missing`)
  }
  for (const lang of dicts.keys()) {
    if (!list.includes(lang)) problems.push(`assets/i18n/${lang}.json exists but LOCALES does not declare it`)
  }
}

if (problems.length) {
  console.error(`locale check failed (${problems.length} problem(s)):`)
  for (const problem of problems) console.error('  - ' + problem)
  process.exit(1)
}

console.log(`locale check ok: ${dicts.size} languages × ${Object.keys(base).length} keys, ${used.size} keys used by panel`)
