import { getPayload } from 'payload'
import config from '../src/payload.config.js'

/**
 * Seeds the reference data a product needs before it can be defined.
 * Idempotent: re-running updates nothing and creates nothing twice.
 */
const SIZES = [
  { code: 'S', label: 'Small', sortOrder: 10, chest: 460, length: 690 },
  { code: 'M', label: 'Medium', sortOrder: 20, chest: 510, length: 710 },
  { code: 'L', label: 'Large', sortOrder: 30, chest: 560, length: 730 },
  { code: 'XL', label: 'Extra large', sortOrder: 40, chest: 610, length: 750 },
]

const COLOURWAYS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Black', hex: '#111111' },
  { name: 'Heather grey', hex: '#b8b8b8' },
]

const payload = await getPayload({ config })

for (const s of SIZES) {
  const existing = await payload.find({
    collection: 'sizes', where: { code: { equals: s.code } }, limit: 1,
  })
  if (existing.totalDocs > 0) {
    console.log(`size ${s.code} — already present, skipped`)
    continue
  }
  await payload.create({
    collection: 'sizes',
    data: {
      code: s.code, label: s.label, sortOrder: s.sortOrder,
      guide: [
        { name: 'Chest width', valueMm: s.chest },
        { name: 'Body length', valueMm: s.length },
      ],
    },
  })
  console.log(`size ${s.code} — created`)
}

for (const c of COLOURWAYS) {
  const existing = await payload.find({
    collection: 'colourways', where: { name: { equals: c.name } }, limit: 1,
  })
  if (existing.totalDocs > 0) {
    console.log(`colourway ${c.name} — already present, skipped`)
    continue
  }
  await payload.create({ collection: 'colourways', data: c })
  console.log(`colourway ${c.name} — created`)
}

console.log('\nseed complete. Sizes carry size-guide measurements in millimetres.')
process.exit(0)
