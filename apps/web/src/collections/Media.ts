import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    // Served from S3-compatible storage (MinIO locally) via @payloadcms/storage-s3 —
    // spec §13. Its getFile.js always returns a Response, so Payload's core local-disk
    // fallback (payload/dist/uploads/endpoints/getFile.js) is dead code once the adapter
    // is registered: a document whose file only exists on local disk (pre-migration, or
    // from a restored older backup) will 404 through the read endpoint even though the
    // bytes are still on disk. No files predate this migration, so nothing to backfill —
    // but a restored backup needs its files re-uploaded to the bucket, not just the DB.
    staticDir: 'media',
    mimeTypes: ['image/*'],
  },
  admin: { useAsTitle: 'filename' },
  fields: [
    { name: 'alt', type: 'text' },
    {
      name: 'kind',
      type: 'select',
      defaultValue: 'mockup',
      options: [
        { label: 'Garment mockup', value: 'mockup' },
        { label: 'Customer artwork (original)', value: 'artwork-original' },
        { label: 'Customer artwork (background removed)', value: 'artwork-cutout' },
      ],
      admin: {
        description:
          'Originals and background-removed cutouts are separate documents (spec §8) — never overwrite an original.',
      },
    },
  ],
}
