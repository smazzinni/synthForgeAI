// ─── SQL query history + saved queries (localStorage persistence) ───
// Extracted from page.tsx. Previously the load/save logic was inlined inside
// useState initializers + useEffect hooks in the studio component. Pulling
// them out keeps the storage keys + JSON shape in one place and makes the
// helpers trivially testable.

import type { SavedQuery } from './types'

/** localStorage key for the recent-SQL-queries stack (most-recent-first). */
export const QUERY_HISTORY_STORAGE_KEY = 'synthforge_query_history'

/** localStorage key for the user-saved named SQL snippets. */
export const SAVED_QUERIES_STORAGE_KEY = 'synthforge_saved_queries'

/**
 * Load the recent-SQL-queries history from localStorage.
 * Returns `[]` on SSR, malformed JSON, or when no entry exists.
 */
export function loadQueryHistory(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUERY_HISTORY_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Persist the recent-SQL-queries history to localStorage (no-op on SSR/quota). */
export function saveQueryHistory(queries: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(QUERY_HISTORY_STORAGE_KEY, JSON.stringify(queries))
  } catch { /* localStorage unavailable */ }
}

/**
 * Load the user-saved named SQL snippets from localStorage.
 * Returns `[]` on SSR, malformed JSON, or when no entry exists.
 */
export function loadSavedQueries(): SavedQuery[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SAVED_QUERIES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/** Persist the user-saved named SQL snippets to localStorage (no-op on SSR/quota). */
export function saveSavedQueries(queries: SavedQuery[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SAVED_QUERIES_STORAGE_KEY, JSON.stringify(queries))
  } catch { /* localStorage unavailable */ }
}
