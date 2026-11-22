// 内置款式：带抽屉方桌。构件原料箱表面恰好贴合，榫头从接触面伸入卯眼
import type { Design, Joint, Member, Vec3Tuple, WoodSpecies } from '../types'
import { uid } from '../core/math3d'
import { contactAt } from '../core/joints'

const m = (
  id: string,
  name: string,
  size: Vec3Tuple,
  center: Vec3Tuple,
  lengthAxis: Member['lengthAxis'],
  species: WoodSpecies = 'walnut',
  grain: Member['grain'] = lengthAxis
): Member => ({ id, name, size, center, lengthAxis, species, grain })

const joint = (
  type: Joint['type'],
  name: string,
  tenonId: string,
  mortiseId: string,
  at: Vec3Tuple,
  dims: { len: number; w: number; t: number },
  clearance = 0.5,
  extra: Partial<Joint> = {}
): Joint => ({
  id: uid('j'),
  name,
  type,
  tenonMemberId: tenonId,
  mortiseMemberId: mortiseId,
  at,
  tenonLength: dims.len,
  tenonWidth: dims.w,
  tenonThickness: dims.t,
  clearance,
  ...extra
})

export const buildSquareTable = (): Design => {
  const members: Member[] = [
    // 四条腿，顶面 z=435 与桌面底面贴合
    m('leg_fl', '前左腿', [45, 45, 435], [-200, -200, 217.5], 'z'),
    m('leg_fr', '前右腿', [45, 45, 435], [200, -200, 217.5], 'z'),
    m('leg_bl', '后左腿', [45, 45, 435], [-200, 200, 217.5], 'z'),
    m('leg_br', '后右腿', [45, 45, 435], [200, 200, 217.5], 'z'),
    // 四条牙板，长 355 正好架在腿内侧表面之间
    m('apron_f', '前牙板', [355, 30, 70], [0, -200, 345], 'x'),
    m('apron_b', '后牙板', [355, 30, 70], [0, 200, 345], 'x'),
    m('apron_l', '左牙板', [30, 355, 70], [-200, 0, 345], 'y'),
    m('apron_r', '右牙板', [30, 355, 70], [200, 0, 345], 'y'),
    // 桌面，底面 z=435
    m('top', '桌面', [480, 480, 30], [0, 0, 450], 'x', 'elm', 'x'),
    // 前下档（抽屉下沿）
    m('rail_low', '前下档', [355, 25, 35], [0, -200, 180], 'x'),
    // 抽屉五件套：面/尾板宽度嵌在两侧板之间，燕尾销沿侧板长度轴滑装
    m('drawer_front', '抽屉面', [265, 18, 90], [0, -150, 260], 'x', 'beech'),
    m('drawer_back', '抽屉尾板', [265, 15, 80], [0, -40, 260], 'x', 'beech'),
    m('drawer_sl', '抽屉左侧板', [15, 102, 80], [-140, -99, 260], 'y', 'beech'),
    m('drawer_sr', '抽屉右侧板', [15, 102, 80], [140, -99, 260], 'y', 'beech'),
    m('drawer_bottom', '抽屉底板', [260, 80, 10], [0, -95, 212], 'y', 'pine', 'y')
  ]
  const byId = Object.fromEntries(members.map((x) => [x.id, x]))

  const joints: Joint[] = [
    // 牙板抱肩入腿；前左顶角改用粽角榫三构件交汇
    // 前左粽角：前牙板出榫，前左腿为主卯，左牙板为第三构件
    joint('corner', '前左顶粽角', 'apron_f', 'leg_fl', [-177.5, -200, 345], { len: 40, w: 22, t: 40 }, 0.5, { thirdMemberId: 'apron_l' }),
    joint('hugShoulder', '前牙板-前右腿', 'apron_f', 'leg_fr', contactAt(byId.apron_f, byId.leg_fr), { len: 40, w: 26, t: 40 }, 0.5, { shoulderDepth: 8 }),
    joint('hugShoulder', '后牙板-后左腿', 'apron_b', 'leg_bl', contactAt(byId.apron_b, byId.leg_bl), { len: 40, w: 26, t: 40 }, 0.5, { shoulderDepth: 8 }),
    joint('hugShoulder', '后牙板-后右腿', 'apron_b', 'leg_br', contactAt(byId.apron_b, byId.leg_br), { len: 40, w: 26, t: 40 }, 0.5, { shoulderDepth: 8 }),
    // 侧牙板格肩入腿
    joint('crossShoulder', '左牙板-后左腿', 'apron_l', 'leg_bl', contactAt(byId.apron_l, byId.leg_bl), { len: 40, w: 20, t: 40 }),
    joint('crossShoulder', '右牙板-前右腿', 'apron_r', 'leg_fr', contactAt(byId.apron_r, byId.leg_fr), { len: 40, w: 20, t: 40 }),
    joint('crossShoulder', '右牙板-后右腿', 'apron_r', 'leg_br', contactAt(byId.apron_r, byId.leg_br), { len: 40, w: 20, t: 40 }),
    // 桌面四方格肩销入腿顶（榫轴 z，向下伸入腿）
    joint('crossShoulder', '桌面-前左腿', 'top', 'leg_fl', [-200, -200, 435], { len: 25, w: 25, t: 25 }, 0.5, { tenonAxis: 'z' }),
    joint('crossShoulder', '桌面-前右腿', 'top', 'leg_fr', [200, -200, 435], { len: 25, w: 25, t: 25 }, 0.5, { tenonAxis: 'z' }),
    joint('crossShoulder', '桌面-后左腿', 'top', 'leg_bl', [-200, 200, 435], { len: 25, w: 25, t: 25 }, 0.5, { tenonAxis: 'z' }),
    joint('crossShoulder', '桌面-后右腿', 'top', 'leg_br', [200, 200, 435], { len: 25, w: 25, t: 25 }, 0.5, { tenonAxis: 'z' }),
    // 前下档格肩
    joint('crossShoulder', '前下档-前左腿', 'rail_low', 'leg_fl', contactAt(byId.rail_low, byId.leg_fl), { len: 40, w: 18, t: 22 }),
    joint('crossShoulder', '前下档-前右腿', 'rail_low', 'leg_fr', contactAt(byId.rail_low, byId.leg_fr), { len: 40, w: 18, t: 22 }),
    // 抽屉燕尾：销子沿侧板长度轴 y 插入抽屉面/尾板
    joint('dovetail', '左燕尾-抽屉面', 'drawer_sl', 'drawer_front', [-140, -159, 260], { len: 15, w: 10, t: 55 }, 0.4, { dovetailTaper: 0.12 }),
    joint('dovetail', '右燕尾-抽屉面', 'drawer_sr', 'drawer_front', [140, -159, 260], { len: 15, w: 10, t: 55 }, 0.4, { dovetailTaper: 0.12 }),
    joint('dovetail', '左燕尾-抽屉尾板', 'drawer_sl', 'drawer_back', [-140, -47.5, 260], { len: 15, w: 10, t: 50 }, 0.4, { dovetailTaper: 0.12 }),
    joint('dovetail', '右燕尾-抽屉尾板', 'drawer_sr', 'drawer_back', [140, -47.5, 260], { len: 15, w: 10, t: 50 }, 0.4, { dovetailTaper: 0.12 })
  ]

  return {
    id: uid('design'),
    name: '带抽屉方桌',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    members,
    joints,
    settings: { defaultClearance: 0.5, explodeGap: 60, interferenceTolerance: 0.8 }
  }
}
