import { chromium } from 'playwright'

const BASE = 'http://localhost:3000'

const browser = await chromium.launch()
const page = await browser.newPage()

page.on('console', (msg) => {
  console.log('[BROWSER CONSOLE]', msg.type(), msg.text())
})
page.on('pageerror', (err) => {
  console.log('[PAGE ERROR]', err.message)
})

await page.goto(`${BASE}/admin/login`)
await page.fill('input[name="email"]', 'spike@kreart.test')
await page.fill('input[name="password"]', 'spike-password-1234')
await page.click('button[type="submit"]')
await page.waitForURL(`${BASE}/admin`, { timeout: 15000 })

await page.goto(`${BASE}/admin/collections/products/2`)
await page.waitForSelector('text=Spike Task 0 Product', { timeout: 15000 })
await page.waitForTimeout(1500)

const stubCount = await page.locator('[data-spike-editor-stub]').count()
console.log('stub elements found:', stubCount)

const printAreaHtml = await page.locator('#field-views__0__printArea').innerHTML().catch((e) => 'ERR: ' + e.message)
console.log('printArea[0] innerHTML length:', typeof printAreaHtml === 'string' ? printAreaHtml.length : printAreaHtml)
console.log(printAreaHtml?.slice(0, 3000))

await browser.close()
