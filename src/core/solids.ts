// 装配感知的实体表达：构件 = 原料方箱减去自身卯眼腔体
// 全部为轴对齐箱布尔，无渲染依赖，node 环境可直接跑
import type { Axis, Joint, Member, Sign, Vec3Tuple } from '../types'
import { axisIndex, aabbOverlap, aabbFromCenterSize } from './math3d'
import type { AABB } from './math3d'
import { effectiveMortiseDims, jointInsertAxis } from './joints'

export type Box = AABB

export const memberStockBox = (m: Member): Box => aabbFromCenterSize(m.center, m.size)

// 某节点在卯眼构件上挖出的腔体箱（燕尾用大头 AABB 近似，偏保守不会漏判阻挡）
export const cavityBoxForJoint = (joint: Joint, members: Member[], ownerId: string): Box | null => {
  if (joint.mortiseDisabled) return null
  if (joint.mortiseMemberId !== ownerId && joint.thirdMemberId !== ownerId) return null
  const dims = effectiveMortiseDims(joint)
  const insert = jointInsertAxis(joint, members)
  const owner = members.find((m) => m.id === ownerId)
  if (!owner) return null
  const [crossA, crossB] = (['x', 'y', 'z'] as Axis[]).filter((a) => a !== insert) as [Axis, Axis]
  const taper = joint.type === 'dovetail' ? (joint.dovetailTaper ?? 0) : 0
  const w = dims.width * (1 + taper)
  const t = dims.thickness
  const size: Vec3Tuple = [0, 0, 0]
  size[axisIndex(insert)] = dims.length
  size[axisIndex(crossA)] = w
  size[axisIndex(crossB)] = t
  return aabbFromCenterSize(joint.at, size)
}

const EPS = 1e-9

// 轴对齐箱减轴对齐箱，六面体板片分解，结果互不重叠且并集为 a \\ b
export const subtractBox = (a: Box, b: Box): Box[] => {
  if (!aabbOverlap(a, b)) return [a]
  const out: Box[] = []
  const push = (min: Vec3Tuple, max: Vec3Tuple) => {
    if (max.some((v, i) => v - min[i] <= EPS)) return
    out.push({ min, max })
  }
  // x 方向两块侧板，保留完整 y/z
  if (b.min[0] > a.min[0]) {
    push([a.min[0], a.min[1], a.min[2]], [b.min[0], a.max[1], a.max[2]])
  }
  if (b.max[0] < a.max[0]) {
    push([b.max[0], a.min[1], a.min[2]], [a.max[0], a.max[1], a.max[2]])
  }
  // y 方向板，夹在 b 的 x 范围内
  if (b.min[1] > a.min[1]) {
    push([Math.max(b.min[0], a.min[0]), a.min[1], a.min[2]], [Math.min(b.max[0], a.max[0]), b.min[1], a.max[2]])
  }
  if (b.max[1] < a.max[1]) {
    push([Math.max(b.min[0], a.min[0]), b.max[1], a.min[2]], [Math.min(b.max[0], a.max[0]), a.max[1], a.max[2]])
  }
  // z 方向板，夹在 b 的 x/y 范围内
  if (b.min[2] > a.min[2]) {
    push(
      [Math.max(b.min[0], a.min[0]), Math.max(b.min[1], a.min[1]), a.min[2]],
      [Math.min(b.max[0], a.max[0]), Math.min(b.max[1], a.max[1]), b.min[2]]
    )
  }
  if (b.max[2] < a.max[2]) {
    push(
      [Math.max(b.min[0], a.min[0]), Math.max(b.min[1], a.min[1]), b.max[2]],
      [Math.min(b.max[0], a.max[0]), Math.min(b.max[1], a.max[1]), a.max[2]]
    )
  }
  return out
}

// 构件实体箱集合：原料箱依次减去自身全部卯眼腔体
export const memberSolidBoxes = (member: Member, joints: Joint[], members: Member[]): Box[] => {
  let boxes = [memberStockBox(member)]
  for (const joint of joints) {
    const cavity = cavityBoxForJoint(joint, members, member.id)
    if (!cavity) continue
    boxes = boxes.flatMap((box) => subtractBox(box, cavity))
  }
  return boxes
}

// 单箱沿 axis/sign 扫向无穷远时是否与障碍箱相交
const sweptHitsBox = (src: Box, blocker: Box, axis: Axis, sign: Sign): boolean => {
  const axes: Axis[] = ['x', 'y', 'z']
  for (const ax of axes) {
    const k = axisIndex(ax)
    if (ax === axis) {
      // 行进方向上前方存在障碍（相切不算阻挡）
      if (sign > 0 ? blocker.max[k] <= src.min[k] + EPS : blocker.min[k] >= src.max[k] - EPS) return false
    } else if (src.max[k] <= blocker.min[k] + EPS || src.min[k] >= blocker.max[k] - EPS) {
      return false
    }
  }
  return true
}

export interface ExtractionResult {
  ok: boolean
  blockerIds: string[]
}

// 判断 candidate 能否沿 (axis, sign) 从 remaining 构件中抽出
export const canExtract = (
  candidateId: string,
  remainingIds: string[],
  axis: Axis,
  sign: Sign,
  solids: Map<string, Box[]>
): ExtractionResult => {
  const own = solids.get(candidateId)
  if (!own) return { ok: true, blockerIds: [] }
  const blockerIds = new Set<string>()
  for (const otherId of remainingIds) {
    if (otherId === candidateId) continue
    const other = solids.get(otherId)
    if (!other) continue
    let blocked = false
    for (const src of own) {
      for (const blk of other) {
        if (sweptHitsBox(src, blk, axis, sign)) {
          blocked = true
          break
        }
      }
      if (blocked) break
    }
    if (blocked) blockerIds.add(otherId)
  }
  return { ok: blockerIds.size === 0, blockerIds: [...blockerIds] }
}

export const DIRECTIONS: { axis: Axis; sign: Sign }[] = [
  { axis: 'x', sign: 1 },
  { axis: 'x', sign: -1 },
  { axis: 'y', sign: 1 },
  { axis: 'y', sign: -1 },
  { axis: 'z', sign: 1 },
  { axis: 'z', sign: -1 }
]
