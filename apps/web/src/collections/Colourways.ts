import type { CollectionConfig } from 'payload'

export const Colourways: CollectionConfig = {
  slug: 'colourways',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'hex'] },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'hex',
      type: 'text',
      required: true,
      defaultValue: '#ffffff',
      validate: (v: unknown) =>
        typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? true : 'Use a #rrggbb value.',
    },
  ],
}
