// dsh-linear-desk · Host 半边（Cordis 插件）
//
// 职责：把宿主里已有的 mcp__linear__* 工具包成一组同源 HTTP 接口，供面板页面取数。
//   - 面板页面（assets/panel.*）通过相对 fetch 调 /linear-desk/api/*
//   - 这里用 ctx.tools.execute 调 MCP 工具，不经过会话、不写 session 日志
//     （ToolBatchInput 不带 agent / log 时，batch 结算不会触碰任何会话）
//
// 只读：本插件不提供任何写 Linear 的操作。
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-linear-desk'

// webServer 是 Web profile 的核心服务，硬注入是安全的；tools / connection / mcpManager
// 一律用 ctx.get 取，避免服务缺失时插件卡在"加载中"。
export const inject = ['webServer']

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASE = '/linear-desk'
const ASSETS = join(ROOT, 'assets')

/**
 * 可用的 Linear MCP server 名，按优先级排列，工具名形如 mcp__linear__list_issues：
 *   - linear      ：用户自己在 profile 里配的 mcp-linear（老用户大多有）
 *   - linear_desk ：本插件在完全找不到上面那个时自建的兜底连接
 * 两个都在时一律优先用用户自己的，避免抢连接。
 */
const SERVERS = ['linear', 'linear_desk']
const TOOL_PREFIXES = SERVERS.map((server) => `mcp__${server}__`)

/** 兜底 server：Linear 官方只读端点，密钥走宿主 credentials 服务的模板替换 */
const OWN_SERVER = 'linear_desk'
const OWN_SERVER_URL = 'https://mcp.linear.app/mcp/readonly'
const CREDENTIAL_REF = 'LINEAR_API_KEY'

/**
 * 兜底注册前先等一会儿：宿主启动时 mcp-linear 正在连接，工具还没注册，
 * 立刻判断会误判成"没有可用的 Linear 工具"从而多开一条连接。
 */
const FALLBACK_DELAY_MS = 5_000

/** 一次 MCP 调用的超时（毫秒）。Linear 侧偶发慢查询，给足余量。 */
const CALL_TIMEOUT_MS = 30_000

/** 缓存 TTL：列表 60s、详情 30s、工作区元信息 10min */
const LIST_TTL_MS = 60_000
const DETAIL_TTL_MS = 30_000
const BOOTSTRAP_TTL_MS = 600_000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
}

/**
 * 面板支持的语言。新增语言 = 在 assets/i18n/ 加一个 <code>.json，再把代码加进这里，
 * 宿主与面板都会自动发现，不需要改别的地方。
 */
const LOCALES = ['zh', 'en']
const FALLBACK_LOCALE = 'en'

/** 列表接口默认取的字段子集：够渲染卡片，且不含长 description */
const LIST_FIELDS = [
  'id', 'title', 'status', 'statusType', 'priority', 'url', 'updatedAt', 'createdAt',
  'assignee', 'team', 'project', 'labels', 'dueDate',
]

/** 详情接口额外取 description / 分支名 / 关系等（字段名必须是 get_issue 声明过的枚举值） */
const DETAIL_FIELDS = [
  ...LIST_FIELDS, 'description', 'createdBy', 'gitBranchName', 'parentId', 'estimate', 'completedAt',
  'relations', 'attachments', 'documents', 'delegate', 'cycleId', 'projectMilestone',
]

/** 子任务（list_issues?parentId=）与父票只需要这几个字段 */
const LINK_FIELDS = ['id', 'title', 'status', 'statusType', 'priority', 'assignee', 'url', 'updatedAt']

class ToolUnavailableError extends Error {
  constructor(tool) {
    super(`Linear 工具不可用：${tool}。请确认 Linear MCP 已连接（或在面板里填入 Linear API key）。`)
    this.code = 'LINEAR_TOOL_UNAVAILABLE'
  }
}

/** 简单的 TTL 缓存；进程内、不落盘 */
const cache = new Map()

function cached(key, ttlMs, produce) {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value
  const value = produce()
  // 失败不写缓存：避免把一次网络抖动钉死一整个 TTL
  const entry = { value, expiresAt: now + ttlMs }
  cache.set(key, entry)
  if (value && typeof value.catch === 'function') {
    value.catch(() => { if (cache.get(key) === entry) cache.delete(key) })
  }
  return value
}

function invalidate(prefix) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key)
}

// ---------------------------------------------------------------------------
// MCP 工具调用
// ---------------------------------------------------------------------------

let callSeq = 0

/** 找出当前可用的 Linear 工具前缀（按 SERVERS 优先级），都没有时返回 undefined */
function toolPrefixOf(tools) {
  if (!tools || typeof tools.get !== 'function') return undefined
  return TOOL_PREFIXES.find((prefix) => tools.get(`${prefix}list_issues`) !== undefined)
}

/** 业务调用统一用 this 前缀；调用点没传时再现场挑一次 */
function resolvePrefix(tools, prefix) {
  if (prefix) return prefix
  const found = toolPrefixOf(tools)
  if (!found) throw new ToolUnavailableError('list_issues')
  return found
}

/**
 * 调一个 Linear MCP 工具，返回解包后的业务对象。
 * @param ctx Cordis 上下文
 * @param tool 原始工具名，如 `list_issues`
 * @param args 工具参数
 * @param prefix 已选定的工具前缀；省略时按优先级现挑
 */
async function callLinear(ctx, tool, args, prefix) {
  const tools = ctx.get('tools')
  if (!tools || typeof tools.execute !== 'function') throw new ToolUnavailableError(tool)

  const publicName = resolvePrefix(tools, prefix) + tool
  if (typeof tools.get === 'function' && tools.get(publicName) === undefined) {
    throw new ToolUnavailableError(publicName)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), CALL_TIMEOUT_MS)
  try {
    const batch = await tools.execute({
      calls: [{
        type: 'tool-call',
        id: `linear-desk-${++callSeq}`,
        name: publicName,
        arguments: JSON.stringify(args ?? {}),
      }],
      signal: controller.signal,
    })
    const settled = batch && batch.results && batch.results[0]
    if (!settled) throw new Error(`Linear 工具 ${publicName} 没有返回结果`)
    const result = settled.result
    if (result && result.isError) {
      const detail = (result.error && result.error.message) || textOf(result.content) || '未知错误'
      throw new Error(`Linear 调用失败（${tool}）：${detail}`)
    }
    return unwrapValue(result ? result.value : undefined)
  } finally {
    clearTimeout(timer)
  }
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n')
}

/**
 * MCP 工具的规范返回值是 `{ content, structuredContent? }`：
 * 优先用 structuredContent，否则把 text 块拼起来按 JSON 解析，解析不了就当纯文本。
 */
function unwrapValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const { content, structuredContent } = value
  if (structuredContent !== undefined && structuredContent !== null) return structuredContent
  if (Array.isArray(content)) {
    const texts = content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
    if (texts.length === 1) return parseMaybeJson(texts[0])
    if (texts.length > 1) return parseMaybeJson(texts.join('\n'))
  }
  return value
}

function parseMaybeJson(text) {
  const trimmed = text.trim()
  if (!trimmed) return text
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return text
  try {
    return JSON.parse(trimmed)
  } catch {
    return text
  }
}

// ---------------------------------------------------------------------------
// 业务读取（含缓存）
// ---------------------------------------------------------------------------

async function loadBootstrap(ctx) {
  return cached('bootstrap', BOOTSTRAP_TTL_MS, async () => {
    const [who, teams] = await Promise.all([
      callLinear(ctx, 'whoami', {}).catch((error) => ({ error: String(error && error.message || error) })),
      callLinear(ctx, 'list_teams', {}).catch(() => ({ teams: [] })),
    ])
    return { viewer: who, teams: (teams && teams.teams) || [] }
  })
}

/** 把面板的筛选条件翻译成 list_issues 的参数 */
function issueArgs(query) {
  const view = query.get('view') || 'assigned'
  const state = query.get('state')
  // `open` 是面板合成的"只看未完成"：Linear 的 state 参数只接受单个状态，不能表达"非 Done"，
  // 所以这里不下发给 MCP，改在拿回结果后按 statusType 过滤；过滤在本地做，因此要多取一些。
  const openOnly = state === 'open'
  const fallbackLimit = openOnly ? 100 : 50
  const args = { limit: clampInt(query.get('limit'), 1, 100, fallbackLimit), orderBy: 'updatedAt' }
  if (view === 'assigned') args.assignee = 'me'
  else if (view === 'created') args.creator = 'me'
  const team = query.get('team')
  if (team) args.team = team
  if (state && !openOnly) args.state = state
  const priority = query.get('priority')
  if (priority !== null && priority !== '' && priority !== 'any') args.priority = Number(priority)
  const text = query.get('query')
  if (text) args.query = text
  if (query.get('includeArchived') === '1') args.includeArchived = true
  args.fields = LIST_FIELDS
  return args
}

async function loadIssues(ctx, query) {
  const args = issueArgs(query)
  const openOnly = (query.get('state') || '') === 'open'
  const key = `issues:${openOnly ? 'open:' : ''}${JSON.stringify(args)}`
  return cached(key, LIST_TTL_MS, async () => {
    const page = await callLinear(ctx, 'list_issues', args)
    let issues = Array.isArray(page && page.issues) ? page.issues : []
    if (openOnly) issues = issues.filter((issue) => issue.statusType !== 'completed' && issue.statusType !== 'canceled')
    return {
      issues: [...issues].sort(compareIssues),
      hasNextPage: Boolean(page && page.hasNextPage),
      cursor: page ? page.cursor : undefined,
      filteredOpen: openOnly,
    }
  })
}

async function loadIssue(ctx, id) {
  return cached(`issue:${id}`, DETAIL_TTL_MS, async () => {
    const [issue, comments] = await Promise.all([
      callLinear(ctx, 'get_issue', { id, fields: DETAIL_FIELDS, includeRelations: true }),
      callLinear(ctx, 'list_comments', { issueId: id, limit: 15, orderBy: 'createdAt' })
        .catch(() => ({ comments: [] })),
    ])
    const normalized = issue && issue.issue ? issue.issue : issue
    // 父票 / 子任务各取一次；跨工作区的父票（如 DAW-306）会 404，降级成"只显示 ID 链接"。
    const [parent, children] = await Promise.all([
      normalized && normalized.parentId ? loadLink(ctx, normalized.parentId) : undefined,
      callLinear(ctx, 'list_issues', { parentId: id, fields: LINK_FIELDS, limit: 50 })
        .then((page) => (page && Array.isArray(page.issues) ? page.issues : []))
        .catch(() => []),
    ])
    return {
      issue: normalized,
      parent,
      children: [...children].sort(compareIssues),
      comments: (comments && comments.comments) || [],
      hasNextPage: Boolean(comments && comments.hasNextPage),
    }
  })
}

/** 取一张关联票（父票 / blocks / relatedTo）的轻量信息；失败返回 undefined 让面板只渲染 ID */
async function loadLink(ctx, id) {
  try {
    const issue = await callLinear(ctx, 'get_issue', { id, fields: LINK_FIELDS })
    return issue && issue.issue ? issue.issue : issue
  } catch {
    return undefined
  }
}

/** 未完成优先 → 优先级高优先 → 更新时间新优先 */
const STATUS_ORDER = { backlog: 0, unstarted: 1, started: 2, completed: 3, canceled: 4 }

function compareIssues(a, b) {
  const sa = STATUS_ORDER[a && a.statusType] ?? 9
  const sb = STATUS_ORDER[b && b.statusType] ?? 9
  const doneA = sa >= 3 ? 1 : 0
  const doneB = sb >= 3 ? 1 : 0
  if (doneA !== doneB) return doneA - doneB
  const pa = priorityRank(a)
  const pb = priorityRank(b)
  if (pa !== pb) return pa - pb
  return String((b && b.updatedAt) || '').localeCompare(String((a && a.updatedAt) || ''))
}

/** Linear priority：0=无、1=紧急、4=低 */
function priorityRank(issue) {
  const raw = issue && issue.priority
  const value = raw && typeof raw === 'object' ? raw.value : raw
  const n = typeof value === 'number' ? value : 0
  return n === 0 ? 5 : n
}

function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ---------------------------------------------------------------------------
// HTTP 路由
// ---------------------------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** 复用宿主连接层的信任校验；拿不到 connection 服务时只允许本机回环访问 */
function rejectionOf(ctx, req) {
  const connection = ctx.get('connection')
  if (connection && typeof connection.requestRejection === 'function') {
    return connection.requestRejection({ headers: req.headers })
  }
  const address = (req.socket && req.socket.remoteAddress) || ''
  return /^127\.0\.0\.1$|^::1$|^::ffff:127\.0\.0\.1$/.test(address) ? undefined : 403
}

function serveAsset(res, relative) {
  let target
  try {
    target = realpathSync(join(ASSETS, relative))
  } catch {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  if (target !== ASSETS && !target.startsWith(ASSETS + sep)) {
    sendJson(res, 403, { error: 'forbidden' })
    return
  }
  let stat
  try {
    stat = statSync(target)
  } catch {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  if (!stat.isFile()) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  res.writeHead(200, {
    'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
    'content-length': stat.size,
  })
  createReadStream(target).pipe(res)
}

/** 读 JSON 请求体；限制大小，避免误传大文件把宿主内存吃满 */
async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 64 * 1024) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function handle(ctx, req, res) {
  const rejection = rejectionOf(ctx, req)
  if (rejection) {
    sendJson(res, rejection, { error: 'unauthorized' })
    return
  }

  const url = new URL(req.url ?? '/', 'http://linear-desk.invalid')
  const path = url.pathname
  const query = url.searchParams

  // 唯一一个写接口：把 Linear API key 存进宿主凭据库，交给 MCP 连接的
  // ${credential:LINEAR_API_KEY} 模板去用。凭据本身不进面板、不落前端存储。
  if (req.method === 'POST' && path === `${BASE}/api/credential`) {
    await handleCredential(ctx, req, res)
    return
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' })
    return
  }

  if (path === BASE || path === `${BASE}/` || path === `${BASE}/index.html`) {
    serveAsset(res, 'panel.html')
    return
  }
  if (path.startsWith(`${BASE}/assets/`)) {
    serveAsset(res, path.slice(`${BASE}/assets/`.length))
    return
  }

  try {
    if (path === `${BASE}/api/health`) {
      sendJson(res, 200, await health(ctx))
      return
    }
    if (path === `${BASE}/api/locales`) {
      sendJson(res, 200, { locales: LOCALES, fallback: FALLBACK_LOCALE })
      return
    }
    if (path === `${BASE}/api/bootstrap`) {
      sendJson(res, 200, await loadBootstrap(ctx))
      return
    }
    if (path === `${BASE}/api/issues`) {
      sendJson(res, 200, await loadIssues(ctx, query))
      return
    }
    if (path === `${BASE}/api/issue`) {
      const id = query.get('id')
      if (!id) {
        sendJson(res, 400, { error: 'id is required' })
        return
      }
      if (query.get('refresh') === '1') invalidate(`issue:${id}`)
      sendJson(res, 200, await loadIssue(ctx, id))
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    ctx.logger?.warn?.('linear-desk: %s', String((error && error.stack) || error))
    sendJson(res, 502, { error: String((error && error.message) || error) })
  }
}

/** POST /api/credential {value}：写入宿主凭据库；空串表示删除 */
async function handleCredential(ctx, req, res) {
  const provider = ctx.get('credentials')
  if (!provider || typeof provider.set !== 'function') {
    sendJson(res, 501, { error: 'credential provider unavailable' })
    return
  }
  let body
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: String((error && error.message) || error) })
    return
  }
  const value = typeof body?.value === 'string' ? body.value.trim() : ''
  try {
    if (value) {
      await provider.set(CREDENTIAL_REF, value)
    } else if (typeof provider.unset === 'function') {
      await provider.unset(CREDENTIAL_REF)
    } else {
      throw new Error('credential provider cannot unset')
    }
    // 凭据变了，之前"工具不可用"的结论和缓存都可能过期
    invalidate('')
    sendJson(res, 200, { ok: true, configured: Boolean(value) })
  } catch (error) {
    sendJson(res, 400, { error: String((error && error.message) || error) })
  }
}

/** 列出 mcpManager 认识的 server 视图；没有该服务或它坏了都返回空数组 */
function managedServers(ctx) {
  const manager = ctx.get('mcpManager')
  if (!manager || typeof manager.list !== 'function') return []
  try {
    return manager.list() || []
  } catch {
    return []
  }
}

/**
 * 面板顶部的连接状态：
 *   - registered / toolPrefix：宿主里现在到底有没有可用的 Linear 工具
 *   - server：mcpManager 对当前所用 server 的视图（profile 里直装的 mcp-linear 不在其中，此时为空）
 *   - credential：兜底连接所需的 API key 是否已配置，供面板决定要不要引导用户去填
 */
async function health(ctx) {
  const tools = ctx.get('tools')
  const prefix = toolPrefixOf(tools)
  const registered = prefix !== undefined
  const agent = prefix ? prefix.slice('mcp__'.length, -'__'.length) : undefined

  const view = managedServers(ctx).find((entry) => entry.name === agent || entry.name === OWN_SERVER)
  const server = view ? { name: view.name, configured: view.configured, status: view.status } : undefined

  let credential
  const provider = ctx.get('credentials')
  if (provider && typeof provider.describe === 'function') {
    try {
      const info = await provider.describe(CREDENTIAL_REF)
      credential = { ref: CREDENTIAL_REF, configured: Boolean(info && info.configured), writable: Boolean(info && info.writable) }
    } catch (error) {
      credential = { ref: CREDENTIAL_REF, error: String((error && error.message) || error) }
    }
  }

  return { toolPrefix: prefix, registered, server, ownServer: OWN_SERVER, credential }
}

/**
 * 兜底连接：宿主里完全没有可用的 Linear 工具时，由插件自己往 mcpManager 里注册
 * 一个 Linear 官方只读 server，密钥用 ${credential:LINEAR_API_KEY} 模板注入。
 *   - 用户已经配了 mcp-linear（或被别的插件注册过 linear / linear_desk）就完全不插手
 *   - 注册挂在插件自己的 fiber 上，插件停用即连带卸载
 */
function ensureOwnServer(ctx) {
  const manager = ctx.get('mcpManager')
  if (!manager || typeof manager.register !== 'function') return

  // 已经有可用工具：说明连接是好的，多建一条只会和宿主抢同一个账号配额
  if (toolPrefixOf(ctx.get('tools'))) return
  // 名字被占用（用户手工配的或别的插件注册的）说明不是我们该补的缺口
  if (managedServers(ctx).some((entry) => entry.name === OWN_SERVER || entry.name === 'linear')) return

  ctx.effect(() => {
    try {
      const dispose = manager.register(OWN_SERVER, {
        transport: 'streamable-http',
        url: OWN_SERVER_URL,
        headers: { Authorization: `Bearer \${credential:${CREDENTIAL_REF}}` },
      })
      return () => { try { dispose() } catch { /* 卸载失败不阻塞插件停用 */ } }
    } catch (error) {
      // 名字冲突/条目非法/manager 已销毁都可能抛，降级成"没有兜底连接"而不是让插件挂掉
      ctx.logger?.warn?.('linear-desk: fallback MCP server not registered: %s', String((error && error.message) || error))
      return undefined
    }
  }, 'dsh-linear-desk: fallback linear MCP server')
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: BASE,
      handler: (req, res) => handle(ctx, req, res),
    }),
    'dsh-linear-desk: /linear-desk routes',
  )

  // 宿主刚启动时 mcp-linear 还在连接，工具尚未注册；等一会儿再判断是否需要兜底，
  // 否则每次冷启动都会多建一条重复连接。
  const timer = setTimeout(() => {
    try { ensureOwnServer(ctx) } catch (error) {
      ctx.logger?.warn?.('linear-desk: fallback registration failed: %s', String((error && error.message) || error))
    }
  }, FALLBACK_DELAY_MS)
  // 不让这个延时定时器拖着 Node 进程不退出（插件卸载前本来也会 clearTimeout）
  timer.unref?.()
  ctx.effect(() => () => clearTimeout(timer), 'dsh-linear-desk: fallback timer')
}
