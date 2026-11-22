// 通用几何/数学工具，全部纯函数，可在 node 测试环境直接跑
import type { Axis, Sign, Vec3Tuple } from '../types'

export const AXES: Axis[] = ['x', 'y', 'z']

export const VEC = {
  add: (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3Tuple, s: number): Vec3Tuple => [a[0] * s, a[1] * s, a[2] * s]
}

export const axisIndex = (axis: Axis): 0 | 1 | 2 =>
  axis === 'x' ? 0 : axis === 'y' ? 1 : 2

export const otherAxes = (axis: Axis): [Axis, Axis] => {
  if (axis === 'x') return ['y', 'z']
  if (axis === 'y') return ['x', 'z']
  return ['x', 'y']
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

// 轴对齐包围盒
export interface AABB {
  min: Vec3Tuple
  max: Vec3Tuple
}

export const aabbFromCenterSize = (center: Vec3Tuple, size: Vec3Tuple): AABB => ({
  min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
  max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2]
})

export const aabbOverlap = (a: AABB, b: AABB): boolean =>
  a.min[0] < b.max[0] && a.max[0] > b.min[0] &&
  a.min[1] < b.max[1] && a.max[1] > b.min[1] &&
  a.min[2] < b.max[2] && a.max[2] > b.min[2]

// 交叠区域包围盒，不相交返回 null
export const aabbIntersection = (a: AABB, b: AABB): AABB | null => {
  if (!aabbOverlap(a, b)) return null
  const min: Vec3Tuple = [
    Math.max(a.min[0], b.min[0]),
    Math.max(a.min[1], b.min[1]),
    Math.max(a.min[2], b.min[2])
  ]
  const max: Vec3Tuple = [
    Math.min(a.max[0], b.max[0]),
    Math.min(a.max[1], b.max[1]),
    Math.min(a.max[2], b.max[2])
  ]
  return { min, max }
}

export const boxCenter = (box: AABB): Vec3Tuple => [
  (box.min[0] + box.max[0]) / 2,
  (box.min[1] + box.max[1]) / 2,
  (box.min[2] + box.max[2]) / 2
]

export const boxSize = (box: AABB): Vec3Tuple => [
  box.max[0] - box.min[0],
  box.max[1] - box.min[1],
  box.max[2] - box.min[2]
]

// 沿 axis 方向把 box 扫到无穷远形成的扫掠体包围盒
export const sweptBox = (box: AABB, axis: Axis, sign: Sign): AABB => {
  const i = axisIndex(axis)
  const min = [...box.min] as Vec3Tuple
  const max = [...box.max] as Vec3Tuple
  if (sign > 0) max[i] = Number.POSITIVE_INFINITY
  else min[i] = Number.NEGATIVE_INFINITY
  return { min, max }
}

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

// 四舍五入到 0.01mm，避免浮点噪声污染缓存 key
export const round3 = (v: number): number => Math.round(v * 1000) / 1000

export const tupleKey = (v: Vec3Tuple): string => v.map(round3).join('|')
