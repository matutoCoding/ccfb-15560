// 共享三维视图宿主：跨页面复用同一个 viewer 实例，按当前款式自动装载
import type { DesignViewer } from '../viewer'
import { store } from '../../data/store'

let viewer: DesignViewer | null = null
let loadedDesignId: string | null = null
let loadedSignature = ''
let initPromise: Promise<DesignViewer> | null = null

export const mountViewer = async (container: HTMLElement): Promise<DesignViewer | null> => {
  if (!initPromise) {
    initPromise = import('../viewer').then(({ DesignViewer }) => {
      viewer = new DesignViewer(container)
      viewer.setPickHandler((id) => store.selectMember(id))
      return viewer
    }).catch((e) => {
      initPromise = null
      container.innerHTML = ''
      const fallback = document.createElement('div')
      fallback.className = 'empty-state'
      fallback.style.height = '100%'
      fallback.innerHTML =
        '<div class="title">三维视图初始化失败</div><div>当前浏览器无法创建 WebGL 上下文，请检查显卡加速设置后刷新。</div>'
      container.append(fallback)
      throw e
    })
  }
  try {
    const v = await initPromise
    if (!container.contains(v.renderer.domElement)) container.append(v.renderer.domElement)
    syncViewer()
    return v
  } catch {
    return null
  }
}

// 款式内容变化后重新装载；仅选择变化时不重建
export const syncViewer = (): void => {
  if (!viewer) return
  const design = store.current
  const state = store.get()
  if (!design) return
  const signature = JSON.stringify({
    m: design.members.map((m) => [m.id, m.size, m.center, m.lengthAxis, m.species, m.grain]),
    j: design.joints.map((j) => [j.id, j.tenonWidth, j.tenonThickness, j.tenonLength, j.clearance, j.mortiseDisabled, j.type])
  })
  if (loadedDesignId !== design.id || signature !== loadedSignature) {
    viewer.load(design, state.plan?.steps ?? [])
    loadedDesignId = design.id
    loadedSignature = signature
  }
  viewer.setHighlight(state.selectedMemberId)
  if (state.interference) viewer.setInterferenceHits(state.interference.hits)
}

export const getViewer = (): DesignViewer | null => viewer

export const resetViewerTracking = (): void => {
  loadedDesignId = null
  loadedSignature = ''
}
