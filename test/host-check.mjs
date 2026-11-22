// 离线验证：用桩 ctx 直接驱动 lib/index.js 的 HTTP 分发逻辑。
// 用法：node test/host-check.mjs
import { apply } from '../lib/index.js'

const captured = {}
const secrets = new Map()
const ctx = {
  get(name) {
    if (name === 'connection') return { requestRejection: () => undefined }
    if (name === 'tools') {
      return {
        get: (toolName) => (toolName.startsWith('mcp__linear__') ? { name: toolName } : undefined),
      }
    }
    if (name === 'credentials') {
      return {
        describe: async (ref) => ({ configured: secrets.has(ref), writable: true }),
        set: async (ref, value) => { secrets.set(ref, value) },
        unset: async (ref) => { secrets.delete(ref) },
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

// 写凭据：POST /api/credential 走 provider.set，读 health 应看到 configured:true
const res3 = fakeRes()
await captured.route.handler({ ...fakeReq('/linear-desk/api/credential', 'POST'), [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify({ value: 'lin_api_test' })) } }, res3)
console.log('credential POST', res3.statusCode, res3.body)

const res4 = fakeRes()
await captured.route.handler(fakeReq('/linear-desk/api/health'), res4)
console.log('health (key stored)', res4.statusCode, res4.body)

// 空值 = 删除
const res5 = fakeRes()
await captured.route.handler({ ...fakeReq('/linear-desk/api/credential', 'POST'), [Symbol.asyncIterator]: async function* () { yield Buffer.from('{"value":""}') } }, res5)
console.log('credential DELETE', res5.statusCode, res5.body)

// 非 GET 且非凭据接口仍然 405
const res6 = fakeRes()
await captured.route.handler(fakeReq('/linear-desk/api/issues', 'POST'), res6)
console.log('POST other', res6.statusCode, res6.body)
