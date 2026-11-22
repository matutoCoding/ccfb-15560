// 干涉检查：原料箱做 AABB 粗筛，节点合法咬合体积扣除后，剩余交叠按最短轴厚度报穿透深度
import type { Design, InterferenceHit, InterferenceReport, Joint, Member, Vec3Tuple } from '../types'
import { aabbFromCenterSize, aabbIntersection, axisIndex, boxCenter, boxSize, type AABB } from './math3d'
import { effectiveMortiseDims, jointMemberIds } from './joints'
import { memberStockBox } from './solids'

export interface InterferenceCache {
  // key: 构件 id -> 构件尺寸/位置/节点版本串
  memberKeys: Map<string, string>
  // key: 构件对（排序后 id 拼接）-> 上次命中结果（无命中存 null）
  pairResults: Map<string, InterferenceHit | null>
  lastReport: InterferenceReport | null
}

export const createInterferenceCache = (): InterferenceCache => ({
  memberKeys: new Map(),
  pairResults: new Map(),
  lastReport: null
})

const memberVersionKey = (m: Member, joints: Joint[]): string => {
  const mine = joints.filter((j) => jointMemberIds(j).includes(m.id))
  return JSON.stringify({
    c: m.center,
    s: m.size,
    a: m.lengthAxis,
    j: mine.map((j) => [j.id, j.tenonWidth, j.tenonThickness, j.tenonLength, j.clearance, j.mortiseDisabled ? 1 : 0])
  })
}

const pairKey = (a: string, b: string): string => [a, b].sort().join('::')

// 节点合法咬合的 AABB（榫头在卯眼内的占用区域），用于扣除预期交叠
const jointMatingBox = (joint: Joint, members: Member[]): AABB | null => {
  if (joint.mortiseDisabled) return null
  const tenon = members.find((m) => m.id === joint.tenonMemberId)
  if (!tenon) return null
  const i = axisIndex(joint.tenonAxis ?? tenon.lengthAxis)
  const dims = effectiveMortiseDims(joint)
  const taper = joint.type === 'dovetail' ? joint.dovetailTaper ?? 0 : 0
  const size: Vec3Tuple = [...tenon.size]
  size[i] = dims.length
  const crossAxes = ([0, 1, 2] as const).filter((k) => k !== i)
  size[crossAxes[0]] = dims.width * (1 + taper)
  size[crossAxes[1]] = dims.thickness
  // 榫头从接触点 at 伸向卯眼构件一侧（与 tenon 构件分居 at 两侧）
  const center = [...joint.at] as Vec3Tuple
  const sign = Math.sign(tenon.center[i] - joint.at[i]) || 1
  center[i] = joint.at[i] - (sign * dims.length) / 2
  return aabbFromCenterSize(center, size)
}

const boxesOverlap = (a: AABB, b: AABB): boolean =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
  a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
  a.min[2] < b.max[2] && a.max[2] > b.min[2]

// 扣除节点合法咬合后剩余的交叠箱（可能被切成多块，取穿透最深处）
const residualOverlaps = (raw: AABB, jointBoxes: AABB[]): AABB[] => {
  let pieces = [raw]
  for (const jb of jointBoxes) {
    pieces = pieces.flatMap((p) => {
      const inter = aabbIntersection(p, jb)
      if (!inter) return [p]
      return subtractAabb(p, inter)
    })
  }
  return pieces.filter((p) => boxSize(p).every((v) => v > 1e-6))
}

// 同 solids.subtractBox 的六板片思路，这里只服务干涉计算
const subtractAabb = (a: AABB, b: AABB): AABB[] => {
  const out: AABB[] = []
  const push = (min: Vec3Tuple, max: Vec3Tuple) => {
    if (max.some((v, i) => v - min[i] <= 1e-9)) return
    out.push({ min, max })
  }
  if (b.min[0] > a.min[0]) push([a.min[0], a.min[1], a.min[2]], [b.min[0], a.max[1], a.max[2]])
  if (b.max[0] < a.max[0]) push([b.max[0], a.min[1], a.min[2]], [a.max[0], a.max[1], a.max[2]])
  if (b.min[1] > a.min[1]) push([Math.max(b.min[0], a.min[0]), a.min[1], a.min[2]], [Math.min(b.max[0], a.max[0]), b.min[1], a.max[2]])
  if (b.max[1] < a.max[1]) push([Math.max(b.min[0], a.min[0]), b.max[1], a.min[2]], [Math.min(b.max[0], a.max[0]), a.max[1], a.max[2]])
  if (b.min[2] > a.min[2]) push([Math.max(b.min[0], a.min[0]), Math.max(b.min[1], a.min[1]), a.min[2]], [Math.min(b.max[0], a.max[0]), Math.min(b.max[1], a.max[1]), b.min[2]])
  if (b.max[2] < a.max[2]) push([Math.max(b.min[0], a.min[0]), Math.max(b.min[1], a.min[1]), b.max[2]], [Math.min(b.max[0], a.max[0]), Math.min(b.max[1], a.max[1]), a.max[2]])
  return out
}

export const checkInterference = (
  design: Design,
  cache?: InterferenceCache
): InterferenceReport => {
  const start = performance.now()
  const hits: InterferenceHit[] = []
  const tolerance = design.settings.interferenceTolerance
  const members = design.members
  const stockBoxes = new Map(members.map((m) => [m.id, memberStockBox(m)]))

  // 缓存失效：只重算版本变化的构件所参与的配对
  const newKeys = new Map(members.map((m) => [m.id, memberVersionKey(m, design.joints)]))
  const dirty = new Set<string>()
  for (const [id, key] of newKeys) {
    if (cache?.memberKeys.get(id) !== key) dirty.add(id)
  }
  const deletedIds = [...(cache?.memberKeys.keys() ?? [])].filter((id) => !newKeys.has(id))
  for (const id of deletedIds) dirty.add(id)
  if (cache) {
    cache.memberKeys = newKeys
    for (const id of dirty) {
      for (const other of members) {
        cache.pairResults.delete(pairKey(id, other.id))
      }
    }
  }

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]
      const b = members[j]
      const key = pairKey(a.id, b.id)
      if (cache && !dirty.has(a.id) && !dirty.has(b.id) && cache.pairResults.has(key)) {
        const cached = cache.pairResults.get(key)
        if (cached) hits.push(cached)
        continue
      }
      const hit = evaluatePair(a, b, stockBoxes.get(a.id)!, stockBoxes.get(b.id)!, design)
      cache?.pairResults.set(key, hit)
      if (hit && hit.depth > tolerance) hits.push(hit)
    }
  }

  const report: InterferenceReport = { hits, elapsedMs: performance.now() - start }
  if (cache) cache.lastReport = report
  return report
}

const evaluatePair = (
  a: Member,
  b: Member,
  boxA: AABB,
  boxB: AABB,
  design: Design
): InterferenceHit | null => {
  const raw = aabbIntersection(boxA, boxB)
  if (!raw) return null
  // 该构件对之间由节点定义的合法咬合体积
  const jointBoxes = design.joints
    .filter((jt) => {
      const ids = jointMemberIds(jt)
      return ids.includes(a.id) && ids.includes(b.id)
    })
    .map((jt) => jointMatingBox(jt, design.members))
    .filter((x): x is AABB => x !== null)
  const pieces = residualOverlaps(raw, jointBoxes.filter(boxesOverlap.bind(null, raw) as (x: AABB) => boolean))
  if (pieces.length === 0) return null
  // 穿透深度 = 最厚残块的最短轴尺寸
  let worst = pieces[0]
  for (const p of pieces.slice(1)) {
    if (Math.min(...boxSize(p)) > Math.min(...boxSize(worst))) worst = p
  }
  const depth = Math.min(...boxSize(worst))
  return {
    memberA: a.id,
    memberB: b.id,
    depth: Math.round(depth * 100) / 100,
    center: boxCenter(worst),
    box: { min: worst.min, max: worst.max }
  }
}
