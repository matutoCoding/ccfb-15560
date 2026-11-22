// 全局类型定义：款式 / 构件 / 榫卯节点

export type Axis = 'x' | 'y' | 'z'
export type Sign = 1 | -1
export type Vec3Tuple = [number, number, number]

export type JointType = 'dovetail' | 'crossShoulder' | 'hugShoulder' | 'corner'

export type WoodSpecies =
  | 'walnut'
  | 'oak'
  | 'elm'
  | 'beech'
  | 'rosewood'
  | 'pine'
  | 'mahogany'

// 木纹沿构件本地哪个轴向延展
export type GrainDir = Axis

// 构件：沿 lengthAxis 延展的方木，截面取另外两轴尺寸
export interface Member {
  id: string
  name: string
  // 截面尺寸（垂直 lengthAxis 的两个方向，按世界轴顺序书写）
  size: Vec3Tuple
  lengthAxis: Axis
  // 构件中心在世界坐标中的位置
  center: Vec3Tuple
  species: WoodSpecies
  grain: GrainDir
  note?: string
}

// 榫卯节点参数（榫头侧与卯眼侧联动由 joint 模块负责）
export interface Joint {
  id: string
  name: string
  type: JointType
  // 构件 A 出榫头，构件 B 开卯眼；corner 节点可为三构件
  tenonMemberId: string
  mortiseMemberId: string
  thirdMemberId?: string
  // 节点中心（世界坐标），一般为两构件轴交点
  at: Vec3Tuple
  // 榫头伸出方向，默认取榫头构件长度轴；燕尾榫等可取其横向轴
  tenonAxis?: Axis
  // 榫头长度（沿插入方向）
  tenonLength: number
  // 榫头截面宽度（第一横向轴）
  tenonWidth: number
  // 榫头截面厚度（第二横向轴）
  tenonThickness: number
  // 燕尾收分（dovetail 用，大头相对小头每侧扩出的比例）
  dovetailTaper?: number
  // 格肩/抱肩的肩部包覆深度
  shoulderDepth?: number
  // 配合间隙（mm），卯眼在榫头基础上四周放大的量，可单独设
  clearance: number
  // 人为停用某个卯眼（需求 9 的故障注入：停用后装配求解应报锁死/干涉）
  mortiseDisabled?: boolean
  note?: string
}

export interface DesignSettings {
  // 统一配合间隙默认值
  defaultClearance: number
  // 爆炸图间距系数
  explodeGap: number
  // 干涉判定阈值（mm），小于该值的穿透视为可接受
  interferenceTolerance: number
}

export interface Design {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  members: Member[]
  joints: Joint[]
  settings: DesignSettings
  // 用户手动调整过的装配顺序（member id 序列）
  manualOrder?: string[]
}

// 装配求解结果
export interface AssemblyStep {
  order: number
  memberId: string
  // 该构件的插入方向（世界轴 + 符号），爆炸方向与之相反
  insertAxis: Axis
  insertSign: Sign
  // 插入路径上阻挡的已装构件（空表示首件或无阻挡）
  blockers: string[]
}

export interface LockReport {
  locked: boolean
  // 互相锁死的构件 id 集合
  memberIds: string[]
  // 每个构件在六方向上被谁挡住，便于 UI 展示
  reasons: Record<string, { axis: Axis; sign: Sign; blockerIds: string[] }[]>
  // 因卯眼停用等配置问题导致无法装配的节点提示
  configErrors: string[]
}

export interface AssemblyPlan {
  steps: AssemblyStep[]
  lock: LockReport | null
  // 用户手动调整过的顺序（member id 序列），存在款式里
  manualOrder?: string[]
}

// 干涉检查结果（单对构件）
export interface InterferenceHit {
  memberA: string
  memberB: string
  // 穿透深度（mm），取交叠体最短轴厚度
  depth: number
  // 交叠区域中心，供标红定位
  center: Vec3Tuple
  // 交叠包围盒
  box: { min: Vec3Tuple; max: Vec3Tuple }
}

export interface InterferenceReport {
  hits: InterferenceHit[]
  elapsedMs: number
}

// 导出的款式包
export interface DesignBundle {
  format: 'mortise-tenon-bundle'
  version: 1
  exportedAt: number
  designs: Design[]
}
