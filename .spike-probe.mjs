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

// Login
await page.goto(`${BASE}/admin/login`)
await page.fill('input[name="email"]', 'spike@kreart.test')
await page.fill('input[name="password"]', 'spike-password-1234')
await page.click('button[type="submit"]')
await page.waitForURL(`${BASE}/admin`, { timeout: 15000 })
console.log('Logged in.')

// Navigate to the product edit page (id=2)
await page.goto(`${BASE}/admin/collections/products/2`)
await page.waitForSelector('text=Spike Task 0 Product', { timeout: 15000 })
console.log('Product page loaded.')

await page.screenshot({ path: '/private/tmp/claude-501/-Users-admin-Sites/3941564e-cdc6-4fd2-b029-eab68e6617ba/scratchpad/01-loaded.png', fullPage: true })

// Expand all view rows if collapsed by default - check row headers
const rows = await page.locator('#field-views .array-field__row').all()
console.log('Number of view rows found:', rows.length)

await browser.close()
