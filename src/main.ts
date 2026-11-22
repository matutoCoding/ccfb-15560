// 应用外壳：侧边导航 + 页面路由。外壳只挂一次，页面内部自订阅做局部刷新
import './ui/styles.css'
import { store, type PageKey } from './data/store'
import { h, icon } from './ui/dom'
import { icons, type IconKey } from './ui/icons'
import { renderDesignsPage } from './ui/pages/designs'
import { renderMembersPage } from './ui/pages/members'
import { renderJointsPage } from './ui/pages/joints'
import { renderAssemblyPage } from './ui/pages/assembly'
import { renderManualPage } from './ui/pages/manual'
import { renderSettingsPage } from './ui/pages/settings'
import { syncViewer } from './ui/pages/viewer_host'

const NAV: { key: PageKey; label: string; icon: IconKey }[] = [
  { key: 'designs', label: '款式列表', icon: 'designs' },
  { key: 'members', label: '构件编辑', icon: 'member' },
  { key: 'joints', label: '榫卯库', icon: 'joint' },
  { key: 'assembly', label: '装配推演', icon: 'assembly' },
  { key: 'manual', label: '说明书', icon: 'manual' },
  { key: 'settings', label: '设置', icon: 'settings' }
]

const renderTopbar = (topbar: HTMLElement): void => {
  const state = store.get()
  const current = store.current
  topbar.innerHTML = ''
  topbar.append(
    h('div', { className: 'current-name' }, current ? current.name : '未选择款式'),
    current ? h('div', { className: 'flex gap-3 center' },
      h('span', { className: 'badge neutral' }, `${current.members.length} 构件`),
      h('span', { className: 'badge neutral' }, `${current.joints.length} 节点`),
      state.interference && state.interference.hits.length > 0
        ? h('span', { className: 'badge danger' }, `${state.interference.hits.length} 处干涉`)
        : h('span', { className: 'badge ok' }, '无干涉')
    ) : h('span')
  )
}

const mountPage = async (page: PageKey, content: HTMLElement): Promise<void> => {
  content.innerHTML = ''
  switch (page) {
    case 'designs': renderDesignsPage(content); break
    case 'members': await renderMembersPage(content); break
    case 'joints': await renderJointsPage(content); break
    case 'assembly': await renderAssemblyPage(content); break
    case 'manual': await renderManualPage(content); break
    case 'settings': renderSettingsPage(content); break
  }
  syncViewer()
}

const boot = async (): Promise<void> => {
  await store.boot()
  const app = document.querySelector('#app')!
  const shell = h('div', { className: 'app-shell' })

  // 侧边栏（导航只在切页时更新激活态）
  const sidebar = h('aside', { className: 'sidebar' })
  sidebar.append(h('div', { className: 'brand' }, '榫卯推演台'))
  const navButtons = new Map<PageKey, HTMLButtonElement>()
  for (const item of NAV) {
    const btn = h('button', { className: 'nav-item' })
    btn.append(icon(icons[item.icon]), h('span', {}, item.label))
    btn.addEventListener('click', () => store.navigate(item.key))
    navButtons.set(item.key, btn)
    sidebar.append(btn)
  }
  sidebar.append(h('div', { className: 'muted', style: 'margin-top:auto;padding:0 var(--sp-3);font-size:14px' },
    'IndexedDB 本地存储 · three.js CSG'))

  const main = h('main', { className: 'main' })
  const topbar = h('div', { className: 'topbar' })
  const content = h('div', { className: 'content' })
  main.append(topbar, content)
  shell.append(sidebar, main)
  app.append(shell)

  let currentPage: PageKey | null = null
  store.subscribe(() => {
    const state = store.get()
    // 激活导航态
    for (const [key, btn] of navButtons) {
      btn.className = `nav-item ${state.page === key ? 'active' : ''}`
    }
    renderTopbar(topbar)
    // 仅在切页时重挂页面；同页数据变化由页面内部自订阅处理，三维视图不重建
    if (state.page !== currentPage) {
      currentPage = state.page
      void mountPage(state.page, content)
    }
  })

  // 首次挂载
  currentPage = store.get().page
  renderTopbar(topbar)
  await mountPage(currentPage, content)
}

void boot()
