// 装配推演页：顺序求解结果、爆炸拆装动画、平面剖切、实时干涉、步骤拖拽
import type { Axis } from '../../types'
import { store } from '../../data/store'
import { h, icon, emptyState } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { mountViewer, syncViewer, getViewer } from './viewer_host'
import { watchPage } from './watch'
import type { DesignViewer } from '../viewer'

export const renderAssemblyPage = async (root: HTMLElement): Promise<void> => {
  const design = store.current
  if (!design) {
    root.append(emptyState('未选择款式', '先在款式库打开一个款式', icons.assembly))
    return
  }

  const wrap = h('div', { className: 'workspace' })
  const viewerCard = h('div', { className: 'viewer-wrap' })
  const viewerEl = h('div', { className: 'viewer' })
  viewerCard.append(viewerEl)
  wrap.append(viewerCard)

  const side = h('div', { className: 'card panel' })
  wrap.append(side)
  root.append(wrap)

  const viewer = await mountViewer(viewerEl)
  if (viewer) renderToolbar(viewerCard, viewer)
  renderSide(side, viewer)
  syncViewer()

  watchPage(wrap, () => {
    const s = store.get()
    return JSON.stringify({
      lock: s.plan?.lock,
      steps: s.plan?.steps.map((st) => [st.order, st.memberId, st.insertAxis, st.insertSign, st.blockers]),
      interference: s.interference
    })
  }, () => {
    renderSide(side, getViewer())
    syncViewer()
  })
}

const renderToolbar = (card: HTMLElement, viewer: DesignViewer): void => {
  const bar = h('div', { className: 'viewer-toolbar' })

  const explodeBtn = h('button', { className: 'pill sm' }, icon(icons.explode), ' 一键爆炸')
  let exploded = false
  explodeBtn.addEventListener('click', () => {
    exploded = !exploded
    viewer.setExplode(exploded ? 1 : 0)
    explodeBtn.innerHTML = ''
    explodeBtn.append(icon(icons.explode), exploded ? ' 装回' : ' 一键爆炸')
  })

  // 剖切控制
  const clipAxes: { value: '' | Axis; label: string }[] = [
    { value: '', label: '关闭剖切' },
    { value: 'x', label: '切 X 面' },
    { value: 'y', label: '切 Y 面' },
    { value: 'z', label: '切 Z 面' }
  ]
  const clipSelect = h('select', { className: 'pill' }) as HTMLSelectElement
  clipSelect.style.padding = '4px 8px'
  for (const opt of clipAxes) clipSelect.append(h('option', { value: opt.value }, opt.label))
  const depthInput = h('input', { type: 'range', min: '-400', max: '400', value: '0' }) as HTMLInputElement
  depthInput.style.width = '120px'
  depthInput.classList.add('pill')
  const applyClip = () => {
    const axis = clipSelect.value as '' | Axis
    viewer.setClipPlane(axis === '' ? null : axis, Number(depthInput.value))
  }
  clipSelect.addEventListener('change', applyClip)
  depthInput.addEventListener('input', applyClip)

  bar.append(explodeBtn, clipSelect, depthInput)
  card.append(bar)
}

const renderSide = (side: HTMLElement, viewer: DesignViewer | null): void => {
  const state = store.get()
  const plan = state.plan
  side.innerHTML = ''

  // 求解状态
  side.append(h('h3', {}, '装配推演'))
  if (plan?.lock?.locked) {
    const alert = h('div', { className: 'alert danger' },
      h('div', { style: 'font-weight:600' }, '存在锁死，无法完成装配'))
    for (const msg of plan.lock.configErrors) alert.append(h('div', {}, msg))
    const names = plan.lock.memberIds.map((id) => nameOf(id)).join('、')
    alert.append(h('div', {}, `锁死构件：${names}`))
    side.append(alert)
  } else if (plan?.lock?.configErrors.length) {
    const alert = h('div', { className: 'alert warn' })
    plan.lock.configErrors.forEach((m) => alert.append(h('div', {}, m)))
    side.append(alert)
  } else {
    side.append(h('div', { className: 'alert ok' },
      h('div', { style: 'font-weight:600' }, '装配顺序求解通过'),
      h('div', {}, `共 ${plan?.steps.length ?? 0} 步，每一步均沿真实插入方向可装`)))
  }

  // 干涉面板
  const ir = state.interference
  const interfereBox = h('div', {})
  interfereBox.append(h('div', { className: 'section-title' },
    `实时干涉检查 ${ir ? `（${ir.elapsedMs.toFixed(1)}ms）` : ''}`))
  if (!ir || ir.hits.length === 0) {
    interfereBox.append(h('div', { className: 'badge ok' }, icon(icons.check), ' 无穿模'))
  } else {
    const alert = h('div', { className: 'alert danger' })
    for (const hit of ir.hits) {
      alert.append(h('div', {},
        `${nameOf(hit.memberA)} × ${nameOf(hit.memberB)}：穿透 ${hit.depth}mm`))
    }
    interfereBox.append(alert)
  }
  side.append(interfereBox)

  // 步骤进度滑杆（沿真实插入方向逐件装回）
  if (plan && plan.steps.length > 0) {
    const progressWrap = h('div', { className: 'form-stack' })
    progressWrap.append(h('div', { className: 'section-title' }, '拆装动画（沿插入方向）'))
    const slider = h('input', { type: 'range', min: '0', max: String(plan.steps.length), value: '0', step: '1' }) as HTMLInputElement
    slider.addEventListener('input', () => {
      const p = Number(slider.value) / plan.steps.length
      viewer?.setStepProgress(1 - p)
    })
    progressWrap.append(slider, h('div', { className: 'muted' }, '拖动滑块从全散件逐步装回成品'))
    side.append(progressWrap)
  }

  // 步骤列表（可拖拽调序）
  side.append(renderStepList())
}

const renderStepList = (): HTMLElement => {
  const design = store.current!
  const plan = store.get().plan
  const box = h('div', {})
  const head = h('div', { className: 'flex between center mt-4' },
    h('div', { className: 'section-title' }, '装配步骤（拖拽调整）'),
    (() => {
      const btn = h('button', { className: 'sm' }, '恢复自动排序')
      btn.addEventListener('click', () => {
        void store.setManualOrder(undefined).then(() => {
          store.recompute(design.id, {})
          toast('已恢复自动求解顺序')
        })
      })
      return btn
    })()
  )
  box.append(head)

  const list = h('div', { className: 'mt-4' })
  let dragId: string | null = null
  for (const step of plan?.steps ?? []) {
    const row = h('div', { className: 'step-row', draggable: 'true' })
    row.append(
      h('div', { className: 'order' }, String(step.order)),
      icon(icons.drag, 16),
      h('div', { style: 'flex:1' },
        h('div', { className: 'item-name' }, nameOf(step.memberId)),
        h('div', { className: 'item-sub' },
          `沿 ${step.insertAxis.toUpperCase()} 轴${step.insertSign > 0 ? '正' : '反'}向插入`,
          step.blockers.length ? ` · 对位 ${step.blockers.map(nameOf).join('、')}` : ' · 基准件')
      )
    )
    row.addEventListener('dragstart', () => { dragId = step.memberId; row.classList.add('dragging') })
    row.addEventListener('dragend', () => { row.classList.remove('dragging') })
    row.addEventListener('dragover', (e) => e.preventDefault())
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      if (!dragId || dragId === step.memberId) return
      const order = (plan?.steps ?? []).map((s) => s.memberId)
      const from = order.indexOf(dragId)
      const to = order.indexOf(step.memberId)
      order.splice(to, 0, order.splice(from, 1)[0])
      void store.setManualOrder(order).then(() => {
        store.recomputeWithManual()
        toast('已按手动顺序重新校验装配可行性')
      })
    })
    row.addEventListener('click', () => {
      store.selectMember(step.memberId)
      getViewer()?.setHighlight(step.memberId)
    })
    list.append(row)
  }
  box.append(list)
  return box
}

const nameOf = (id: string): string =>
  store.current?.members.find((m) => m.id === id)?.name ?? id
