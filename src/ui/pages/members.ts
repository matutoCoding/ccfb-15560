// 构件编辑页：木料截面/长度/位置/材种/木纹方向，左三维右表单
import type { Axis, GrainDir, Member, WoodSpecies } from '../../types'
import { store } from '../../data/store'
import { h, icon, numberField, selectField, textField, emptyState } from '../dom'
import { icons } from '../icons'
import { toast } from '../toast'
import { mountViewer, syncViewer } from './viewer_host'
import { watchPage } from './watch'
import { uid } from '../../core/math3d'

const SPECIES: { value: WoodSpecies; label: string }[] = [
  { value: 'walnut', label: '黑胡桃木' },
  { value: 'oak', label: '橡木' },
  { value: 'elm', label: '榆木' },
  { value: 'beech', label: '榉木' },
  { value: 'rosewood', label: '紫檀' },
  { value: 'pine', label: '松木' },
  { value: 'mahogany', label: '桃花心木' }
]
const AXES: { value: Axis; label: string }[] = [
  { value: 'x', label: 'X 轴' },
  { value: 'y', label: 'Y 轴' },
  { value: 'z', label: 'Z 轴' }
]

export const renderMembersPage = async (root: HTMLElement): Promise<void> => {
  const design = store.current
  if (!design) {
    root.append(emptyState('未选择款式', '先在款式库打开或新建一个款式', icons.member))
    return
  }

  const wrap = h('div', { className: 'workspace' })
  const viewerCard = h('div', { className: 'viewer-wrap' })
  const viewerEl = h('div', { className: 'viewer' })
  viewerCard.append(viewerEl)
  const toolbar = h('div', { className: 'viewer-toolbar' })
  const explodeBtn = h('button', { className: 'pill sm' }, icon(icons.explode), ' 爆炸')
  toolbar.append(explodeBtn)
  viewerCard.append(toolbar)

  const side = h('div', { className: 'card panel' })
  wrap.append(viewerCard, side)
  root.append(wrap)

  const viewer = await mountViewer(viewerEl)
  let exploded = false
  if (viewer) {
    explodeBtn.addEventListener('click', () => {
      exploded = !exploded
      viewer.setExplode(exploded ? 1 : 0)
      explodeBtn.textContent = exploded ? ' 归位' : ' 爆炸'
      explodeBtn.prepend(icon(icons.explode))
    })
  } else {
    explodeBtn.setAttribute('disabled', 'true')
  }

  renderSide(side)
  syncViewer()

  // 同页数据变化：局部刷新侧栏与三维，viewer 实例不重建
  watchPage(wrap, signature, () => {
    renderSide(side)
    syncViewer()
  })
}

// 仅侧栏关心的数据签名，选中变化也刷新高亮
const signature = (): string => {
  const d = store.current
  if (!d) return 'empty'
  return JSON.stringify({
    sel: store.get().selectedMemberId,
    m: d.members.map((m) => [m.id, m.name, m.size, m.center, m.lengthAxis, m.species, m.grain])
  })
}

const renderSide = (side: HTMLElement): void => {
  const design = store.current!
  side.innerHTML = ''

  const listHead = h('div', { className: 'flex between center' },
    h('h3', {}, '构件列表'),
    (() => {
      const btn = h('button', { className: 'primary sm' }, icon(icons.plus), ' 新建')
      btn.addEventListener('click', () => {
        const n = design.members.length + 1
        const member: Member = {
          id: uid('mem'),
          name: `构件 ${n}`,
          size: [40, 40, 200],
          center: [0, 0, 100],
          lengthAxis: 'z',
          species: 'elm',
          grain: 'z'
        }
        void store.addMember(member).then(() => {
          store.selectMember(member.id)
          renderSide(side)
        })
      })
      return btn
    })()
  )
  side.append(listHead)

  const list = h('div', { className: 'list' })
  for (const m of design.members) {
    const item = h('div', { className: `list-item ${store.get().selectedMemberId === m.id ? 'selected' : ''}` })
    item.append(
      h('div', {},
        h('div', { className: 'item-name' }, m.name),
        h('div', { className: 'item-sub' }, `${m.size.join('×')} · ${m.lengthAxis.toUpperCase()} 向 · ${labelOfSpecies(m.species)}`)
      )
    )
    item.addEventListener('click', () => {
      store.selectMember(m.id)
      renderSide(side)
    })
    list.append(item)
  }
  side.append(list)

  const selected = design.members.find((m) => m.id === store.get().selectedMemberId)
  if (selected) side.append(renderEditor(selected, side))
}

const renderEditor = (member: Member, side: HTMLElement): HTMLElement => {
  const design = store.current!
  const editor = h('div', { className: 'form-stack' })
  editor.append(h('div', { className: 'section-title' }, '构件参数'))

  editor.append(textField('构件名称', member.name, (v) => {
    void store.updateMember(member.id, { name: v })
  }))

  const sizeRow = h('div', { className: 'form-row three' },
    numberField('宽 X(mm)', member.size[0], (v) => updateSize(member, 0, v)),
    numberField('深 Y(mm)', member.size[1], (v) => updateSize(member, 1, v)),
    numberField('高 Z(mm)', member.size[2], (v) => updateSize(member, 2, v))
  )
  editor.append(sizeRow)

  const centerRow = h('div', { className: 'form-row three' },
    numberField('中心 X', member.center[0], (v) => updateCenter(member, 0, v)),
    numberField('中心 Y', member.center[1], (v) => updateCenter(member, 1, v)),
    numberField('中心 Z', member.center[2], (v) => updateCenter(member, 2, v))
  )
  editor.append(centerRow)

  editor.append(h('div', { className: 'form-row' },
    selectField<Axis>('长度轴向', member.lengthAxis, AXES, (v) => {
      void store.updateMember(member.id, { lengthAxis: v, grain: v })
    }),
    selectField<GrainDir>('木纹方向', member.grain, AXES, (v) => {
      void store.updateMember(member.id, { grain: v })
    })
  ))

  editor.append(selectField<WoodSpecies>('材种', member.species, SPECIES, (v) => {
    void store.updateMember(member.id, { species: v })
  }))

  const del = h('button', { className: 'danger' }, icon(icons.trash), ' 删除构件')
  del.addEventListener('click', () => {
    if (window.confirm(`删除构件「${member.name}」及其全部节点？`)) {
      void store.removeMember(member.id).then(() => {
        store.selectMember(null)
        renderSide(side)
        toast('构件已删除')
      })
    }
  })
  editor.append(del)
  void design
  return editor
}

const updateSize = (member: Member, index: number, v: number) => {
  if (!(v > 0)) return toast('尺寸必须大于 0', 'err')
  const size = [...member.size] as Member['size']
  size[index] = v
  void store.updateMember(member.id, { size })
}
const updateCenter = (member: Member, index: number, v: number) => {
  const center = [...member.center] as Member['center']
  center[index] = v
  void store.updateMember(member.id, { center })
}

const labelOfSpecies = (s: WoodSpecies): string => SPECIES.find((x) => x.value === s)?.label ?? s
