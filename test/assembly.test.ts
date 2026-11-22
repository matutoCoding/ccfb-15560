import { describe, expect, it } from 'vitest'
import { buildSquareTable } from '../src/core/seed_table'
import { buildCircleChair } from '../src/core/seed_chair'
import { planAssembly } from '../src/core/assembly'
import { checkInterference, createInterferenceCache } from '../src/core/interference'
import { validateJoint } from '../src/core/joints'
import { memberSolidBoxes } from '../src/core/solids'

const designs = () => [buildSquareTable(), buildCircleChair()]

describe('内置款式基础完整性', () => {
  it('两款均含构件，且四种节点类型在套件内齐全（粽角/抱肩见方桌，燕尾两款式均有）', () => {
    const all = designs()
    for (const d of all) {
      expect(d.members.length).toBeGreaterThan(10)
      expect(d.joints.length).toBeGreaterThan(10)
    }
    const types = new Set(all.flatMap((d) => d.joints.map((j) => j.type)))
    for (const t of ['dovetail', 'crossShoulder', 'hugShoulder', 'corner'] as const) {
      expect(types.has(t)).toBe(true)
    }
  })

  it('全部节点参数校验通过', () => {
    for (const d of designs()) {
      const errors = d.joints.flatMap((j) => validateJoint(j, d.members))
      expect(errors).toEqual([])
    }
  })

  it('所有节点引用的构件都存在', () => {
    for (const d of designs()) {
      const ids = new Set(d.members.map((m) => m.id))
      for (const j of d.joints) {
        expect(ids.has(j.tenonMemberId)).toBe(true)
        expect(ids.has(j.mortiseMemberId)).toBe(true)
        if (j.thirdMemberId) expect(ids.has(j.thirdMemberId)).toBe(true)
      }
    }
  })
})

describe('装配顺序求解（最关键需求）', () => {
  it('圈椅与方桌都能推出完整可装顺序，无锁死', () => {
    for (const d of designs()) {
      const plan = planAssembly(d)
      expect(plan.lock).toBeNull()
      expect(plan.steps).toHaveLength(d.members.length)
      // 每一步都带明确插入方向
      for (const step of plan.steps) {
        expect(['x', 'y', 'z']).toContain(step.insertAxis)
        expect([1, -1]).toContain(step.insertSign)
      }
      // 每个构件恰好出现一次
      const seq = plan.steps.map((s) => s.memberId)
      expect(new Set(seq).size).toBe(seq.length)
    }
  })

  it('求解结果确定：重复计算顺序一致', () => {
    for (const d of designs()) {
      const a = planAssembly(d).steps.map((s) => s.memberId).join(',')
      const b = planAssembly(d).steps.map((s) => s.memberId).join(',')
      expect(a).toBe(b)
    }
  })

  it('每一步都是几何可执行的：按序装入时扫掠路径不撞已装件', () => {
    for (const d of designs()) {
      const plan = planAssembly(d)
      const solids = new Map(d.members.map((m) => [m.id, memberSolidBoxes(m, d.joints, d.members)]))
      const placed: string[] = []
      for (const step of plan.steps) {
        const own = solids.get(step.memberId)!
        for (const otherId of placed) {
          // 装配位上构件实体箱互不重叠（腔体已扣除）
          for (const box of own) {
            for (const ob of solids.get(otherId)!) {
              const overlap =
                box.min[0] < ob.max[0] && box.max[0] > ob.min[0] &&
                box.min[1] < ob.max[1] && box.max[1] > ob.min[1] &&
                box.min[2] < ob.max[2] && box.max[2] > ob.min[2]
              expect(overlap).toBe(false)
            }
          }
        }
        placed.push(step.memberId)
      }
    }
  })

  it('停用任意一个卯眼，求解器必须在报告中点名故障节点与受影响构件', () => {
    for (const d of designs()) {
      const target = d.joints[Math.floor(d.joints.length / 2)]
      target.mortiseDisabled = true
      const plan = planAssembly(d)
      expect(plan.lock).not.toBeNull()
      expect(plan.lock!.configErrors.join('')).toContain('卯眼已停用')
      expect(plan.lock!.configErrors.join('')).toContain(target.name)
      target.mortiseDisabled = false
    }
  })

  it('实体互相嵌入造成几何锁死时，给出锁死名单与六方向阻挡明细', () => {
    for (const d of designs()) {
      // 把一根构件平移到另一根构件原料内部 -> 实体重叠 -> 六方向皆不可抽
      const a = d.members[0]
      const b = d.members[1]
      a.center = [...b.center]
      const plan = planAssembly(d)
      expect(plan.lock).not.toBeNull()
      expect(plan.lock!.locked).toBe(true)
      expect(plan.lock!.memberIds).toContain(a.id)
      expect(plan.lock!.reasons[a.id].length).toBeGreaterThan(0)
    }
  })

  it('手动顺序错误时能指出第几步装不了', () => {
    const d = buildCircleChair()
    // 复制一根腿到另一根腿的位置，第二件装入时与已装腿实体直接碰撞，无任何可行方向
    const source = d.members.find((m) => m.id === 'leg_br')!
    const clone = { ...source, id: 'leg_dup', name: '复制后腿' }
    d.members.push(clone)
    d.manualOrder = [...d.members.filter((m) => m.id !== clone.id).map((m) => m.id), clone.id]
    const checked = planAssembly(d, { respectManual: true })
    expect(checked.lock).not.toBeNull()
    expect(checked.lock!.configErrors.join('')).toContain('无法装入')
    expect(checked.lock!.memberIds).toContain(clone.id)
  })
})

describe('干涉检查', () => {
  it('正确设计的两款家具零干涉（合法榫卯咬合不计入）', () => {
    for (const d of designs()) {
      const report = checkInterference(d)
      expect(report.hits).toEqual([])
    }
  })

  it('制造穿模后能标红并给出穿透深度与位置', () => {
    const d = buildSquareTable()
    const leg = d.members.find((m) => m.id === 'leg_fl')!
    leg.center[0] += 12 // 前左腿横向插入邻件 12mm
    const report = checkInterference(d)
    expect(report.hits.length).toBeGreaterThan(0)
    const hit = report.hits[0]
    expect(hit.depth).toBeGreaterThan(0)
    expect(hit.center).toHaveLength(3)
    expect([hit.memberA, hit.memberB]).toContain('leg_fl')
  })

  it('缓存命中：第二次检查走增量路径且结果一致', () => {
    const d = buildCircleChair()
    const cache = createInterferenceCache()
    const first = checkInterference(d, cache)
    const second = checkInterference(d, cache)
    expect(second.hits).toEqual(first.hits)
  })
})

describe('性能约束：单件改尺寸到重算干涉 < 200ms', () => {
  it('圈椅/方桌增量干涉检查均在 200ms 内', () => {
    for (const d of designs()) {
      const cache = createInterferenceCache()
      checkInterference(d, cache)
      const target = d.members[0]
      target.size[0] += 4
      const report = checkInterference(d, cache)
      expect(report.elapsedMs).toBeLessThan(200)
    }
  })

  it('完整装配求解也在 200ms 内', () => {
    for (const d of designs()) {
      const start = performance.now()
      planAssembly(d)
      expect(performance.now() - start).toBeLessThan(200)
    }
  })
})
