import type { CollectionConfig } from 'payload'

/**
 * A font cannot be published unless its licence permits BOTH server-side
 * rendering and conversion to outlines (project spec §11.2).
 *
 * The second is the one that catches people out: the PDF print master converts
 * glyphs to vector outlines as a side effect of the cairo surface, not as a
 * deliberate step, so a licence forbidding outlining is violated without anyone
 * choosing to do it.
 */
export function assertLicencePermissions(doc: {
  permitsServerRendering?: unknown
  permitsOutlineConversion?: unknown
}): void {
  const missing: string[] = []
  if (doc.permitsServerRendering !== true) {
    missing.push('server-side rendering (the worker rasterises this font on a server)')
  }
  if (doc.permitsOutlineConversion !== true) {
    missing.push('conversion to outlines (the PDF print master outlines every glyph)')
  }
  if (missing.length) {
    throw new Error(
      `This font cannot be published until its licence is confirmed to permit: ` +
      `${missing.join('; and ')}. Read the licence before publishing — open-source ` +
      `families under SIL OFL 1.1 or Apache 2.0 satisfy both.`,
    )
  }
}

export const Fonts: CollectionConfig = {
  slug: 'fonts',
  admin: {
    useAsTitle: 'family',
    defaultColumns: ['family', 'weight', 'licenceName'],
    description: 'Fonts offered in the design editor. Self-hosted — never linked from a CDN.',
  },
  access: { read: () => true },
  upload: { staticDir: 'fonts', mimeTypes: ['font/ttf', 'font/otf', 'application/octet-stream'] },
  hooks: {
    beforeChange: [
      ({ data }) => { assertLicencePermissions(data ?? {}); return data },
    ],
  },
  fields: [
    { name: 'family', type: 'text', required: true },
    {
      name: 'weight', type: 'number', required: true, defaultValue: 400, min: 100, max: 900,
      admin: { description: 'The worker registers each weight separately; an unregistered weight fails loudly at render.' },
    },
    {
      type: 'collapsible',
      label: 'Licence',
      admin: { description: 'Project spec §11.2. Both permissions are required — a webfont licence does not imply either.' },
      fields: [
        { name: 'licenceName', type: 'text', required: true, admin: { description: 'SIL OFL 1.1, Apache 2.0, a commercial licence name…' } },
        { name: 'licenceUrl', type: 'text', required: true },
        {
          name: 'permitsServerRendering', type: 'checkbox', required: true, defaultValue: false,
          label: 'Licence permits server-side rendering',
        },
        {
          name: 'permitsOutlineConversion', type: 'checkbox', required: true, defaultValue: false,
          label: 'Licence permits conversion to outlines',
          admin: { description: 'The PDF print master outlines glyphs as a side effect — this is easy to violate unintentionally.' },
        },
      ],
    },
  ],
}
