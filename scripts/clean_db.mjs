import puppeteer from 'puppeteer'
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader-webgl']
})
const page = await browser.newPage()
await page.goto('http://localhost:5180/')
await page.waitForSelector('.design-card')
await page.evaluate(() => indexedDB.deleteDatabase('mortise_tenon_workbench'))
await wait(500)
await page.reload()
await page.waitForSelector('.design-card')
const cards = await page.$$eval('.design-card', (els) => els.length)
const topbar = await page.$eval('.topbar', (el) => el.textContent)
console.log('重置后款式数:', cards, '| 顶栏:', topbar)
await browser.close()
function wait(ms) { return new Promise((r) => setTimeout(r, ms)) }
