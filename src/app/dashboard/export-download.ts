import { toast } from 'sonner'

export type ExportFormat = 'sql' | 'csv' | 'json' | 'xlsx'

export const EXPORT_EXT: Record<ExportFormat, string> = { sql: 'sql', csv: 'csv', json: 'json', xlsx: 'xls' }

/** Extract filename from a Content-Disposition header. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header)
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')) } catch { /* fall through */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}

/**
 * POST to /api/export, download the returned attachment. Returns true on success.
 * Shows a loading toast while running and toast.error with the server's error on failure.
 */
export async function downloadExport(
  body: Record<string, unknown>,
  format: ExportFormat,
  name: string,
  opts: { silent?: boolean } = {},
): Promise<boolean> {
  const toastId = opts.silent ? undefined : toast.loading(`Exporting "${name}" as ${format.toUpperCase()}...`)
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, format }),
    })
    if (!res.ok) {
      let msg = `Export failed (${res.status})`
      try {
        const j = await res.json()
        if (j?.error) msg = String(j.error)
      } catch { /* non-JSON body */ }
      throw new Error(msg)
    }
    const blob = await res.blob()
    const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) || `${name}.${EXPORT_EXT[format]}`
    const url = URL.createObjectURL(blob)
    const a = window.document.createElement('a')
    a.href = url
    a.download = filename
    window.document.body.appendChild(a)
    a.click()
    window.document.body.removeChild(a)
    URL.revokeObjectURL(url)
    if (!opts.silent) toast.success(`Exported "${name}" as ${format.toUpperCase()}`, { id: toastId })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed'
    if (opts.silent) toast.error(msg)
    else toast.error(msg, { id: toastId })
    return false
  }
}
