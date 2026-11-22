// 榫卯库：四种节点的参数规则、插入方向推导与配合尺寸联动
import type { Axis, Joint, JointType, Member, Vec3Tuple } from '../types'
import { axisIndex, otherAxes } from './math3d'

export interface JointCatalogItem {
  type: JointType
  label: string
  desc: string
  // 是否为三构件节点
  threeWay: boolean
  // 插入方向取自哪一侧构件的木料轴向
  insertFrom: 'tenon' | 'mortise'
}

export const JOINT_CATALOG: Record<JointType, JointCatalogItem> = {
  dovetail: {
    type: 'dovetail',
    label: '燕尾榫',
    desc: '梯形截面前大后小，沿卯眼构件木纹方向滑入，抗拉拔，常用于抽屉与箱柜',
    threeWay: false,
    insertFrom: 'mortise'
  },
  crossShoulder: {
    type: 'crossShoulder',
    label: '格肩榫',
    desc: '横竖材丁字相交，榫头开肩嵌入横材，桌面枨条与腿足常用',
    threeWay: false,
    insertFrom: 'tenon'
  },
  hugShoulder: {
    type: 'hugShoulder',
    label: '抱肩榫',
    desc: '腿足上端开槽抱夹牙条，束腰家具桌腿与牙板连接',
    threeWay: false,
    insertFrom: 'tenon'
  },
  corner: {
    type: 'corner',
    label: '粽角榫',
    desc: '三根构件在角点三方交汇，外形如粽角，柜体框架顶角专用',
    threeWay: true,
    insertFrom: 'tenon'
  }
}

export const jointInsertAxis = (joint: Joint, members: Member[]): Axis => {
  const refId =
    JOINT_CATALOG[joint.type].insertFrom === 'mortise'
      ? joint.mortiseMemberId
      : joint.tenonMemberId
  const ref = members.find((m) => m.id === refId)
  if (!ref) throw new Error(`节点 ${joint.id} 引用的构件 ${refId} 不存在`)
  return ref.lengthAxis
}

// 两构件轴交点：沿 tenon 构件长度轴取 mortise 构件中心坐标，其余取 tenon 中心
export const axisIntersection = (tenon: Member, mortise: Member): Vec3Tuple => {
  const i = axisIndex(tenon.lengthAxis)
  const at = [...tenon.center] as Vec3Tuple
  at[i] = mortise.center[i]
  return at
}

// 接触面点：榫头构件沿榫轴伸向卯眼构件，取卯眼构件朝向榫头一侧的表面点
// 榫头从该点起向卯眼内部延伸，构件原料箱在该表面恰好贴合、互不重叠
export const contactAt = (tenon: Member, mortise: Member, tenonAxis?: Axis): Vec3Tuple => {
  const axis = tenonAxis ?? tenon.lengthAxis
  const i = axisIndex(axis)
  const dir = Math.sign(mortise.center[i] - tenon.center[i]) || 1
  const at = [...tenon.center] as Vec3Tuple
  at[i] = mortise.center[i] - (dir * mortise.size[i]) / 2
  return at
}

// 新建节点的默认参数
export const defaultJointParams = (tenon: Member, mortise: Member, type: JointType) => {
  const [a, b] = otherAxes(tenon.lengthAxis)
  const ia = axisIndex(a)
  const ib = axisIndex(b)
  const mi = axisIndex(mortise.lengthAxis)
  return {
    tenonLength: Math.round(mortise.size[mi] * 0.9),
    tenonWidth: Math.round(tenon.size[ia] * 0.6),
    tenonThickness: Math.round(tenon.size[ib] * 0.45),
    dovetailTaper: type === 'dovetail' ? 0.12 : undefined,
    shoulderDepth: type === 'crossShoulder' || type === 'hugShoulder' ? 8 : undefined,
    clearance: 0.5
  }
}

// 卯眼有效尺寸 = 榫头尺寸 + 单侧配合间隙（四周放大）
export const effectiveMortiseDims = (joint: Joint): { width: number; thickness: number; length: number } => ({
  width: joint.tenonWidth + joint.clearance * 2,
  thickness: joint.tenonThickness + joint.clearance * 2,
  length: joint.tenonLength + joint.clearance * 2
})

// 参数校验：榫头不得超出构件截面、长度必须为正
export const validateJoint = (joint: Joint, members: Member[]): string[] => {
  const errors: string[] = []
  const tenon = members.find((m) => m.id === joint.tenonMemberId)
  const mortise = members.find((m) => m.id === joint.mortiseMemberId)
  if (!tenon || !mortise) {
    errors.push(`节点 ${joint.name} 引用了已删除的构件`)
    return errors
  }
  const [a, b] = otherAxes(tenon.lengthAxis)
  const ia = axisIndex(a)
  const ib = axisIndex(b)
  if (joint.tenonWidth >= tenon.size[ia]) errors.push(`节点 ${joint.name} 榫宽超过构件 ${tenon.name} 截面`)
  if (joint.tenonThickness >= tenon.size[ib]) errors.push(`节点 ${joint.name} 榫厚超过构件 ${tenon.name} 截面`)
  if (joint.tenonLength <= 0) errors.push(`节点 ${joint.name} 榫长必须大于 0`)
  if (joint.clearance < 0) errors.push(`节点 ${joint.name} 配合间隙不能为负`)
  if (joint.type === 'corner' && !joint.thirdMemberId) errors.push(`粽角榫 ${joint.name} 缺少第三构件`)
  return errors
}

// 节点涉及的全部构件 id
export const jointMemberIds = (joint: Joint): string[] => {
  const ids = [joint.tenonMemberId, joint.mortiseMemberId]
  if (joint.thirdMemberId) ids.push(joint.thirdMemberId)
  return ids
}
