import { getPayload } from 'payload'
import config from '../src/payload.config.js'

const email = process.env.ADMIN_EMAIL
const password = process.env.ADMIN_PASSWORD
if (!email || !password) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD.')
  process.exit(1)
}

const payload = await getPayload({ config })

const existing = await payload.find({
  collection: 'users', where: { email: { equals: email } }, limit: 1,
})

if (existing.totalDocs > 0) {
  console.log(`user ${email} already exists — leaving it alone`)
} else {
  await payload.create({
    collection: 'users',
    data: { email, password, name: 'Laurentius', role: 'admin' },
  })
  console.log(`created admin user ${email}`)
}
process.exit(0)
