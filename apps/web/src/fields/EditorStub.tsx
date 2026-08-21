'use client'

/**
 * THROWAWAY SPIKE STUB — Task 0. Do not keep. Exercises nesting/re-render
 * behaviour of a `ui` field two levels down in products.views[].printArea.
 */
import React from 'react'
import { useField } from '@payloadcms/ui'
import type { UIFieldClientComponent } from 'payload'

const counts: Record<string, number> = {}

const EditorStub: UIFieldClientComponent = (props) => {
  const path = props.path ?? 'unknown'
  // path looks like "views.2.printArea.editor" — derive the row path and
  // read one sibling field on the row (the view's slug) via useField.
  const rowPath = path.replace(/\.printArea\.editor$/, '')
  const slugPath = `${rowPath}.slug`
  const { value: slug } = useField<string>({ path: slugPath })

  counts[path] = (counts[path] ?? 0) + 1
  // eslint-disable-next-line no-console
  console.count(`EditorStub render [${path}]`)

  return (
    <div
      data-spike-editor-stub={path}
      style={{
        background: '#dbeafe',
        border: '2px solid #1e3a8a',
        padding: 16,
        borderRadius: 6,
        fontFamily: 'monospace',
        fontSize: 13,
      }}
    >
      <div>EditorStub — path: {path}</div>
      <div>sibling slug: {String(slug ?? '(empty)')}</div>
      <div>local render count: {counts[path]}</div>
    </div>
  )
}

export default EditorStub
