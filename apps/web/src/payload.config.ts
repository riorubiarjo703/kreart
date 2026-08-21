import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Sizes } from './collections/Sizes'
import { Colourways } from './collections/Colourways'
import { Products } from './collections/Products'
import { Fonts } from './collections/Fonts'
import { Designs } from './collections/Designs'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    meta: { titleSuffix: ' · kreart' },
  },

  collections: [Users, Media, Sizes, Colourways, Products, Fonts, Designs],

  editor: lexicalEditor(),

  // S3-compatible media storage, per spec §13 — MinIO locally, so mockups survive
  // container restarts and are reachable by the render worker (a separate process).
  plugins: [
    s3Storage({
      collections: { media: true, fonts: true },
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        forcePathStyle: true, // required by MinIO and most S3-compatible services
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],

  // Postgres, per spec §2. Note payblocks-main uses MongoDB — kreart deliberately
  // differs because the ecommerce plugin's variant/pricing model is relational.
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),

  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  sharp,
})
