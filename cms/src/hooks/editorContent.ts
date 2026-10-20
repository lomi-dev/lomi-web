import type { GlobalAfterReadHook, GlobalBeforeOperationHook, GlobalBeforeValidateHook } from 'payload'
import { hydrateEditorContent } from '../../../content/editor-content'

/** Preserve explicitly submitted arrays, including an intentionally empty list. */
export function mergeEditorPatch(original: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result = { ...original }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const previous = result[key]
    result[key] = value && previous && typeof value === 'object' && typeof previous === 'object' && !Array.isArray(value) && !Array.isArray(previous)
      ? mergeEditorPatch(previous as Record<string, unknown>, value as Record<string, unknown>) : value
  }
  return result
}

export const hydrateWebsiteRead: GlobalAfterReadHook = ({ doc }) => hydrateEditorContent(doc)

// Payload adds empty arrays during field validation. Capture which fields the
// caller actually submitted before that traversal, preserving intentional [].
const patchKey = 'websiteEditorSubmittedPatch'
export const captureWebsitePatch: GlobalBeforeOperationHook = ({ args, context, operation }) => {
  if (operation === 'update') context[patchKey] = structuredClone(args?.data ?? {})
  return args
}

function submittedValues(data: Record<string, unknown>, submitted: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(submitted).map(([key, value]) => [key,
    value && typeof value === 'object' && !Array.isArray(value)
      ? submittedValues((data[key] ?? {}) as Record<string, unknown>, value as Record<string, unknown>)
      : data[key] === undefined ? value : data[key],
  ]))
}

export const prepareWebsiteWrite: GlobalBeforeValidateHook = ({ context, data, originalDoc }) => {
  const submitted = context[patchKey] as Record<string, unknown> | undefined
  delete context[patchKey]
  const patch = submitted ? submittedValues(data ?? {}, submitted) : data ?? {}
  // Normalize submitted nullable/new-row values before Payload validates them.
  // Mark the merged document first so intentionally empty arrays stay empty.
  return hydrateEditorContent({
    ...mergeEditorPatch(hydrateEditorContent(originalDoc ?? {}), patch),
    ...(data?._status ? { _status: data._status } : {}),
    editorVersion: 1,
  })
}
