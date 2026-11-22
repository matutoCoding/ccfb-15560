// 全局状态：发布订阅 store，款式 CRUD、当前款式编辑、自动求解/干涉联动
import type { Design, DesignBundle, InterferenceReport, Joint, Member } from '../types'
import { db } from '../data/db'
import { uid } from '../core/math3d'
import { buildCircleChair } from '../core/seed_chair'
import { buildSquareTable } from '../core/seed_table'
import { checkInterference, createInterferenceCache, type InterferenceCache } from '../core/interference'
import { planAssembly, type PlanOptions } from '../core/assembly'
import type { AssemblyPlan } from '../types'

export type PageKey = 'designs' | 'members' | 'joints' | 'assembly' | 'manual' | 'settings'

interface AppState {
  designs: Design[]
  currentId: string | null
  page: PageKey
  plan: AssemblyPlan | null
  interference: InterferenceReport | null
  selectedMemberId: string | null
  selectedJointId: string | null
  booted: boolean
}

type Listener = (state: AppState) => void

const interferenceCaches = new Map<string, InterferenceCache>()

class Store {
  private state: AppState = {
    designs: [],
    currentId: null,
    page: 'designs',
    plan: null,
    interference: null,
    selectedMemberId: null,
    selectedJointId: null,
    booted: false
  }
  private listeners = new Set<Listener>()

  get = (): AppState => this.state

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const fn of this.listeners) fn(this.state)
  }

  private patch(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial }
    this.emit()
  }

  // 首次启动：无数据则自动生成圈椅与方桌
  async boot() {
    if (this.state.booted) return
    let designs = await db.all()
    if (designs.length === 0) {
      designs = [buildCircleChair(), buildSquareTable()]
      for (const d of designs) await db.put(d)
    }
    const currentId = designs[0]?.id ?? null
    this.patch({ designs, currentId, booted: true })
    if (currentId) this.recompute(currentId, {})
  }

  get current(): Design | null {
    return this.state.designs.find((d) => d.id === this.state.currentId) ?? null
  }

  navigate = (page: PageKey) => this.patch({ page })

  selectDesign = async (id: string) => {
    this.patch({ currentId: id, selectedMemberId: null, selectedJointId: null })
    this.recompute(id, {})
  }

  selectMember = (id: string | null) => this.patch({ selectedMemberId: id })
  selectJoint = (id: string | null) => this.patch({ selectedJointId: id })

  // ---- 款式级 CRUD ----
  async createDesign(name: string): Promise<Design> {
    const design: Design = {
      id: uid('design'),
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      members: [],
      joints: [],
      settings: { defaultClearance: 0.5, explodeGap: 60, interferenceTolerance: 0.8 }
    }
    await db.put(design)
    this.patch({ designs: [...this.state.designs, design], currentId: design.id })
    return design
  }

  async duplicateDesign(id: string): Promise<Design | null> {
    const src = this.state.designs.find((d) => d.id === id)
    if (!src) return null
    const copy: Design = structuredClone(src)
    copy.id = uid('design')
    copy.name = `${src.name} 副本`
    copy.createdAt = Date.now()
    copy.updatedAt = Date.now()
    await db.put(copy)
    this.patch({ designs: [...this.state.designs, copy] })
    return copy
  }

  async deleteDesign(id: string) {
    await db.remove(id)
    interferenceCaches.delete(id)
    const designs = this.state.designs.filter((d) => d.id !== id)
    const currentId = this.state.currentId === id ? designs[0]?.id ?? null : this.state.currentId
    this.patch({ designs, currentId })
    if (currentId) this.recompute(currentId, {})
  }

  async renameDesign(id: string, name: string) {
    const design = this.state.designs.find((d) => d.id === id)
    if (!design) return
    design.name = name
    design.updatedAt = Date.now()
    await db.put(design)
    this.patch({ designs: [...this.state.designs] })
  }

  // ---- 构件 / 节点编辑（直接改当前款式，统一持久化+重算）----
  async mutateCurrent(mutator: (d: Design) => void) {
    const design = this.current
    if (!design) return
    mutator(design)
    design.updatedAt = Date.now()
    await db.put(design)
    this.patch({ designs: [...this.state.designs] })
    this.recompute(design.id, {})
  }

  addMember = (member: Member) =>
    this.mutateCurrent((d) => void d.members.push(member))

  updateMember = (id: string, patch: Partial<Member>) =>
    this.mutateCurrent((d) => {
      const m = d.members.find((x) => x.id === id)
      if (m) Object.assign(m, patch)
    })

  removeMember = (id: string) =>
    this.mutateCurrent((d) => {
      d.members = d.members.filter((m) => m.id !== id)
      // 连带清理引用该构件的节点
      d.joints = d.joints.filter((j) =>
        j.tenonMemberId !== id && j.mortiseMemberId !== id && j.thirdMemberId !== id)
    })

  addJoint = (joint: Joint) =>
    this.mutateCurrent((d) => void d.joints.push(joint))

  updateJoint = (id: string, patch: Partial<Joint>) =>
    this.mutateCurrent((d) => {
      const j = d.joints.find((x) => x.id === id)
      if (j) Object.assign(j, patch)
    })

  removeJoint = (id: string) =>
    this.mutateCurrent((d) => {
      d.joints = d.joints.filter((j) => j.id !== id)
    })

  setManualOrder = (order: string[] | undefined) =>
    this.mutateCurrent((d) => {
      d.manualOrder = order
    })

  updateSettings = (patch: Partial<Design['settings']>) =>
    this.mutateCurrent((d) => Object.assign(d.settings, patch))

  // 装配计划 + 干涉统一重算；干涉走构件级增量缓存
  recompute(designId: string, planOpts: PlanOptions) {
    const design = this.state.designs.find((d) => d.id === designId)
    if (!design) {
      this.patch({ plan: null, interference: null })
      return
    }
    const plan = planAssembly(design, planOpts)
    if (!interferenceCaches.has(designId)) interferenceCaches.set(designId, createInterferenceCache())
    const interference = checkInterference(design, interferenceCaches.get(designId))
    this.patch({ plan, interference })
  }

  recomputeWithManual = () => {
    const design = this.current
    if (design) this.recompute(design.id, { respectManual: true })
  }

  // ---- 打包导出 / 导入 ----
  async exportBundle(ids?: string[]): Promise<DesignBundle> {
    const designs = ids
      ? this.state.designs.filter((d) => ids.includes(d.id))
      : this.state.designs
    return {
      format: 'mortise-tenon-bundle',
      version: 1,
      exportedAt: Date.now(),
      designs: structuredClone(designs)
    }
  }

  async importBundle(bundle: DesignBundle): Promise<number> {
    if (bundle.format !== 'mortise-tenon-bundle') {
      throw new Error('文件格式不是榫卯工作台款式包')
    }
    let count = 0
    for (const src of bundle.designs) {
      const copy: Design = structuredClone(src)
      copy.id = uid('design')
      copy.updatedAt = Date.now()
      await db.put(copy)
      count++
      this.state.designs.push(copy)
    }
    this.patch({ designs: [...this.state.designs] })
    return count
  }
}

export const store = new Store()
