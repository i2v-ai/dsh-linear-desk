// 离线验证：用桩 ctx 直接驱动 lib/index.js 的 HTTP 分发逻辑。
// 用法：ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" test/host-check.mjs
import { apply } from '../lib/index.js'

const captured = {}
const ctx = {
  get(name) {
    if (name === 'connection') return { requestRejection: () => undefined }
    if (name === 'tools') {
      return {
        get: (toolName) => (toolName.startsWith('mcp__linear__') ? { name: toolName } : undefined),
      }
    }
    return undefined
  },
  effect(factory) { return factory() },
  webServer: {
    register(route) { captured.route = route; return () => {} },
  },
  logger: { warn: (...a) => console.log('[warn]', ...a) },
}

apply(ctx)
console.log('registered route:', captured.route.kind, captured.route.path)

// 构造假的 req/res
function fakeReq(url, method = 'GET') {
  return { url, method, headers: {}, socket: { remoteAddress: '127.0.0.1' } }
}
function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { res.statusCode = status; res.headers = headers || {} },
    end(payload) { res.body = payload || '' },
  }
  return res
}

const res = fakeRes()
await captured.route.handler(fakeReq('/linear-desk/api/health'), res)
console.log('health', res.statusCode, res.body)

const res2 = fakeRes()
await captured.route.handler(fakeReq('/linear-desk/api/issues?view=assigned'), res2)
console.log('issues (no tools.execute)', res2.statusCode, res2.body.slice(0, 160))
