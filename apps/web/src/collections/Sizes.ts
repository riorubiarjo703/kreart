import type { CollectionConfig } from 'payload'

export const Sizes: CollectionConfig = {
  slug: 'sizes',
  admin: { useAsTitle: 'code', defaultColumns: ['code', 'label', 'sortOrder'] },
  access: { read: () => true },
  fields: [
    { name: 'code', type: 'text', required: true, unique: true, admin: { description: 'S, M, L, XL…' } },
    { name: 'label', type: 'text' },
    { name: 'sortOrder', type: 'number', required: true, defaultValue: 0 },
    {
      name: 'guide',
      type: 'array',
      label: 'Size guide measurements',
      admin: { description: 'Shown to the customer. Millimetres, like everything else.' },
      fields: [
        { name: 'name', type: 'text', required: true, admin: { description: 'Chest width, Body length…' } },
        { name: 'valueMm', type: 'number', required: true, min: 0 },
      ],
    },
  ],
}
