// 基于 three-bvh-csg 的构件实体构建：原料方箱 union 榫头、subtract 卯眼
// Brush 按参数缓存，单件尺寸变更只重建相关构件
import * as THREE from 'three'
import { Brush, Evaluator, SUBTRACTION, ADDITION } from 'three-bvh-csg'
import type { Joint, Member } from '../types'
import { axisIndex, round3 } from './math3d'
import { effectiveMortiseDims, jointInsertAxis } from './joints'

const evaluator = new Evaluator()
evaluator.useGroups = false

const brushCache = new Map<string, Brush>()

const brushKey = (kind: string, pos: THREE.Vector3, size: THREE.Vector3, scaleY = 1): string =>
  [kind, round3(pos.x), round3(pos.y), round3(pos.z), round3(size.x), round3(size.y), round3(size.z), round3(scaleY)].join('|')

const boxBrush = (size: THREE.Vector3, pos: THREE.Vector3, kind = 'box'): Brush => {
  const key = brushKey(kind, pos, size)
  const cached = brushCache.get(key)
  if (cached) return cached
  const brush = new Brush(new THREE.BoxGeometry(size.x, size.y, size.z))
  brush.position.copy(pos)
  brush.updateMatrixWorld()
  brushCache.set(key, brush)
  return brush
}

// 燕尾榫头：沿插入轴看，前端大后端小的梯形台，taperAxis 指示世界轴中哪条是榫轴
const dovetailBrush = (size: THREE.Vector3, pos: THREE.Vector3, taper: number, taperAxis: 0 | 1 | 2): Brush => {
  const key = brushKey('dovetail', pos, size, taper + taperAxis * 100)
  const cached = brushCache.get(key)
  if (cached) return cached
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1)
  const fullLen = size.getComponent(taperAxis)
  // 沿榫轴正向的截面逐步放大成燕尾大头
  const posAttr = geo.attributes.position as THREE.BufferAttribute
  const getters = [(i: number) => posAttr.getX(i), (i: number) => posAttr.getY(i), (i: number) => posAttr.getZ(i)]
  const setters = [
    (i: number, v: number) => posAttr.setX(i, v),
    (i: number, v: number) => posAttr.setY(i, v),
    (i: number, v: number) => posAttr.setZ(i, v)
  ]
  const axisK = taperAxis
  for (let i = 0; i < posAttr.count; i++) {
    const along = getters[axisK](i)
    const k = 1 + taper * (along / fullLen + 0.5)
    for (const cross of [0, 1, 2] as const) {
      if (cross === axisK) continue
      setters[cross](i, getters[cross](i) * k)
    }
  }
  geo.computeVertexNormals()
  const brush = new Brush(geo)
  brush.position.copy(pos)
  brush.updateMatrixWorld()
  brushCache.set(key, brush)
  return brush
}

const v3 = (t: [number, number, number]): THREE.Vector3 => new THREE.Vector3(t[0], t[1], t[2])

// 节点在某构件上的操作：出榫（UNION）或开卯（SUBTRACTION）
interface JointOp {
  kind: 'tenon' | 'mortise'
  joint: Joint
}

const opsForMember = (member: Member, joints: Joint[]): JointOp[] => {
  const ops: JointOp[] = []
  for (const j of joints) {
    if (j.tenonMemberId === member.id) ops.push({ kind: 'tenon', joint: j })
    if (j.mortiseMemberId === member.id || j.thirdMemberId === member.id) {
      ops.push({ kind: 'mortise', joint: j })
    }
  }
  return ops
}

// 榫头沿 tenonAxis（默认构件长度轴）、从节点中心伸向榫头构件一侧
const tenonTransform = (joint: Joint, member: Member): { size: THREE.Vector3; pos: THREE.Vector3 } => {
  const i = axisIndex(joint.tenonAxis ?? member.lengthAxis)
  const dims = joint.type === 'dovetail'
    ? { w: joint.tenonWidth * (1 + (joint.dovetailTaper ?? 0)), t: joint.tenonThickness * (1 + (joint.dovetailTaper ?? 0)) }
    : { w: joint.tenonWidth, t: joint.tenonThickness }
  const sizeArr: [number, number, number] = [0, 0, 0]
  const crossAxes = ([0, 1, 2] as const).filter((k) => k !== i)
  sizeArr[i] = joint.tenonLength
  sizeArr[crossAxes[0]] = dims.w
  sizeArr[crossAxes[1]] = dims.t
  const posArr = [...joint.at] as [number, number, number]
  const sign = Math.sign(member.center[i] - joint.at[i]) || 1
  posArr[i] = joint.at[i] - sign * joint.tenonLength / 2
  return { size: v3(sizeArr), pos: v3(posArr) }
}

// 卯眼沿插入轴做通透腔体，长度取构件该轴全长，保证可滑装
const mortiseTransform = (joint: Joint, members: Member[], member: Member): { size: THREE.Vector3; pos: THREE.Vector3 } => {
  const insert = jointInsertAxis(joint, members)
  const i = axisIndex(insert)
  const dims = effectiveMortiseDims(joint)
  const taper = joint.type === 'dovetail' ? joint.dovetailTaper ?? 0 : 0
  const sizeArr: [number, number, number] = [0, 0, 0]
  const crossAxes = ([0, 1, 2] as const).filter((k) => k !== i)
  sizeArr[i] = member.size[i] + 2
  sizeArr[crossAxes[0]] = dims.width * (1 + taper)
  sizeArr[crossAxes[1]] = dims.thickness
  return { size: v3(sizeArr), pos: v3(joint.at) }
}

export interface BuiltMember {
  geometry: THREE.BufferGeometry
  // 该构件参与的操作，供剖切/线框复用
  jointCount: number
}

// 单构件布尔构建，调用方负责材质
export const buildMemberGeometry = (member: Member, joints: Joint[], members: Member[]): BuiltMember => {
  let result: Brush = boxBrush(v3(member.size), v3(member.center), `stock_${member.id}`)
  const ops = opsForMember(member, joints)
  for (const op of ops) {
    const j = op.joint
    let brush: Brush
    if (op.kind === 'tenon') {
      const tt = tenonTransform(j, member)
      brush = j.type === 'dovetail'
        ? dovetailBrush(tt.size, tt.pos, j.dovetailTaper ?? 0, axisIndex(j.tenonAxis ?? member.lengthAxis))
        : boxBrush(tt.size, tt.pos, `tenon_${j.id}`)
      result = evaluator.evaluate(result, brush, ADDITION) as Brush
    } else if (!j.mortiseDisabled) {
      const mt = mortiseTransform(j, members, member)
      brush = boxBrush(mt.size, mt.pos, `mortise_${j.id}_${member.id}`)
      result = evaluator.evaluate(result, brush, SUBTRACTION) as Brush
    }
  }
  result.geometry.computeVertexNormals()
  return { geometry: result.geometry, jointCount: ops.length }
}

export const clearGeometryCache = (): void => brushCache.clear()

// 木纹贴图：程序化 Canvas 纹理，按 grain 轴设置纹理旋转，保证纹理顺木纹方向
export const makeGrainTexture = (baseColor: string, grainColor: string, seed = 1): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = grainColor
  ctx.globalAlpha = 0.35
  let s = seed * 9301 + 49297
  const rand = () => {
    s = (s * 233280 + 1) % 9973
    return s / 9973
  }
  for (let line = 0; line < 28; line++) {
    const y = (line / 28) * 256 + rand() * 6
    ctx.beginPath()
    ctx.lineWidth = 0.8 + rand() * 1.6
    ctx.moveTo(0, y)
    for (let x = 0; x <= 256; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + line) * 3 + (rand() - 0.5) * 2)
    }
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}
