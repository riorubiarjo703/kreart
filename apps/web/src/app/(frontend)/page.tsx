import { getPayload } from 'payload'
import config from '@payload-config'
import { dpiToPxPerMm, MM_PER_INCH } from '@kreart/design-core'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const [products, sizes, colourways] = await Promise.all([
    payload.find({ collection: 'products', limit: 50, depth: 1 }),
    payload.find({ collection: 'sizes', limit: 50 }),
    payload.find({ collection: 'colourways', limit: 50 }),
  ])

  const box: React.CSSProperties = {
    border: '1px solid #e3e3e3', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1rem',
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '3rem 1.5rem', lineHeight: 1.55 }}>
      <h1 style={{ marginBottom: 0 }}>kreart</h1>
      <p style={{ color: '#666', marginTop: '.25rem' }}>
        Plan 1 (measurement core) is complete. This page is a smoke test that Payload,
        Postgres and <code>@kreart/design-core</code> are all wired together — the design
        editor and storefront are Plan 3.
      </p>

      <div style={box}>
        <strong>Measurement core is live in this process</strong>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, marginTop: '.5rem' }}>
          MM_PER_INCH = {MM_PER_INCH}<br />
          dpiToPxPerMm(300) = {dpiToPxPerMm(300).toFixed(4)} px/mm<br />
          a 100&nbsp;mm square at 300&nbsp;DPI = {(100 * dpiToPxPerMm(300)).toFixed(2)} px
        </div>
      </div>

      <div style={box}>
        <strong>Products</strong> ({products.totalDocs})
        {products.totalDocs === 0 ? (
          <p style={{ color: '#888', margin: '.5rem 0 0' }}>
            None yet — create one in the <a href="/admin">admin</a>.
          </p>
        ) : (
          <ul style={{ margin: '.5rem 0 0' }}>
            {products.docs.map((p: any) => (
              <li key={p.id}>
                {p.title} — {p.views?.length ?? 0} view(s), target {p.targetDpi} DPI
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={box}>
        <strong>Sizes</strong> ({sizes.totalDocs}) ·{' '}
        <strong>Colourways</strong> ({colourways.totalDocs})
        <p style={{ color: '#888', margin: '.5rem 0 0' }}>
          {sizes.docs.map((s: any) => s.code).join(', ') || '—'}
        </p>
      </div>

      <p><a href="/admin">Open the admin →</a></p>
    </main>
  )
}
