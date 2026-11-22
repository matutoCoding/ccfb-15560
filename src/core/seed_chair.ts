// 内置款式：明式圈椅。靠背顶角用粽角榫三构件交汇，座框格肩，腿足管脚枨
import type { Design, Joint, Member, Vec3Tuple, WoodSpecies } from '../types'
import { uid } from '../core/math3d'
import { contactAt } from '../core/joints'

const m = (
  id: string,
  name: string,
  size: Vec3Tuple,
  center: Vec3Tuple,
  lengthAxis: Member['lengthAxis'],
  species: WoodSpecies = 'elm',
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

export const buildCircleChair = (): Design => {
  const members: Member[] = [
    // 四腿
    m('leg_fl', '前左腿', [40, 40, 420], [-190, -180, 210], 'z', 'elm'),
    m('leg_fr', '前右腿', [40, 40, 420], [190, -180, 210], 'z', 'elm'),
    m('leg_bl', '后左腿', [40, 40, 420], [-190, 180, 210], 'z', 'elm'),
    m('leg_br', '后右腿', [40, 40, 420], [190, 180, 210], 'z', 'elm'),
    // 座框四面
    m('seat_rail_f', '前座框', [340, 30, 40], [0, -180, 400], 'x'),
    m('seat_rail_b', '后座框', [340, 30, 40], [0, 180, 400], 'x'),
    m('seat_rail_l', '左座框', [30, 320, 40], [-190, 0, 400], 'y'),
    m('seat_rail_r', '右座框', [30, 320, 40], [190, 0, 400], 'y'),
    // 座面板（嵌入框内，四周留 1mm 工艺缝）
    m('seat_panel', '座面板', [338, 318, 20], [0, 0, 400], 'x', 'beech'),
    // 后腿延伸的靠背立材
    m('post_l', '左靠背立材', [35, 35, 250], [-190, 180, 545], 'z'),
    m('post_r', '右靠背立材', [35, 35, 250], [190, 180, 545], 'z'),
    // 圈扶手：前端面贴前腿后表面，后端面到立材前表面
    m('arm_l', '左圈扶手', [35, 327.5, 35], [-190, -16.25, 645], 'y', 'elm'),
    m('arm_r', '右圈扶手', [35, 327.5, 35], [190, -16.25, 645], 'y', 'elm'),
    // 靠背顶材：架在两立材内表面之间，位于扶手之上，无实体重叠
    m('crest', '靠背顶材', [345, 35, 35], [0, 180, 690], 'x', 'elm'),
    // 管脚枨
    m('stretch_f', '前管脚枨', [340, 25, 25], [0, -180, 120], 'x'),
    m('stretch_b', '后管脚枨', [340, 25, 25], [0, 180, 120], 'x'),
    m('stretch_l', '左脚管枨', [25, 320, 25], [-190, 0, 120], 'y'),
    m('stretch_r', '右脚管枨', [25, 320, 25], [190, 0, 120], 'y')
  ]
  const byId = Object.fromEntries(members.map((x) => [x.id, x]))

  const joints: Joint[] = [
    // 座框格肩入腿
    joint('crossShoulder', '前座框-前左腿', 'seat_rail_f', 'leg_fl', contactAt(byId.seat_rail_f, byId.leg_fl), { len: 35, w: 22, t: 26 }),
    joint('crossShoulder', '前座框-前右腿', 'seat_rail_f', 'leg_fr', contactAt(byId.seat_rail_f, byId.leg_fr), { len: 35, w: 22, t: 26 }),
    joint('crossShoulder', '后座框-后左腿', 'seat_rail_b', 'leg_bl', contactAt(byId.seat_rail_b, byId.leg_bl), { len: 35, w: 22, t: 26 }),
    joint('crossShoulder', '后座框-后右腿', 'seat_rail_b', 'leg_br', contactAt(byId.seat_rail_b, byId.leg_br), { len: 35, w: 22, t: 26 }),
    joint('crossShoulder', '左座框-前左腿', 'seat_rail_l', 'leg_fl', contactAt(byId.seat_rail_l, byId.leg_fl), { len: 35, w: 20, t: 26 }),
    joint('crossShoulder', '左座框-后左腿', 'seat_rail_l', 'leg_bl', contactAt(byId.seat_rail_l, byId.leg_bl), { len: 35, w: 20, t: 26 }),
    joint('crossShoulder', '右座框-前右腿', 'seat_rail_r', 'leg_fr', contactAt(byId.seat_rail_r, byId.leg_fr), { len: 35, w: 20, t: 26 }),
    joint('crossShoulder', '右座框-后右腿', 'seat_rail_r', 'leg_br', contactAt(byId.seat_rail_r, byId.leg_br), { len: 35, w: 20, t: 26 }),
    // 管脚枨格肩
    joint('crossShoulder', '前管脚-前左腿', 'stretch_f', 'leg_fl', contactAt(byId.stretch_f, byId.leg_fl), { len: 35, w: 18, t: 18 }),
    joint('crossShoulder', '前管脚-前右腿', 'stretch_f', 'leg_fr', contactAt(byId.stretch_f, byId.leg_fr), { len: 35, w: 18, t: 18 }),
    joint('crossShoulder', '后管脚-后左腿', 'stretch_b', 'leg_bl', contactAt(byId.stretch_b, byId.leg_bl), { len: 35, w: 18, t: 18 }),
    joint('crossShoulder', '后管脚-后右腿', 'stretch_b', 'leg_br', contactAt(byId.stretch_b, byId.leg_br), { len: 35, w: 18, t: 18 }),
    joint('crossShoulder', '左脚管-前左腿', 'stretch_l', 'leg_fl', contactAt(byId.stretch_l, byId.leg_fl), { len: 35, w: 16, t: 18 }),
    joint('crossShoulder', '左脚管-后左腿', 'stretch_l', 'leg_bl', contactAt(byId.stretch_l, byId.leg_bl), { len: 35, w: 16, t: 18 }),
    joint('crossShoulder', '右脚管-前右腿', 'stretch_r', 'leg_fr', contactAt(byId.stretch_r, byId.leg_fr), { len: 35, w: 16, t: 18 }),
    joint('crossShoulder', '右脚管-后右腿', 'stretch_r', 'leg_br', contactAt(byId.stretch_r, byId.leg_br), { len: 35, w: 16, t: 18 }),
    // 扶手前端抱肩入前腿
    joint('hugShoulder', '左扶手-前左腿', 'arm_l', 'leg_fl', contactAt(byId.arm_l, byId.leg_fl), { len: 35, w: 24, t: 24 }, 0.5, { shoulderDepth: 8 }),
    joint('hugShoulder', '右扶手-前右腿', 'arm_r', 'leg_fr', contactAt(byId.arm_r, byId.leg_fr), { len: 35, w: 24, t: 24 }, 0.5, { shoulderDepth: 8 }),
    // 靠背立材格肩接后腿
    joint('crossShoulder', '左立材-后左腿', 'post_l', 'leg_bl', contactAt(byId.post_l, byId.leg_bl), { len: 32, w: 24, t: 24 }),
    joint('crossShoulder', '右立材-后右腿', 'post_r', 'leg_br', contactAt(byId.post_r, byId.leg_br), { len: 32, w: 24, t: 24 }),
    // 顶角粽角榫：顶材竖销向下入立材，扶手横销向后入立材，立材为主卯
    joint('corner', '左顶粽角-顶材', 'crest', 'post_l', [-190, 180, 672.5], { len: 30, w: 22, t: 22 }, 0.5, { tenonAxis: 'z', thirdMemberId: 'arm_l' }),
    joint('corner', '右顶粽角-顶材', 'crest', 'post_r', [190, 180, 672.5], { len: 30, w: 22, t: 22 }, 0.5, { tenonAxis: 'z', thirdMemberId: 'arm_r' }),
    joint('corner', '左顶粽角-扶手', 'arm_l', 'post_l', [-190, 162.5, 645], { len: 30, w: 22, t: 22 }, 0.5, { thirdMemberId: 'crest' }),
    joint('corner', '右顶粽角-扶手', 'arm_r', 'post_r', [190, 162.5, 645], { len: 30, w: 22, t: 22 }, 0.5, { thirdMemberId: 'crest' }),
    // 座面板燕尾滑入前座框：榫轴沿座面长度 x，顺前座框通透卯眼滑装
    joint('dovetail', '座面燕尾槽', 'seat_panel', 'seat_rail_f', [0, -165, 400], { len: 14, w: 240, t: 14 }, 0.4, { tenonAxis: 'x', dovetailTaper: 0.12 })
  ]

  return {
    id: uid('design'),
    name: '明式圈椅',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    members,
    joints,
    settings: { defaultClearance: 0.5, explodeGap: 60, interferenceTolerance: 0.8 }
  }
}
