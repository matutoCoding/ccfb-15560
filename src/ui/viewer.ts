// 三维视图：CSG 实体渲染、爆炸动画、剖切（剖面斜线）、干涉标红、可选高亮
import * as THREE from 'three'
import type { Design, InterferenceHit, Member } from '../types'
import { buildMemberGeometry, makeGrainTexture } from '../core/geometry'
import { axisIndex } from '../core/math3d'
import { explodeOffset } from '../core/assembly'
import { memberSolidBoxes } from '../core/solids'
import type { AssemblyStep } from '../types'

const SPECIES_COLOR: Record<string, [string, string]> = {
  walnut: ['#6b4a2f', '#3f2a18'],
  oak: ['#c9a36a', '#8a6536'],
  elm: ['#b98a52', '#7a5427'],
  beech: ['#e0c193', '#a8844f'],
  rosewood: ['#7a3b2e', '#4a1f16'],
  pine: ['#e8d3a8', '#b3935f'],
  mahogany: ['#8e4b3a', '#5a2a1e']
}

export interface ViewerOptions {
  showGrain?: boolean
}

export class DesignViewer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private group = new THREE.Group()
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private meshes = new Map<string, THREE.Mesh>()
  private basePositions = new Map<string, THREE.Vector3>()
  private targetPositions = new Map<string, THREE.Vector3>()
  private design: Design | null = null
  private steps: AssemblyStep[] = []
  private explodeT = 0
  private explodeTarget = 0
  private raf = 0
  private clipPlane: THREE.Plane | null = null
  private clipHelper: THREE.LineSegments | null = null
  private onPick?: (id: string | null) => void
  private grainTextures: THREE.CanvasTexture[] = []
  private showGrain = true
  private frame = 0

  constructor(container: HTMLElement, opts: ViewerOptions = {}) {
    this.showGrain = opts.showGrain ?? true
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.localClippingEnabled = true
    container.append(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 5000)
    this.camera.position.set(620, -760, 560)
    this.camera.lookAt(0, 0, 280)

    this.scene.background = new THREE.Color('#f4f5f7')
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dde5, 1.1)
    const dir = new THREE.DirectionalLight(0xffffff, 1.4)
    dir.position.set(400, -500, 800)
    dir.castShadow = true
    dir.shadow.mapSize.set(2048, 2048)
    dir.shadow.camera.left = -700
    dir.shadow.camera.right = 700
    dir.shadow.camera.top = 700
    dir.shadow.camera.bottom = -700
    this.scene.add(hemi, dir)

    const grid = new THREE.GridHelper(1200, 24, 0xc7ccd4, 0xe3e6eb)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -2
    this.scene.add(grid)
    this.scene.add(this.group)

    this.attachControls(container)
    this.resize(container)
    const ro = new ResizeObserver(() => this.resize(container))
    ro.observe(container)
    this.animate()
  }

  // 简易轨道控制：左键旋转、右键平移、滚轮缩放
  private attachControls(container: HTMLElement) {
    const spherical = new THREE.Spherical().setFromVector3(
      this.camera.position.clone().sub(new THREE.Vector3(0, 0, 280))
    )
    const target = new THREE.Vector3(0, 0, 280)
    let dragging: 'rotate' | 'pan' | null = null
    let lastX = 0
    let lastY = 0

    const down = (e: PointerEvent) => {
      dragging = e.button === 2 ? 'pan' : 'rotate'
      lastX = e.clientX
      lastY = e.clientY
      container.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) {
        this.handleHover(e, container)
        return
      }
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      if (dragging === 'rotate') {
        spherical.theta -= dx * 0.008
        spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.008, 0.15, Math.PI - 0.15)
      } else {
        const panScale = spherical.radius * 0.0012
        target.x -= dx * panScale
        target.y += dy * panScale
      }
      this.camera.position.setFromSpherical(spherical).add(target)
      this.camera.lookAt(target)
    }
    const up = (e: PointerEvent) => {
      if (dragging === 'rotate' && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 4) {
        this.handleClick(e)
      }
      dragging = null
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      spherical.radius = THREE.MathUtils.clamp(spherical.radius * (1 + e.deltaY * 0.001), 120, 3200)
      this.camera.position.setFromSpherical(spherical).add(target)
      this.camera.lookAt(target)
    }
    container.addEventListener('pointerdown', down)
    container.addEventListener('pointermove', move)
    container.addEventListener('pointerup', up)
    container.addEventListener('wheel', wheel, { passive: false })
    container.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  private setPointer(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private handleClick(e: PointerEvent) {
    this.setPointer(e)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false)
    this.onPick?.(hits.length ? (hits[0].object.userData.memberId as string) : null)
  }

  private handleHover(e: PointerEvent, container: HTMLElement) {
    this.setPointer(e)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false)
    container.style.cursor = hits.length ? 'pointer' : 'default'
  }

  setPickHandler(fn: (id: string | null) => void) {
    this.onPick = fn
  }

  private resize(container: HTMLElement) {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // 重建整组实体（构件增删/节点变化时调用）
  load(design: Design, steps: AssemblyStep[]) {
    this.design = design
    this.steps = steps
    this.group.clear()
    this.meshes.clear()
    this.basePositions.clear()
    this.targetPositions.clear()
    this.grainTextures.forEach((t) => t.dispose())
    this.grainTextures = []

    for (const member of design.members) {
      const { geometry } = buildMemberGeometry(member, design.joints, design.members)
      const [base, grainColor] = SPECIES_COLOR[member.species] ?? SPECIES_COLOR.elm
      let map: THREE.CanvasTexture | null = null
      if (this.showGrain) {
        map = makeGrainTexture(base, grainColor, member.id.length)
        map.center.set(0.5, 0.5)
        map.rotation = member.grain === member.lengthAxis ? 0 : Math.PI / 2
        this.grainTextures.push(map)
      }
      const material = new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : new THREE.Color(base),
        map,
        roughness: 0.72,
        metalness: 0.02,
        clippingPlanes: this.clipPlane ? [this.clipPlane] : []
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.memberId = member.id
      this.group.add(mesh)
      this.meshes.set(member.id, mesh)
      this.basePositions.set(member.id, new THREE.Vector3(...member.center))
      this.targetPositions.set(member.id, new THREE.Vector3(...member.center))
    }
    this.applyExplodeTargets()
  }

  setHighlight(memberId: string | null) {
    for (const [id, mesh] of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissive.set(id === memberId ? '#2f6fed' : '#000000')
      mat.emissiveIntensity = id === memberId ? 0.28 : 0
    }
  }

  setInterferenceHits(hits: InterferenceHit[]) {
    const involved = new Set(hits.flatMap((h) => [h.memberA, h.memberB]))
    for (const [id, mesh] of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (involved.has(id)) {
        mat.emissive.set('#d92d20')
        mat.emissiveIntensity = 0.55
      } else if (!mat.emissive.getHexString().startsWith('2f6fed')) {
        mat.emissiveIntensity = 0
      }
    }
  }

  // 爆炸目标位置：按装配步骤反推的抽出方向偏移
  private applyExplodeTargets() {
    if (!this.design) return
    const solids = new Map(
      this.design.members.map((m) => [m.id, memberSolidBoxes(m, this.design!.joints, this.design!.members)])
    )
    for (const step of this.steps) {
      const offset = explodeOffset(
        step.memberId,
        step.insertAxis,
        -step.insertSign as 1 | -1,
        solids,
        this.design.settings.explodeGap
      )
      const base = this.basePositions.get(step.memberId)
      const target = this.targetPositions.get(step.memberId)
      if (base && target) target.copy(base).add(new THREE.Vector3(...offset).multiplyScalar(this.explodeTarget))
    }
  }

  // t: 0 归位，1 完全爆炸；内部做缓动
  setExplode(t: number) {
    this.explodeTarget = t
    this.applyExplodeTargets()
  }

  // 单步定位：只爆炸到第 step 序号（装配推演用）
  setStepProgress(progress: number) {
    this.explodeTarget = 1
    this.applyExplodeTargets()
    if (!this.design) return
    const solids = new Map(
      this.design.members.map((m) => [m.id, memberSolidBoxes(m, this.design!.joints, this.design!.members)])
    )
    for (const step of this.steps) {
      const full = explodeOffset(
        step.memberId,
        step.insertAxis,
        -step.insertSign as 1 | -1,
        solids,
        this.design.settings.explodeGap
      )
      // 序号越靠后的装配步骤，越早处于爆炸态
      const local = THREE.MathUtils.clamp(progress * (this.steps.length + 1) - (step.order - 1), 0, 1)
      const base = this.basePositions.get(step.memberId)!
      this.targetPositions.get(step.memberId)!.copy(base).add(new THREE.Vector3(...full).multiplyScalar(local))
    }
  }

  // 剖切平面：axis 固定 + 世界坐标 depth，剖面用斜线填充 helper 表达
  setClipPlane(axis: 'x' | 'y' | 'z' | null, depth = 0) {
    if (axis === null) {
      this.clipPlane = null
      this.clipHelper?.removeFromParent()
      this.clipHelper = null
      for (const mesh of this.meshes.values()) {
        ;(mesh.material as THREE.MeshStandardMaterial).clippingPlanes = []
      }
      return
    }
    const normal = new THREE.Vector3()
    normal.setComponent(axisIndex(axis), 1)
    this.clipPlane = new THREE.Plane(normal, -depth)
    for (const mesh of this.meshes.values()) {
      ;(mesh.material as THREE.MeshStandardMaterial).clippingPlanes = [this.clipPlane]
    }
    this.updateClipHelper(axis, depth)
  }

  private updateClipHelper(axis: 'x' | 'y' | 'z', depth: number) {
    this.clipHelper?.removeFromParent()
    if (!this.design) return
    // 剖面斜线：在剖切平面上铺一组对角线段
    const points: THREE.Vector3[] = []
    const span = 500
    const i = axisIndex(axis)
    const axes = ([0, 1, 2] as const).filter((k) => k !== i)
    for (let s = -span; s <= span; s += 40) {
      const a = new THREE.Vector3()
      const b = new THREE.Vector3()
      a.setComponent(i, depth + 0.5)
      b.setComponent(i, depth + 0.5)
      a.setComponent(axes[0], s)
      a.setComponent(axes[1], -span)
      b.setComponent(axes[0], s + span)
      b.setComponent(axes[1], span)
      points.push(a, b)
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineBasicMaterial({ color: 0x475467, transparent: true, opacity: 0.6 })
    this.clipHelper = new THREE.LineSegments(geo, mat)
    this.scene.add(this.clipHelper)
  }

  // 导出当前帧 PNG dataURL
  captureDataURL(size = 1400): string {
    const prev = this.renderer.getSize(new THREE.Vector2())
    this.renderer.setSize(size, size * 0.72, false)
    this.camera.aspect = 1 / 0.72
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    const url = this.renderer.domElement.toDataURL('image/png')
    this.renderer.setSize(prev.x, prev.y, false)
    this.camera.aspect = prev.x / prev.y
    this.camera.updateProjectionMatrix()
    return url
  }

  // 线框风格截图（说明书用）：临时切换材质为深色线框
  captureLineArt(size = 1400): string {
    const prevMaterials = new Map<THREE.Mesh, THREE.Material>()
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true })
    for (const mesh of this.meshes.values()) {
      prevMaterials.set(mesh, mesh.material as THREE.Material)
      mesh.material = lineMat
    }
    this.scene.background = new THREE.Color('#ffffff')
    const url = this.captureDataURL(size)
    for (const [mesh, mat] of prevMaterials) mesh.material = mat
    this.scene.background = new THREE.Color('#f4f5f7')
    return url
  }

  fitView() {
    if (!this.design || this.design.members.length === 0) return
    const box = new THREE.Box3()
    for (const mesh of this.meshes.values()) box.expandByObject(mesh)
    const center = box.getCenter(new THREE.Vector3())
    this.camera.lookAt(center)
  }

  members(): Member[] {
    return this.design?.members ?? []
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate)
    // 爆炸缓动
    let moving = false
    for (const [id, target] of this.targetPositions) {
      const mesh = this.meshes.get(id)
      if (!mesh) continue
      mesh.position.lerp(target, 0.14)
      if (mesh.position.distanceTo(target) > 0.5) moving = true
    }
    this.explodeT += (this.explodeTarget - this.explodeT) * 0.14
    this.frame++
    this.renderer.render(this.scene, this.camera)
    void moving
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
