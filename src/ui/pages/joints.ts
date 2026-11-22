// 榫卯库页：选节点类型 + 两构件自动建节点，榫头尺寸驱动卯眼联动，间隙独立可调
import type { Axis, Joint, JointType } from '../../types'
import { store } from '../../data/store'
import { h, icon, numberField, selectField, emptyState } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { mountViewer, syncViewer } from './viewer_host'
import { watchPage } from './watch'
import { uid } from '../../core/math3d'
import { JOINT_CATALOG, contactAt, defaultJointParams, validateJoint, jointInsertAxis } from '../../core/joints'

export const renderJointsPage = async (root: HTMLElement): Promise<void> => {
  const design = store.current
  if (!design || design.members.length < 2) {
    root.append(emptyState('构件不足', '至少需要两根构件才能建立榫卯节点', icons.joint))
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

  await mountViewer(viewerEl)
  renderSide(side)
  syncViewer()

  watchPage(wrap, () => {
    const d = store.current
    return d ? JSON.stringify({
      sel: store.get().selectedJointId,
      j: d.joints.map((j) => [j.id, j.name, j.type, j.tenonMemberId, j.mortiseMemberId,
        j.tenonLength, j.tenonWidth, j.tenonThickness, j.clearance, j.dovetailTaper,
        j.shoulderDepth, j.at, j.tenonAxis, j.mortiseDisabled]),
      m: d.members.map((m) => m.id)
    }) : 'empty'
  }, () => {
    renderSide(side)
    syncViewer()
  })
}

const renderSide = (side: HTMLElement): void => {
  const design = store.current!
  side.innerHTML = ''

  side.append(h('h3', {}, '榫卯节点'))
  const validationErrors = design.joints.flatMap((j) => validateJoint(j, design.members))
  if (validationErrors.length > 0) {
    const alert = h('div', { className: 'alert danger' })
    validationErrors.forEach((e) => alert.append(h('div', {}, e)))
    side.append(alert)
  }

  // 已有节点列表
  const list = h('div', { className: 'list' })
  for (const j of design.joints) {
    const item = h('div', { className: `list-item ${store.get().selectedJointId === j.id ? 'selected' : ''}` })
    const insertAxis = (() => { try { return jointInsertAxis(j, design.members) } catch { return '?' } })()
    item.append(
      h('div', {},
        h('div', { className: 'item-name' }, `${JOINT_CATALOG[j.type].label} · ${j.name}`),
        h('div', { className: 'item-sub' },
          `${nameOf(j.tenonMemberId)} → ${nameOf(j.mortiseMemberId)} · 插入 ${String(insertAxis).toUpperCase()} · 间隙 ${j.clearance}mm`,
          j.mortiseDisabled ? h('span', { className: 'badge danger' }, ' 卯眼停用') : ''
        )
      )
    )
    item.addEventListener('click', () => {
      store.selectJoint(j.id)
      renderSide(side)
    })
    list.append(item)
  }
  side.append(list)

  const selected = design.joints.find((j) => j.id === store.get().selectedJointId)
  if (selected) side.append(renderJointEditor(selected, side))
  side.append(renderCreator(side))
}

const renderCreator = (side: HTMLElement): HTMLElement => {
  const design = store.current!
  const box = h('div', { className: 'form-stack', style: 'border-top:1px solid var(--c-border);padding-top:var(--sp-4)' })
  box.append(h('div', { className: 'section-title' }, '新建节点（选两构件自动开榫）'))

  const memberOptions = design.members.map((m) => ({ value: m.id, label: `${m.name}（${m.id.slice(-4)}）` }))
  let type: JointType = 'crossShoulder'
  let tenonId = design.members[0].id
  let mortiseId = design.members[1]?.id ?? design.members[0].id

  const typeSelect = selectField<JointType>('节点类型', type,
    (Object.keys(JOINT_CATALOG) as JointType[]).map((t) => ({ value: t, label: JOINT_CATALOG[t].label })),
    (v) => { type = v })
  const tenonSelect = selectField('榫头构件（出榫）', tenonId, memberOptions, (v) => { tenonId = v })
  const mortiseSelect = selectField('卯眼构件（开卯）', mortiseId, memberOptions, (v) => { mortiseId = v })
  const desc = h('div', { className: 'muted' }, JOINT_CATALOG[type].desc)

  const addBtn = h('button', { className: 'primary' }, icon(icons.plus), ' 自动开榫')
  addBtn.addEventListener('click', () => {
    if (tenonId === mortiseId) return toast('榫头与卯眼必须是两根不同构件', 'err')
    const tenon = design.members.find((m) => m.id === tenonId)!
    const mortise = design.members.find((m) => m.id === mortiseId)!
    const params = defaultJointParams(tenon, mortise, type)
    const joint: Joint = {
      id: uid('j'),
      name: `${tenon.name}-${mortise.name}`,
      type,
      tenonMemberId: tenonId,
      mortiseMemberId: mortiseId,
      at: contactAt(tenon, mortise),
      ...params
    }
    const errors = validateJoint(joint, design.members)
    if (errors.length > 0) return toast(errors[0], 'err')
    void store.addJoint(joint).then(() => {
      store.selectJoint(joint.id)
      renderSide(side)
      toast('榫头与卯眼已自动生成')
    })
  })

  typeSelect.querySelector('select')!.addEventListener('change', () => {
    desc.textContent = JOINT_CATALOG[type].desc
  })
  box.append(typeSelect, desc, tenonSelect, mortiseSelect, addBtn)
  return box
}

const renderJointEditor = (joint: Joint, side: HTMLElement): HTMLElement => {
  const design = store.current!
  const editor = h('div', { className: 'form-stack', style: 'border-top:1px solid var(--c-border);padding-top:var(--sp-4)' })
  editor.append(h('div', { className: 'section-title' }, '节点参数（改榫头，卯眼自动跟随）'))

  const axisOptions: { value: Axis; label: string }[] = [
    { value: 'x', label: 'X 轴' }, { value: 'y', label: 'Y 轴' }, { value: 'z', label: 'Z 轴' }
  ]
  const tenon = design.members.find((m) => m.id === joint.tenonMemberId)
  const defaultAxis: Axis = joint.tenonAxis ?? tenon?.lengthAxis ?? 'x'

  editor.append(
    numberField('榫头长度 (mm)', joint.tenonLength, (v) => store.updateJoint(joint.id, { tenonLength: v }), 0.5),
    h('div', { className: 'form-row' },
      numberField('榫头宽度 (mm)', joint.tenonWidth, (v) => store.updateJoint(joint.id, { tenonWidth: v }), 0.5),
      numberField('榫头厚度 (mm)', joint.tenonThickness, (v) => store.updateJoint(joint.id, { tenonThickness: v }), 0.5)
    ),
    selectField<Axis>('榫头轴向', defaultAxis, axisOptions, (v) => {
      const member = design.members.find((m) => m.id === joint.tenonMemberId)
      void store.updateJoint(joint.id, { tenonAxis: v === member?.lengthAxis ? undefined : v })
    }),
    // 配合间隙独立设置，作用于卯眼四周
    numberField('配合间隙 (mm)，仅作用于卯眼', joint.clearance, (v) => {
      if (v < 0) return toast('间隙不能为负', 'err')
      void store.updateJoint(joint.id, { clearance: v })
    }, 0.1)
  )

  if (joint.type === 'dovetail') {
    editor.append(numberField('燕尾收分比例', joint.dovetailTaper ?? 0.12, (v) =>
      store.updateJoint(joint.id, { dovetailTaper: v }), 0.01))
  }
  if (joint.type === 'crossShoulder' || joint.type === 'hugShoulder') {
    editor.append(numberField('肩部包覆深度 (mm)', joint.shoulderDepth ?? 8, (v) =>
      store.updateJoint(joint.id, { shoulderDepth: v }), 1))
  }

  // 节点中心微调
  editor.append(h('div', { className: 'form-row three' },
    ...([0, 1, 2] as const).map((i) =>
      numberField(`节点 ${['X', 'Y', 'Z'][i]}`, joint.at[i], (v) => {
        const at = [...joint.at] as Joint['at']
        at[i] = v
        void store.updateJoint(joint.id, { at })
      }, 1))
  ))

  const errors = validateJoint(joint, design.members)
  if (errors.length > 0) {
    const alert = h('div', { className: 'alert danger' })
    errors.forEach((e) => alert.append(h('div', {}, e)))
    editor.append(alert)
  }

  const row = h('div', { className: 'flex gap-2' })
  const toggle = h('button', {}, joint.mortiseDisabled ? '恢复卯眼' : '停用卯眼（故障演练）')
  toggle.addEventListener('click', () => {
    void store.updateJoint(joint.id, { mortiseDisabled: !joint.mortiseDisabled }).then(() => renderSide(side))
  })
  const del = h('button', { className: 'danger' }, icon(icons.trash), ' 删除节点')
  del.addEventListener('click', () => {
    if (window.confirm('删除该榫卯节点？')) {
      void store.removeJoint(joint.id).then(() => {
        store.selectJoint(null)
        renderSide(side)
      })
    }
  })
  row.append(toggle, del)
  editor.append(row)
  return editor
}

const nameOf = (id: string): string => store.current?.members.find((m) => m.id === id)?.name ?? id
