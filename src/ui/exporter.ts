// 说明书导出：jsPDF 出 PDF，JSZip 打包一组 PNG；款式包走 JSON
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import type { Design, DesignBundle, AssemblyStep } from '../types'
import type { DesignViewer } from '../ui/viewer'

const nameOf = (d: Design, id: string): string =>
  d.members.find((m) => m.id === id)?.name ?? id

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const safeName = (s: string): string => s.replace(/[\\/:*?"<>|\s]+/g, '_')

interface PageShot {
  step: AssemblyStep | null
  dataUrl: string
  caption: string
}

// 逐步骤截图：先全部归位，再按装配进度逐帧拍
const collectShots = async (viewer: DesignViewer, design: Design, steps: AssemblyStep[]): Promise<PageShot[]> => {
  const shots: PageShot[] = []
  viewer.setExplode(0)
  await wait(350)
  shots.push({ step: null, dataUrl: viewer.captureLineArt(), caption: '总装线稿' })
  for (let i = 0; i <= steps.length; i++) {
    viewer.setStepProgress(i / steps.length)
    await wait(260)
    const step = steps[Math.min(i, steps.length - 1)]
    shots.push({
      step: i === 0 ? null : step,
      dataUrl: viewer.captureLineArt(),
      caption: i === 0 ? '零件散件' : `第 ${i} 步：安装 ${nameOf(design, step.memberId)}（沿 ${step.insertAxis.toUpperCase()} 轴${step.insertSign > 0 ? '正向' : '反向'}插入）`
    })
  }
  viewer.setStepProgress(0)
  viewer.setExplode(0)
  return shots
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// 零件表数据
const partTable = (design: Design): string[][] =>
  design.members.map((m, i) => [
    String(i + 1),
    m.name,
    `${m.size[0]}×${m.size[1]}×${m.size[2]}`,
    m.species,
    m.grain.toUpperCase()
  ])

export const exportManualPdf = async (viewer: DesignViewer, design: Design, steps: AssemblyStep[]) => {
  const shots = await collectShots(viewer, design, steps)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const margin = 14

  // 封面
  pdf.setFontSize(20)
  pdf.text(design.name, pageW / 2, 30, { align: 'center' })
  pdf.setFontSize(11)
  pdf.text(`构件 ${design.members.length} 件 · 节点 ${design.joints.length} 处 · 装配步骤 ${steps.length} 步`, pageW / 2, 42, { align: 'center' })
  pdf.addImage(shots[0].dataUrl, 'PNG', margin, 52, pageW - margin * 2, 100)

  // 零件表
  pdf.addPage()
  pdf.setFontSize(15)
  pdf.text('零件表', margin, 20)
  const rows = partTable(design)
  pdf.setFontSize(9)
  const head = ['序号', '名称', '截面/尺寸(mm)', '材种', '木纹']
  const colX = [margin, margin + 18, margin + 60, margin + 122, margin + 158]
  let y = 30
  pdf.setFillColor(238, 241, 245)
  pdf.rect(margin, y - 5, pageW - margin * 2, 8, 'F')
  head.forEach((h, i) => pdf.text(h, colX[i], y))
  y += 9
  for (const row of rows) {
    if (y > 280) { pdf.addPage(); y = 20 }
    row.forEach((c, i) => pdf.text(c, colX[i], y))
    y += 7
  }

  // 装配步骤页
  for (let i = 1; i < shots.length; i++) {
    const shot = shots[i]
    pdf.addPage()
    pdf.setFontSize(13)
    pdf.text(shot.caption, margin, 20)
    pdf.addImage(shot.dataUrl, 'PNG', margin, 28, pageW - margin * 2, 110)
    const step = shot.step
    if (step) {
      pdf.setFontSize(10)
      const blockerText = step.blockers.length
        ? `对位构件：${step.blockers.map((b) => nameOf(design, b)).join('、')}`
        : '基准件，先行固定'
      pdf.text(blockerText, margin, 150)
    }
  }

  pdf.save(`${safeName(design.name)}_装配说明书.pdf`)
}

export const exportManualPngZip = async (viewer: DesignViewer, design: Design, steps: AssemblyStep[]) => {
  const shots = await collectShots(viewer, design, steps)
  const zip = new JSZip()
  const folder = zip.folder(safeName(design.name))!
  shots.forEach((shot, i) => {
    const base = shot.dataUrl.split(',')[1]
    folder.file(`${String(i).padStart(2, '0')}_${safeName(shot.caption.split('：')[0])}.png`, base, { base64: true })
  })
  // 零件表 CSV 一并打包
  const csv = [
    ['序号', '名称', '尺寸mm', '材种', '木纹'].join(','),
    ...partTable(design).map((r) => r.join(','))
  ].join('\n')
  folder.file('零件表.csv', '﻿' + csv)
  const blob = await zip.generateAsync({ type: 'blob' })
  download(blob, `${safeName(design.name)}_说明书图片.zip`)
}

export const exportDesignBundle = async (bundle: DesignBundle) => {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  download(blob, `榫卯款式包_${new Date(bundle.exportedAt).toISOString().slice(0, 10)}.json`)
}

export const readBundleFile = (file: File): Promise<DesignBundle> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)) as DesignBundle)
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
