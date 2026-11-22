// 轻量 toast 提示
let host: HTMLDivElement | null = null

const ensureHost = (): HTMLDivElement => {
  if (!host) {
    host = document.createElement('div')
    host.className = 'toast-host'
    document.body.append(host)
  }
  return host
}

export const toast = (message: string, kind: 'ok' | 'err' = 'ok', duration = 2600) => {
  const el = document.createElement('div')
  el.className = `toast ${kind === 'err' ? 'err' : ''}`
  el.textContent = message
  ensureHost().append(el)
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transition = 'opacity 0.2s ease'
    setTimeout(() => el.remove(), 220)
  }, duration)
}
