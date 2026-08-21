import fs from 'node:fs'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.js'

const payload = await getPayload({ config })

const colourways = await payload.find({ collection: 'colourways', limit: 10 })
const sizes = await payload.find({ collection: 'sizes', limit: 10 })
if (colourways.totalDocs < 3 || sizes.totalDocs < 1) {
  console.error('Need at least 3 colourways and 1 size seeded first.')
  process.exit(1)
}
const cw = colourways.docs.slice(0, 3)

const fixturePath = path.resolve(
  process.cwd(),
  '../../packages/design-fabric/test/fixtures/black-1200.png',
)
const fileBuffer = fs.readFileSync(fixturePath)

async function makeMedia(name: string) {
  const media = await payload.create({
    collection: 'media',
    data: { alt: name, kind: 'mockup' },
    file: {
      data: fileBuffer,
      mimetype: 'image/png',
      name: `${name}.png`,
      size: fileBuffer.length,
    },
  })
  return media.id
}

console.log('Creating 12 media docs (4 views x 3 mockups)...')
const mediaIds: string[] = []
for (let v = 0; v < 4; v++) {
  for (let m = 0; m < 3; m++) {
    mediaIds.push(await makeMedia(`spike-view${v + 1}-mockup${m + 1}`))
  }
}

const views = [1, 2, 3, 4].map((n) => ({
  slug: `view-${n}`,
  label: `View ${n}`,
  mockups: [0, 1, 2].map((i) => ({
    colourway: cw[i].id,
    image: mediaIds[(n - 1) * 3 + i],
  })),
  printArea: {
    widthMm: 200,
    heightMm: 250,
    x: 0.25,
    y: 0.2,
    w: 0.5,
    h: 0.5,
  },
}))

const existing = await payload.find({
  collection: 'products',
  where: { slug: { equals: 'spike-task-0' } },
  limit: 1,
})
if (existing.totalDocs > 0) {
  await payload.delete({ collection: 'products', id: existing.docs[0].id })
  console.log('deleted pre-existing spike product')
}

const product = await payload.create({
  collection: 'products',
  data: {
    title: 'Spike Task 0 Product',
    slug: 'spike-task-0',
    targetDpi: 300,
    minTextHeightMm: 4,
    minStrokeWidthMm: 1,
    sizes: sizes.docs.slice(0, 1).map((s) => s.id),
    colourways: cw.map((c) => c.id),
    views,
  },
})

console.log('created product id:', product.id)
process.exit(0)
