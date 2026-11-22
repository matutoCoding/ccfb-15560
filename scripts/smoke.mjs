// 无头浏览器冒烟：启动应用、遍历六个页面、验证三维渲染与核心交互
import puppeteer from 'puppeteer'

const BASE = 'http://localhost:5180/'
const errors = []
const logs = []

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
    '--ignore-gpu-blocklist'
  ]
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })
page.on('console', (msg) => {
  logs.push(`[${msg.type()}] ${msg.text()}`)
  if (msg.type() === 'error') {
    errors.push(msg.text())
    console.log('BROWSER ERROR:', msg.text())
  }
})
page.on('pageerror', (e) => {
  errors.push(`PAGEERROR: ${e.message}`)
  console.log('PAGEERROR:', e.message, e.stack?.slice(0, 400))
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const nav = async (label) => {
  await wait(300)
  const texts = await page.$$eval('.nav-item', (els) => els.map((e) => e.textContent.trim()))
  const idx = texts.findIndex((t) => t.includes(label))
  if (idx < 0) throw new Error(`找不到导航项 ${label}，实际：${texts.join('|')}`)
  const btns = await page.$$('.nav-item')
  await btns[idx].click()
  await wait(1000)
}

// 1. 启动并等待自举
await page.goto(BASE)
await page.waitForSelector('.design-card', { timeout: 15000 })
const cardCount = await page.$$eval('.design-card', (els) => els.length)
console.log('款式卡片数:', cardCount)
if (cardCount < 2) throw new Error('自举应生成圈椅与方桌两款')

// 2. 打开第一款进入构件页
await (await page.$('.design-card .primary')).click()
try {
  await page.waitForSelector('.viewer-wrap canvas', { timeout: 15000 })
} catch (e) {
  await page.screenshot({ path: 'scripts/smoke_fail.png' })
  const html = await page.$eval('.content', (el) => el.innerHTML.slice(0, 600)).catch(() => 'no content')
  console.log('失败时 content 片段:', html)
  throw e
}
await wait(1500)
const memberItems = await page.$$eval('.list-item', (els) => els.length)
console.log('构件列表项:', memberItems)

// 3. 遍历全部页面
for (const label of ['榫卯库', '装配推演', '说明书', '设置', '款式列表']) {
  await nav(label)
  await wait(700)
  console.log('已访问页面:', label)
}

// 4. 重新打开圈椅并验证装配推演结果
await nav('装配推演')
await wait(800)
const bodyText = await page.$eval('.content', (el) => el.textContent)
if (!bodyText.includes('装配顺序求解通过')) throw new Error('装配求解未通过：' + bodyText.slice(0, 200))
const stepRows = await page.$$eval('.step-row', (els) => els.length)
console.log('装配步骤数:', stepRows)
if (stepRows < 10) throw new Error('步骤数异常偏少')
if (bodyText.includes('干涉') && bodyText.includes('穿透')) throw new Error('内置款式不应有干涉')

// 5. 剖切与爆炸交互不报错
await page.select('.viewer-toolbar select', 'z')
await wait(400)
const explodeBtn = await page.$eval('.viewer-toolbar button', (el) => el.textContent)
console.log('工具栏按钮:', explodeBtn)

// 6. 回到构件页验证参数编辑链路
await nav('构件编辑')
await wait(600)
const firstMember = await page.$('.list-item')
await firstMember.click()
await wait(400)
const inputs = await page.$$eval('.panel input[type="number"]', (els) => els.length)
console.log('构件参数输入框:', inputs)

// 7. 截图留证
await nav('装配推演')
await wait(800)
await page.screenshot({ path: 'scripts/smoke_assembly.png' })

// 8. 干涉联动：进入构件页，把第一根腿沿 X 朝相邻腿平移 25mm 制造穿模
await nav('构件编辑')
await page.waitForSelector('.panel .list-item')
await page.click('.panel .list-item')
await wait(300)
let centerInputs = await page.$$('.panel input[type="number"]')
const originalX = await centerInputs[3].getProperty('value').then((p) => p.jsonValue())
const movedX = Number(originalX) + 25
// 中心 X 是第 4 个数字框（宽/深/高 之后）
await centerInputs[3].click({ clickCount: 3 })
await centerInputs[3].type(String(movedX))
await page.keyboard.press('Enter')
await wait(700)
const interfereText = await page.$eval('.topbar', (el) => el.textContent)
console.log('穿模后顶栏:', interfereText)
if (!interfereText.includes('干涉')) throw new Error('穿模后顶栏应显示干涉告警')

// 9. 榫卯库停用卯眼 -> 装配页出现配置故障提示
await nav('榫卯库')
await wait(600)
await page.click('.list-item')
await wait(300)
const toggleBtn = await page.$$eval('.panel button', (els) => els.find((e) => e.textContent.includes('停用卯眼')))
if (!toggleBtn) throw new Error('找不到停用卯眼按钮')
await page.$$eval('.panel button', (els) => els.find((e) => e.textContent.includes('停用卯眼')).click())
await wait(500)
await nav('装配推演')
await wait(600)
const lockText = await page.$eval('.content', (el) => el.textContent)
if (!lockText.includes('卯眼已停用')) throw new Error('停用卯眼后应出现故障提示，实际：' + lockText.slice(0, 200))
console.log('卯眼停用故障提示正常')
// 恢复
await nav('榫卯库')
await wait(500)
await page.$$eval('.panel button', (els) => {
  const b = els.find((e) => e.textContent.includes('恢复卯眼'))
  if (b) b.click()
})
await wait(500)

// 10. 爆炸动画交互
await nav('装配推演')
await wait(600)
await page.click('.viewer-toolbar button')
await wait(1200)
await page.screenshot({ path: 'scripts/smoke_exploded.png' })

await nav('款式列表')
await wait(500)
await page.screenshot({ path: 'scripts/smoke_designs.png' })

await browser.close()

if (errors.length > 0) {
  console.error('--- 控制台错误 ---')
  for (const e of errors) console.error(e)
  process.exit(1)
}
console.log('\n冒烟通过：无控制台错误，六页可访问，装配求解与渲染正常')
