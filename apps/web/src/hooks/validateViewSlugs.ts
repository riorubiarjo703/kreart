const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A DesignDocument references a view by slug, so duplicates make a design
 * ambiguous. Throwing here rejects the save (spec §7).
 */
export function validateViewSlugs(views: { slug?: string | null }[]): void {
  const seen = new Set<string>()
  for (const [i, view] of views.entries()) {
    const slug = view.slug ?? ''
    if (!slug) {
      throw new Error(`View ${i + 1} has no slug. Designs reference views by slug.`)
    }
    if (!SLUG.test(slug)) {
      throw new Error(
        `View slug "${slug}" must be lowercase, hyphenated, and alphanumeric — e.g. "left-sleeve".`,
      )
    }
    if (seen.has(slug)) {
      throw new Error(`Duplicate view slug "${slug}". Slugs must be unique within a product.`)
    }
    seen.add(slug)
  }
}
