// 离线验证兜底连接：宿主里没有可用的 Linear 工具时，插件应当自己往 mcpManager
// 注册一条只读 server；已经有工具或名字被占用时则完全不插手。
// 用法：node test/fallback-check.mjs
import { apply } from '../lib/index.js'

const DELAY = 5_600 // 插件内的等待是 5s，这里多给一点余量

function makeCtx({ tools, servers }) {
  const registered = []
  const ctx = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => undefined }
      if (name === 'tools') return tools
      if (name === 'mcpManager') {
        return {
          list: () => servers.map((entry) => ({ configured: false, ...entry })),
          register: (serverName, entry) => {
            registered.push({ name: serverName, entry })
            return () => {}
          },
        }
      }
      return undefined
    },
    effect(factory) { return factory() },
    webServer: { register: () => () => {} },
    logger: { warn: (...args) => console.log('[warn]', ...args) },
  }
  return { ctx, registered }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 1) 没有任何 Linear 工具、也没有同名 server → 应该注册 linear_desk
{
  const { ctx, registered } = makeCtx({
    tools: { get: () => undefined },
    servers: [],
  })
  apply(ctx)
  await wait(DELAY)
  const own = registered.find((item) => item.name === 'linear_desk')
  console.log('case1 registered:', Boolean(own))
  if (own) {
    console.log('case1 transport:', own.entry.transport)
    console.log('case1 url:', own.entry.url)
    // 模板必须是完整的 ${credential:REF} token，前面可以带 "Bearer "
    console.log('case1 auth:', own.entry.headers.Authorization)
  }
}

// 2) 已经有可用工具 → 不应注册
{
  const { ctx, registered } = makeCtx({
    tools: { get: (name) => (name === 'mcp__linear__list_issues' ? {} : undefined) },
    servers: [],
  })
  apply(ctx)
  await wait(DELAY)
  console.log('case2 registered count:', registered.length)
}

// 3) 名字已被占用（用户自己配了 linear）→ 不应注册
{
  const { ctx, registered } = makeCtx({
    tools: { get: () => undefined },
    servers: [{ name: 'linear' }],
  })
  apply(ctx)
  await wait(DELAY)
  console.log('case3 registered count:', registered.length)
}

// 4) 只有 mcp__linear_desk__ 工具时，health 也要认出来（前缀回退）
{
  let route
  const tools = {
    get: (name) => (name === 'mcp__linear_desk__list_issues' ? {} : undefined),
  }
  const ctx = {
    get(name) {
      if (name === 'connection') return { requestRejection: () => undefined }
      if (name === 'tools') return tools
      return undefined
    },
    effect(factory) { return factory() },
    webServer: { register: (value) => { route = value; return () => {} } },
    logger: { warn: (...args) => console.log('[warn]', ...args) },
  }
  apply(ctx)
  const res = {
    statusCode: 0,
    body: '',
    writeHead(status) { res.statusCode = status },
    end(payload) { res.body = payload || '' },
  }
  await route.handler({ url: '/linear-desk/api/health', method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res)
  const body = JSON.parse(res.body)
  console.log('case4 toolPrefix:', body.toolPrefix, 'registered:', body.registered)
}
