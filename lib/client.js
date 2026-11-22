// dsh-linear-desk · 浏览器半边
//   - 侧栏加一个「Linear 工作台」入口，主区域是插件自己的页面（/linear-desk/，iframe）
//   - 页面里点「在会话中开始处理」：页面 postMessage 一段草稿，这里开一个新会话并把草稿
//     填进输入框（不自动发送，用户补完再发）
//   - 明暗与语言跟随宿主，通过 postMessage 下发，不重载 iframe
window.__ModuleLoader__.load({
  id: 'dsh-linear-desk',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const PANEL = 'linear-desk'
    const SRC = '/linear-desk/'

    // 侧栏图标：一页待办清单（不使用 Linear 的品牌标识）
    function DeskIcon(props) {
      const s = (props && props.size) || 18
      return h('svg', {
        width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('rect', { x: 4.5, y: 3.5, width: 15, height: 17, rx: 2.5 }),
        h('path', { d: 'M8.5 8.5h7M8.5 12h7M8.5 15.5h4' }))
    }

    function apply(ctx) {
      const frames = new Set()
      const LABEL = { zh: 'Linear 工作台', en: 'Linear desk' }

      // 配色：主题服务在就把当前明暗发给页面，切换时再发
      let scheme = 'light'
      const postScheme = (frame) => {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'linear-desk:theme', scheme }, location.origin)
        }
      }
      ctx.inject(['theme'], (c) => {
        const push = (snapshot) => {
          const active = snapshot && snapshot.active
          scheme = (active && active.colorScheme) === 'dark' ? 'dark' : 'light'
          frames.forEach(postScheme)
        }
        try { push(c.theme.getTheme()) } catch { /* 主题服务形态变了就保持默认 */ }
        c.on('theme/change', push)
      })

      // 语言：locale 服务在就跟随，老版本没有该服务时看浏览器语言
      let lang = /^en\b/i.test(navigator.language) ? 'en' : 'zh'
      const postLang = (frame) => {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'linear-desk:locale', lang }, location.origin)
        }
      }
      ctx.inject(['locale'], (c) => {
        const push = (snapshot) => {
          const active = snapshot && snapshot.active
          if (active === 'zh' || active === 'en') {
            lang = active
            frames.forEach(postLang)
          }
        }
        try { push(c.locale.getSnapshot()) } catch { /* 同上 */ }
        c.on('locale/change', push)
      })

      function DeskPanel() {
        const ref = React.useRef(null)
        const [src] = React.useState(() => `${SRC}?lang=${lang}`)
        React.useEffect(() => {
          const self = ref.current
          if (self) frames.add(self)
          function onMessage(event) {
            const frame = ref.current
            if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return
            const message = event.data
            if (!message || message.type !== 'linear-desk:start' || typeof message.prompt !== 'string') return
            try {
              ctx.uiWorkspace.startSession(undefined, { prompt: message.prompt, whenDraftExists: 'replace' })
            } catch (error) {
              console.error('[linear-desk] 开新会话失败', error)
              if (frame.contentWindow) {
                frame.contentWindow.postMessage({
                  type: 'linear-desk:start-failed',
                  message: String((error && error.message) || error),
                }, location.origin)
              }
            }
          }
          addEventListener('message', onMessage)
          return () => {
            removeEventListener('message', onMessage)
            frames.delete(self)
          }
        }, [])
        return h('iframe', {
          ref,
          src,
          title: LABEL[lang],
          allow: 'fullscreen',
          style: { width: '100%', height: '100%', border: 0, display: 'block' },
          onLoad: (event) => {
            const frame = event.currentTarget
            postScheme(frame)
            postLang(frame)
          },
        })
      }

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 7, label: () => LABEL[lang] }, DeskIcon))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, DeskPanel))
    }

    exports.isPlugin = true
    exports.inject = ['slots', 'uiWorkspace']
    exports.apply = apply
    return module.exports
  },
})
