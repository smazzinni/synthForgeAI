import { parseImportFile, type ImportResult } from './import-parser'

const EXCEL_EXT = /\.(xlsx|xls)$/i

export function isExcelFile(fileName: string, fileType?: string): boolean {
  const lower = fileName.toLowerCase()
  return (
    EXCEL_EXT.test(lower) ||
    fileType ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel'
  )
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

/** Parse any supported upload in the browser or server (text + Excel). */
export async function parseImportFromFile(file: File): Promise<ImportResult> {
  if (isExcelFile(file.name, file.type)) {
    const { parseXlsxBuffer } = await import('./import-parser-xlsx')
    const buffer = await file.arrayBuffer()
    return parseXlsxBuffer(buffer, file.name)
  }
  const text = await file.text()
  return parseImportFile(text, file.name, file.type)
}

/** Parse upload payload for the import API (string or base64 Excel). */
export async function parseImportPayload(
  fileName: string,
  content: string,
  fileType?: string,
  encoding?: 'base64' | 'utf8',
): Promise<ImportResult> {
  if (isExcelFile(fileName, fileType) || encoding === 'base64') {
    const { parseXlsxBuffer } = await import('./import-parser-xlsx')
    const binary =
      typeof Buffer !== 'undefined'
        ? Buffer.from(content, 'base64')
        : Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
    return parseXlsxBuffer(binary, fileName)
  }
  return parseImportFile(content, fileName, fileType)
}
