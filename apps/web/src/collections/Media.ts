import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    // Local disk for now. Spec §13 puts this on S3-compatible storage in production.
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
