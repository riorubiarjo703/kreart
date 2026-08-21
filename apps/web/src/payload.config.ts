import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
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

  // Postgres, per spec §2. Note payblocks-main uses MongoDB — kreart deliberately
  // differs because the ecommerce plugin's variant/pricing model is relational.
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),

  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  sharp,
})
