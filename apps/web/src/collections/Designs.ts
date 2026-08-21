import type { CollectionConfig } from 'payload'
import { DEFAULT_GUARDRAILS } from '@kreart/design-core'
import { validateDesignForSave } from '../lib/validateDesign'

export const Designs: CollectionConfig = {
  slug: 'designs',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['id', 'product', 'status', 'updatedAt'],
    description: 'Customer designs. Written by the editor in a later plan; validated here.',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data?.document) return data
        validateDesignForSave({
          document: data.document,
          guardrails: DEFAULT_GUARDRAILS,
          finalising: data.status === 'finalising' || data.status === 'finalised',
        })
        return data
      },
    ],
  },
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true },
    { name: 'sizeId', type: 'text', required: true },
    { name: 'colourwayId', type: 'text', required: true },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Finalising', value: 'finalising' },
        { label: 'Finalised', value: 'finalised' },
        { label: 'Render failed', value: 'render-failed' },
      ],
    },
    {
      name: 'document', type: 'json', required: true,
      admin: { description: 'A DesignDocument (project spec §4.2). Millimetres only — a pixel value here is a bug.' },
    },
    {
      name: 'renderOutputs', type: 'group',
      fields: [
        { name: 'pdf', type: 'upload', relationTo: 'media' },
        { name: 'png', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
