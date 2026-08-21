import type { CollectionConfig } from 'payload'

/**
 * A garment. Its print geometry is expressed in MILLIMETRES — see spec §3.
 *
 * Each view (front, back, sleeve…) carries a print area described two ways at once:
 *   - its true physical size in mm, which is what a customer's "22 cm wide" means
 *   - its position on the mockup in normalised 0–1 coordinates, so a mockup can be
 *     swapped for a higher-resolution one without redefining the geometry
 *
 * Normalised coordinates only survive a swap if the ASPECT RATIO is unchanged.
 * Spec §15 assumption 6 requires mockup upload to reject a mismatched ratio.
 */
export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'targetDpi'],
    description: 'Garments and their print areas. All geometry is in millimetres.',
  },
  access: { read: () => true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },

    {
      type: 'collapsible',
      label: 'Print quality guardrails',
      admin: { description: 'Spec §3.3 and §3.4. Per-product because the right values depend on fabric, ink and printer.' },
      fields: [
        {
          name: 'targetDpi',
          type: 'number',
          required: true,
          defaultValue: 300,
          min: 72,
          admin: { description: 'Print resolution. DTG shops variously want 150, 300 or 600.' },
        },
        {
          name: 'minTextHeightMm',
          type: 'number',
          required: true,
          defaultValue: 4,
          min: 0,
          admin: { description: 'Below this, DTG ink spread closes up the letterforms. Warns, does not block.' },
        },
        {
          name: 'minStrokeWidthMm',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 0,
          admin: { description: 'Thin outlines bleed into the weave. Warns, does not block.' },
        },
      ],
    },

    { name: 'sizes', type: 'relationship', relationTo: 'sizes', hasMany: true, required: true },
    { name: 'colourways', type: 'relationship', relationTo: 'colourways', hasMany: true, required: true },

    {
      name: 'views',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'View', plural: 'Views' },
      admin: { description: 'Front, back, sleeves — configured per product, not hardcoded (spec §15 assumption 1).' },
      fields: [
        { name: 'slug', type: 'text', required: true, admin: { description: 'front, back, left-sleeve…' } },
        { name: 'label', type: 'text', required: true },

        {
          name: 'mockups',
          type: 'array',
          labels: { singular: 'Mockup', plural: 'Mockups' },
          admin: { description: 'One garment photo per colourway, for this view.' },
          fields: [
            { name: 'colourway', type: 'relationship', relationTo: 'colourways', required: true },
            { name: 'image', type: 'upload', relationTo: 'media', required: true },
          ],
        },

        {
          name: 'printArea',
          type: 'group',
          admin: { description: 'The printable rectangle for this view.' },
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'widthMm', label: 'Width (mm)', type: 'number', required: true, min: 1, admin: { width: '50%', description: 'The real printed width. This is what a customer\'s "22 cm" means.' } },
                { name: 'heightMm', label: 'Height (mm)', type: 'number', required: true, min: 1, admin: { width: '50%', description: 'The real printed height.' } },
              ],
            },
            {
              type: 'row',
              admin: { description: 'Position on the mockup, normalised 0–1 (Plan 2 replaces these with a drag-a-rectangle editor).' },
              fields: [
                { name: 'x', label: 'Left (0-1)', type: 'number', required: true, defaultValue: 0.25, min: 0, max: 1, admin: { width: '25%' } },
                { name: 'y', label: 'Top (0-1)', type: 'number', required: true, defaultValue: 0.2, min: 0, max: 1, admin: { width: '25%' } },
                { name: 'w', label: 'Width (0-1)', type: 'number', required: true, defaultValue: 0.5, min: 0, max: 1, admin: { width: '25%' } },
                { name: 'h', label: 'Height (0-1)', type: 'number', required: true, defaultValue: 0.5, min: 0, max: 1, admin: { width: '25%' } },
              ],
            },
          ],
        },

        {
          name: 'sizeOverrides',
          type: 'array',
          labels: { singular: 'Size override', plural: 'Size overrides' },
          admin: {
            description:
              'Optional. Only for products whose print area genuinely changes with size — e.g. S at 280×380mm, XXL at 320×450mm. Omit entirely if uniform.',
          },
          fields: [
            { name: 'size', type: 'relationship', relationTo: 'sizes', required: true },
            {
              type: 'row',
              fields: [
                { name: 'widthMm', label: 'Width (mm)', type: 'number', required: true, min: 1, admin: { width: '50%' } },
                { name: 'heightMm', label: 'Height (mm)', type: 'number', required: true, min: 1, admin: { width: '50%' } },
              ],
            },
          ],
        },
      ],
    },
  ],
}
