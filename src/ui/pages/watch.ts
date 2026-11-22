// 页面级订阅辅助：同页数据变化时局部刷新，页面卸载时自动断开
import { store } from '../../data/store'

// 监听 store，selector 返回值变化才触发回调；root 脱离文档后自动清理
export const watchPage = <T>(
  root: HTMLElement,
  selector: () => T,
  onChange: (value: T) => void
): (() => void) => {
  let last = selector()
  const unsubscribe = store.subscribe(() => {
    const next = selector()
    if (JSON.stringify(next) !== JSON.stringify(last)) {
      last = next
      onChange(next)
    }
  })
  const timer = setInterval(() => {
    if (!root.isConnected) {
      unsubscribe()
      clearInterval(timer)
    }
  }, 400)
  return unsubscribe
}
