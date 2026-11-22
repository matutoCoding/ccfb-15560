// 设置页：配合间隙默认值、爆炸间距、干涉阈值，数据管理
import { store } from '../../data/store'
import { db } from '../../data/db'
import { h, icon, numberField } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { resetViewerTracking } from './viewer_host'
import { watchPage } from './watch'

export const renderSettingsPage = (root: HTMLElement): void => {
  draw(root)
  watchPage(root, () => {
    const d = store.current
    const s = store.get()
    return JSON.stringify({ settings: d?.settings, count: s.designs.length, interference: s.interference, steps: s.plan?.steps.length })
  }, () => draw(root))
}

const draw = (root: HTMLElement): void => {
  root.innerHTML = ''
  const design = store.current
  const head = h('div', { className: 'page-head' },
    h('div', {},
      h('h2', {}, '设置'),
      h('div', { className: 'sub' }, '当前款式的工程参数与本地数据管理')
    )
  )

  const grid = h('div', { className: 'grid cols-2' })

  // 工程参数
  const paramCard = h('div', { className: 'card panel' })
  paramCard.append(h('h3', {}, '工程参数'))
  if (design) {
    paramCard.append(
      numberField('默认配合间隙 (mm)', design.settings.defaultClearance, (v) => {
        if (v < 0) return toast('间隙不能为负', 'err')
        void store.updateSettings({ defaultClearance: v })
      }, 0.1),
      numberField('爆炸图间距 (mm)', design.settings.explodeGap, (v) => {
        if (v <= 0) return toast('间距必须大于 0', 'err')
        void store.updateSettings({ explodeGap: v })
      }, 5),
      numberField('干涉判定阈值 (mm)', design.settings.interferenceTolerance, (v) => {
        if (v < 0) return toast('阈值不能为负', 'err')
        void store.updateSettings({ interferenceTolerance: v })
      }, 0.1)
    )
    const applyClearance = h('button', { className: 'mt-4' }, '把默认间隙应用到全部节点')
    applyClearance.addEventListener('click', () => {
      void store.mutateCurrent((d) => {
        for (const j of d.joints) j.clearance = d.settings.defaultClearance
      }).then(() => toast('全部节点间隙已统一'))
    })
    paramCard.append(applyClearance)
  }

  // 数据管理
  const dataCard = h('div', { className: 'card panel' })
  dataCard.append(h('h3', {}, '本地数据（IndexedDB）'))
  const count = store.get().designs.length
  dataCard.append(h('div', { className: 'muted' }, `当前浏览器共存储 ${count} 个款式，数据仅保存在本机`))
  const clearBtn = h('button', { className: 'danger mt-4' }, icon(icons.trash), ' 清空全部款式数据')
  clearBtn.addEventListener('click', async () => {
    if (!window.confirm('清空后下次启动会自动重新生成圈椅与方桌，确认继续？')) return
    await db.clear()
    resetViewerTracking()
    location.reload()
  })
  dataCard.append(clearBtn)

  // 性能信息
  const perfCard = h('div', { className: 'card panel' })
  perfCard.append(h('h3', {}, '求解性能'))
  const ir = store.get().interference
  perfCard.append(
    h('div', { className: 'stat-row' },
      h('div', { className: 'stat' },
        h('div', { className: 'num' }, String(store.get().plan?.steps.length ?? 0)),
        h('div', { className: 'label' }, '装配步骤')),
      h('div', { className: 'stat' },
        h('div', { className: 'num' }, ir ? `${ir.elapsedMs.toFixed(1)}ms` : '—'),
        h('div', { className: 'label' }, '干涉计算耗时')),
      h('div', { className: 'stat' },
        h('div', { className: 'num' }, String(ir?.hits.length ?? 0)),
        h('div', { className: 'label' }, '干涉命中'))
    ),
    h('div', { className: 'muted mt-4' }, '干涉检查按构件版本增量缓存，单件改尺寸仅重算相关配对，目标 < 200ms')
  )

  grid.append(paramCard, dataCard, perfCard)
  root.append(head, grid)
}
