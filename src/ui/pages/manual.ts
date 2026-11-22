// 说明书页：步骤线稿 + 零件表，导出 PDF 或 PNG 压缩包
import { store } from '../../data/store'
import { h, icon, emptyState } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { mountViewer, syncViewer, getViewer } from './viewer_host'
import { exportManualPdf, exportManualPngZip } from '../exporter'

export const renderManualPage = async (root: HTMLElement): Promise<void> => {
  const design = store.current
  if (!design) {
    root.append(emptyState('未选择款式', '先在款式库打开一个款式', icons.manual))
    return
  }
  const state = store.get()
  const plan = state.plan

  const head = h('div', { className: 'page-head' },
    h('div', {},
      h('h2', {}, `${design.name} · 装配说明书`),
      h('div', { className: 'sub' }, `按 ${plan?.steps.length ?? 0} 个装配步骤生成线稿图，附完整零件表`)
    ),
    h('div', { className: 'flex gap-2' },
      (() => {
        const btn = h('button', { className: 'primary' }, icon(icons.pdf), ' 导出 PDF')
        btn.addEventListener('click', async () => {
          const viewer = getViewer()
          if (!viewer || !plan) return
          btn.setAttribute('disabled', 'true')
          try {
            await exportManualPdf(viewer, design, plan.steps)
            toast('PDF 说明书已生成')
          } catch (e) {
            toast((e as Error).message, 'err')
          } finally {
            btn.removeAttribute('disabled')
          }
        })
        return btn
      })(),
      (() => {
        const btn = h('button', {}, icon(icons.export), ' 导出 PNG 图集')
        btn.addEventListener('click', async () => {
          const viewer = getViewer()
          if (!viewer || !plan) return
          btn.setAttribute('disabled', 'true')
          try {
            await exportManualPngZip(viewer, design, plan.steps)
            toast('PNG 图集已打包下载')
          } catch (e) {
            toast((e as Error).message, 'err')
          } finally {
            btn.removeAttribute('disabled')
          }
        })
        return btn
      })()
    )
  )

  const viewerCard = h('div', { className: 'viewer-wrap', style: 'height:420px' })
  const viewerEl = h('div', { className: 'viewer' })
  viewerCard.append(viewerEl)

  // 零件表
  const tableCard = h('div', { className: 'card mt-5', style: 'padding:var(--sp-5)' })
  tableCard.append(h('h3', { style: 'margin-bottom:var(--sp-4)' }, '零件表'))
  const table = h('table', { className: 'table' })
  table.append(h('thead', {}, h('tr', {},
    h('th', {}, '序号'), h('th', {}, '名称'), h('th', {}, '尺寸 (mm)'),
    h('th', {}, '材种'), h('th', {}, '木纹方向'), h('th', {}, '备注'))))
  const tbody = h('tbody')
  design.members.forEach((m, i) => {
    tbody.append(h('tr', {},
      h('td', {}, String(i + 1)),
      h('td', {}, m.name),
      h('td', { className: 'mono' }, m.size.join(' × ')),
      h('td', {}, speciesLabel(m.species)),
      h('td', {}, m.grain.toUpperCase()),
      h('td', { className: 'muted' }, m.note ?? '—')))
  })
  table.append(tbody)
  tableCard.append(table)

  // 步骤文字说明
  const stepCard = h('div', { className: 'card mt-5', style: 'padding:var(--sp-5)' })
  stepCard.append(h('h3', { style: 'margin-bottom:var(--sp-4)' }, '装配步骤说明'))
  const stepList = h('div', {})
  for (const step of plan?.steps ?? []) {
    const member = design.members.find((m) => m.id === step.memberId)
    stepList.append(h('div', { className: 'step-row', style: 'cursor:default' },
      h('div', { className: 'order' }, String(step.order)),
      h('div', {},
        h('div', { className: 'item-name' }, member?.name ?? step.memberId),
        h('div', { className: 'item-sub' },
          `沿 ${step.insertAxis.toUpperCase()} 轴${step.insertSign > 0 ? '正' : '反'}向插入`,
          step.blockers.length ? `；与 ${step.blockers.map((b) => nameOf(b)).join('、')} 对位` : '；作为基准件先行固定'))
    ))
  }
  stepCard.append(stepList)

  root.append(head, viewerCard, tableCard, stepCard)
  await mountViewer(viewerEl)
  syncViewer()
}

const nameOf = (id: string): string =>
  store.current?.members.find((m) => m.id === id)?.name ?? id

const speciesLabel = (s: string): string =>
  ({ walnut: '黑胡桃木', oak: '橡木', elm: '榆木', beech: '榉木', rosewood: '紫檀', pine: '松木', mahogany: '桃花心木' })[s] ?? s
