import { editorDefaults } from './editor-defaults';
import { pageDefaults } from './page-defaults';

function mergeDefaults(value: unknown, fallback: unknown, legacy: boolean): unknown {
  if (fallback === null) return value ?? null;
  if (Array.isArray(fallback)) {
    if (value == null || legacy && Array.isArray(value) && value.length === 0) return structuredClone(fallback);
    if (!Array.isArray(value)) return value; // Let the shared schema reject malformed content.
    return value.map((row) => mergeDefaults(row, fallback[0], legacy));
  }
  if (fallback && typeof fallback === 'object') {
    if (value != null && (typeof value !== 'object' || Array.isArray(value))) return value;
    const source = (value ?? {}) as Record<string, unknown>;
    return { ...source, ...Object.fromEntries(Object.entries(fallback).map(([key, next]) =>
      [key, mergeDefaults(source[key], next, legacy)])) };
  }
  return value ?? fallback;
}

/** Fill only added editor fields; retain legacy copy, metadata and draft status. */
export function hydrateEditorContent(document: Record<string, unknown>): Record<string, unknown> {
  const legacy = document.editorVersion !== 1;
  const additions = { ...editorDefaults, pages: pageDefaults };
  const result = { ...document };
  for (const [key, defaults] of Object.entries(additions)) {
    result[key] = mergeDefaults(document[key], defaults, legacy);
  }
  return result;
}
