import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

const mm = z.number().finite().nonnegative()
const signedMm = z.number().finite()
const colour = z.string().min(1)

const sizePx = z.object({ w: z.number().int().positive(), h: z.number().int().positive() })

export const imageObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('image'),
  mediaId: z.string().min(1),
  xMm: signedMm, yMm: signedMm, wMm: mm, hMm: mm,
  rotation: z.number().finite(),
  opacity: z.number().min(0).max(1),
  sourcePx: sizePx,
  background: z.enum(['original', 'removed']),
}).strict()

export const textObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('text'),
  text: z.string(),
  xMm: signedMm, yMm: signedMm, wMm: mm,
  rotation: z.number().finite(),
  font: z.object({
    family: z.string().min(1),
    weight: z.number().int().min(100).max(900),
    sizeMm: mm.positive(),
    letterSpacingMm: signedMm,
    lineHeight: z.number().positive(),
  }).strict(),
  fill: colour,
  stroke: z.object({ color: colour, widthMm: mm }).strict().optional(),
  shadow: z.object({
    offsetXMm: signedMm, offsetYMm: signedMm, blurMm: mm, color: colour,
  }).strict().optional(),
  background: z.object({ color: colour, paddingMm: mm }).strict().optional(),
  curve: z.object({
    radiusMm: mm.positive(),
    direction: z.enum(['up', 'down']),
  }).strict().optional(),
}).strict()

export const designObjectSchema = z.discriminatedUnion('kind', [
  imageObjectSchema,
  textObjectSchema,
])

export const acknowledgementSchema = z.object({
  objectId: z.string().min(1),
  kind: z.enum(['lowDpi', 'smallText', 'thinStroke']),
  shown: z.object({
    measured: z.number().finite(),
    threshold: z.number().finite(),
    unit: z.enum(['dpi', 'mm']),
  }).strict(),
  at: z.string().datetime(),
}).strict()

export const designViewSchema = z.object({
  printAreaMm: z.object({ w: mm.positive(), h: mm.positive() }).strict(),
  objects: z.array(designObjectSchema),
}).strict()

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  productId: z.string().min(1),
  sizeId: z.string().min(1),
  colourwayId: z.string().min(1),
  views: z.record(z.string(), designViewSchema),
  acknowledgements: z.array(acknowledgementSchema).optional(),
}).strict()

export type ImageObject = z.infer<typeof imageObjectSchema>
export type TextObject = z.infer<typeof textObjectSchema>
export type DesignObject = z.infer<typeof designObjectSchema>
export type Acknowledgement = z.infer<typeof acknowledgementSchema>
export type DesignView = z.infer<typeof designViewSchema>
export type DesignDocument = z.infer<typeof designDocumentSchema>

/** Throws on any invalid document. There is no lenient mode: see spec §11. */
export function parseDesignDocument(input: unknown): DesignDocument {
  return designDocumentSchema.parse(input)
}
