// 装配顺序求解：装配可行性 == 反向拆卸可行性
// 每轮在剩余构件中寻找六方向可抽出者，贪心剥离；剥不动则报告锁死核
import type { AssemblyPlan, AssemblyStep, Design, LockReport, Member } from '../types'
import { axisIndex } from './math3d'
import type { Axis, Sign, Vec3Tuple } from '../types'
import { canExtract, DIRECTIONS, memberSolidBoxes, memberStockBox, type Box } from './solids'
import { validateJoint } from './joints'

interface BuiltSolids {
  solids: Map<string, Box[]>
  jointDegree: Map<string, number>
  configErrors: string[]
}

const buildSolids = (design: Design): BuiltSolids => {
  const solids = new Map<string, Box[]>()
  const jointDegree = new Map<string, number>()
  for (const m of design.members) {
    solids.set(m.id, memberSolidBoxes(m, design.joints, design.members))
    jointDegree.set(m.id, 0)
  }
  for (const j of design.joints) {
    for (const id of [j.tenonMemberId, j.mortiseMemberId, j.thirdMemberId]) {
      if (id) jointDegree.set(id, (jointDegree.get(id) ?? 0) + 1)
    }
  }
  const configErrors: string[] = []
  for (const j of design.joints) configErrors.push(...validateJoint(j, design.members))
  for (const j of design.joints) {
    if (j.mortiseDisabled) {
      configErrors.push(`节点「${j.name}」的卯眼已停用，构件 ${j.tenonMemberId} 的榫头无处容纳`)
    }
  }
  return { solids, jointDegree, configErrors }
}

// 找构件当前可用的抽出方向（DIRECTIONS 固定顺序保证结果确定）
const findExtraction = (
  memberId: string,
  remaining: string[],
  solids: Map<string, Box[]>
): { axis: Axis; sign: Sign } | null => {
  for (const d of DIRECTIONS) {
    if (canExtract(memberId, remaining, d.axis, d.sign, solids).ok) return d
  }
  return null
}

const lockReport = (
  remaining: string[],
  solids: Map<string, Box[]>,
  configErrors: string[],
  members: Member[]
): LockReport => {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? id
  const reasons: LockReport['reasons'] = {}
  for (const id of remaining) {
    const list: LockReport['reasons'][string] = []
    for (const d of DIRECTIONS) {
      const r = canExtract(id, remaining, d.axis, d.sign, solids)
      if (!r.ok) {
        list.push({ axis: d.axis, sign: d.sign, blockerIds: r.blockerIds })
      }
    }
    reasons[id] = list
  }
  return {
    locked: true,
    memberIds: [...remaining],
    reasons,
    configErrors: [
      ...configErrors,
      `构件 ${remaining.map(nameOf).join('、')} 互相锁死，六个方向均无法抽出`
    ]
  }
}

const stepsFromRemoval = (
  removal: { memberId: string; axis: Axis; sign: Sign }[],
  solids: Map<string, Box[]>
): AssemblyStep[] => {
  // 拆卸序列反转 = 装配序列；插入方向与抽出方向同轴反向
  const placed: string[] = []
  const steps: AssemblyStep[] = []
  const reversed = [...removal].reverse()
  reversed.forEach((r, idx) => {
    const insertSign = (-r.sign) as Sign
    const check = canExtract(r.memberId, placed, r.axis, insertSign, solids)
    steps.push({
      order: idx + 1,
      memberId: r.memberId,
      insertAxis: r.axis,
      insertSign,
      blockers: check.blockerIds
    })
    placed.push(r.memberId)
  })
  return steps
}

export interface PlanOptions {
  respectManual?: boolean
}

export const planAssembly = (design: Design, opts: PlanOptions = {}): AssemblyPlan => {
  const { solids, jointDegree, configErrors } = buildSolids(design)
  if (design.members.length === 0) return { steps: [], lock: null }

  // 手动顺序校验模式：按给定顺序逐件验证插入可行性
  if (opts.respectManual && design.manualOrder && design.manualOrder.length > 0) {
    return validateManualOrder(design, design.manualOrder, solids, configErrors)
  }

  const remaining = design.members.map((m) => m.id)
  const removal: { memberId: string; axis: Axis; sign: Sign }[] = []

  while (remaining.length > 0) {
    // 先收集所有可拆构件，优先拆连接数少的（先拆附件、后拆框架），同票按 id 保证确定性
    let best: { memberId: string; axis: Axis; sign: Sign; degree: number } | null = null
    for (const memberId of remaining) {
      const dir = findExtraction(memberId, remaining, solids)
      if (!dir) continue
      const degree = jointDegree.get(memberId) ?? 0
      if (!best || degree < best.degree || (degree === best.degree && memberId < best.memberId)) {
        best = { memberId, ...dir, degree }
      }
    }
    if (!best) {
      return {
        steps: stepsFromRemoval(removal, solids),
        lock: lockReport(remaining, solids, configErrors, design.members)
      }
    }
    removal.push({ memberId: best.memberId, axis: best.axis, sign: best.sign })
    remaining.splice(remaining.indexOf(best.memberId), 1)
  }

  return { steps: stepsFromRemoval(removal, solids), lock: configErrors.length ? {
    locked: false,
    memberIds: [],
    reasons: {},
    configErrors
  } : null }
}

const validateManualOrder = (
  design: Design,
  order: string[],
  solids: Map<string, Box[]>,
  configErrors: string[]
): AssemblyPlan => {
  const nameOf = (id: string) => design.members.find((m) => m.id === id)?.name ?? id
  const known = new Set(design.members.map((m) => m.id))
  const sequence = order.filter((id) => known.has(id))
  const placed: string[] = []
  const steps: AssemblyStep[] = []
  for (const [idx, memberId] of sequence.entries()) {
    let picked: { axis: Axis; sign: Sign } | null = null
    for (const d of DIRECTIONS) {
      const insertSign = (-d.sign) as Sign
      if (canExtract(memberId, placed, d.axis, insertSign, solids).ok) {
        picked = { axis: d.axis, sign: insertSign }
        break
      }
    }
    if (!picked) {
      const reasons: LockReport['reasons'] = {}
      for (const d of DIRECTIONS) {
        const insertSign = (-d.sign) as Sign
        const r = canExtract(memberId, placed, d.axis, insertSign, solids)
        if (!r.ok) reasons[memberId] = [...(reasons[memberId] ?? []), { axis: d.axis, sign: insertSign, blockerIds: r.blockerIds }]
      }
      return {
        steps,
        manualOrder: order,
        lock: {
          locked: true,
          memberIds: [memberId],
          reasons,
          configErrors: [
            ...configErrors,
            `手动顺序第 ${idx + 1} 步的构件「${nameOf(memberId)}」无法装入，被 ${reasons[memberId]?.flatMap((r) => r.blockerIds).map(nameOf).join('、') || '周围构件'} 阻挡`
          ]
        }
      }
    }
    const check = canExtract(memberId, placed, picked.axis, picked.sign, solids)
    steps.push({
      order: idx + 1,
      memberId,
      insertAxis: picked.axis,
      insertSign: picked.sign,
      blockers: check.blockerIds
    })
    placed.push(memberId)
  }
  return { steps, lock: configErrors.length ? { locked: false, memberIds: [], reasons: {}, configErrors } : null, manualOrder: order }
}

// 爆炸位置：沿抽出方向移动到与所有其他实体箱彻底分离的最小距离
export const explodeOffset = (
  memberId: string,
  axis: Axis,
  sign: Sign,
  solids: Map<string, Box[]>,
  gap: number
): Vec3Tuple => {
  const own = solids.get(memberId)
  if (!own || own.length === 0) return [0, 0, 0]
  const i = axisIndex(axis)
  let distance = gap
  for (const [otherId, boxes] of solids) {
    if (otherId === memberId) continue
    for (const src of own) {
      for (const blk of boxes) {
        const crossAxes = ([0, 1, 2] as const).filter((k) => k !== i)
        const crossClear = crossAxes.some(
          (k) => src.max[k] <= blk.min[k] || src.min[k] >= blk.max[k]
        )
        if (crossClear) continue
        // 需要移动到 src 的行进侧表面越过 blk
        const need = sign > 0 ? blk.max[i] - src.min[i] + gap : src.max[i] - blk.min[i] + gap
        if (need > distance) distance = need
      }
    }
  }
  const offset: Vec3Tuple = [0, 0, 0]
  offset[i] = sign * distance
  return offset
}

// 整组构件的统一包围盒（说明书/视角适配用）
export const sceneBounds = (members: Member[]): Box | null => {
  if (members.length === 0) return null
  const boxes = members.map(memberStockBox)
  const min: Vec3Tuple = [Infinity, Infinity, Infinity]
  const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity]
  for (const b of boxes) {
    for (const k of [0, 1, 2] as const) {
      min[k] = Math.min(min[k], b.min[k])
      max[k] = Math.max(max[k], b.max[k])
    }
  }
  return { min, max }
}
