// 款式列表页：增删改复制、打包导出导入
import type { Design } from '../../types'
import { store } from '../../data/store'
import { exportDesignBundle, readBundleFile } from '../exporter'
import { h, icon, emptyState } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { watchPage } from './watch'

export const renderDesignsPage = (root: HTMLElement): void => {
  draw(root)
  watchPage(root, () => store.get().designs.map((d) => [d.id, d.name, d.updatedAt, d.members.length, d.joints.length]), () => draw(root))
}

const draw = (root: HTMLElement): void => {
  root.innerHTML = ''
  const state = store.get()
  const head = h('div', { className: 'page-head' },
    h('div', {},
      h('h2', {}, '款式库'),
      h('div', { className: 'sub' }, '管理全部家具款式，支持打包导出与导入')
    ),
    h('div', { className: 'flex gap-2 wrap' },
      (() => {
        const btn = h('button', { className: 'primary' }, icon(icons.plus), ' 新建款式')
        btn.addEventListener('click', async () => {
          const name = `新款式 ${new Date().toLocaleDateString('zh-CN')}`
          const d = await store.createDesign(name)
          toast(`已创建 ${d.name}`)
          await store.selectDesign(d.id)
          store.navigate('members')
        })
        return btn
      })(),
      (() => {
        const btn = h('button', {}, icon(icons.export), ' 导出全部')
        btn.addEventListener('click', async () => {
          await exportDesignBundle(await store.exportBundle())
          toast('款式包已导出')
        })
        return btn
      })(),
      (() => {
        const file = h('input', { type: 'file', accept: '.json,application/json' }) as HTMLInputElement
        file.style.display = 'none'
        const btn = h('button', {}, icon(icons.import), ' 导入款式')
        btn.addEventListener('click', () => file.click())
        file.addEventListener('change', async () => {
          const f = file.files?.[0]
          if (!f) return
          try {
            const bundle = await readBundleFile(f)
            const n = await store.importBundle(bundle)
            toast(`成功导入 ${n} 个款式`)
          } catch (e) {
            toast((e as Error).message, 'err')
          }
          file.value = ''
        })
        return h('span', { style: 'display:contents' }, btn, file)
      })()
    )
  )

  const grid = h('div', { className: 'grid cols-3' })
  if (state.designs.length === 0) {
    grid.append(emptyState('还没有款式', '点击右上角新建，或导入款式包', icons.designs))
  }
  for (const d of state.designs) {
    grid.append(renderCard(d, state.currentId === d.id))
  }
  root.append(head, grid)
}

const renderCard = (d: Design, selected: boolean): HTMLElement => {
  const card = h('div', { className: `card design-card ${selected ? 'selected' : ''}` })
  const date = new Date(d.updatedAt).toLocaleString('zh-CN', { hour12: false })
  card.append(
    h('div', { className: 'flex between center' },
      h('h3', {}, d.name),
      h('span', { className: 'badge neutral' }, `${d.joints.length} 节点`)
    ),
    h('div', { className: 'meta' }, `构件 ${d.members.length} 件 · 更新于 ${date}`),
    h('div', { className: 'meta' }, `默认间隙 ${d.settings.defaultClearance}mm · 干涉阈值 ${d.settings.interferenceTolerance}mm`)
  )

  const actions = h('div', { className: 'actions' })
  const openBtn = h('button', { className: 'primary sm' }, '打开编辑')
  openBtn.addEventListener('click', async () => {
    await store.selectDesign(d.id)
    store.navigate('members')
  })
  const renameBtn = h('button', { className: 'sm' }, '重命名')
  renameBtn.addEventListener('click', async () => {
    const name = window.prompt('款式名称', d.name)
    if (name && name.trim()) await store.renameDesign(d.id, name.trim())
  })
  const copyBtn = h('button', { className: 'sm' }, icon(icons.copy), ' 复制')
  copyBtn.addEventListener('click', async () => {
    await store.duplicateDesign(d.id)
    toast('已生成副本')
  })
  const expBtn = h('button', { className: 'sm' }, icon(icons.export), ' 导出')
  expBtn.addEventListener('click', async () => {
    await exportDesignBundle(await store.exportBundle([d.id]))
    toast(`${d.name} 已导出`)
  })
  const delBtn = h('button', { className: 'danger sm' }, icon(icons.trash), ' 删除')
  delBtn.addEventListener('click', async () => {
    if (window.confirm(`确认删除款式「${d.name}」？此操作不可恢复`)) {
      await store.deleteDesign(d.id)
      toast('已删除')
    }
  })
  actions.append(openBtn, renameBtn, copyBtn, expBtn, delBtn)
  card.append(actions)
  return card
}
