import fs from 'fs'
import path from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const currentLevel = (process.env.LOG_LEVEL || 'info') as LogLevel
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_ROTATED_FILES = 5

function getLogPath(): string {
  return path.join(process.cwd(), 'log', 'app.log')
}

function rotateIfNeeded(): void {
  try {
    const logPath = getLogPath()
    if (!fs.existsSync(logPath)) return
    const stats = fs.statSync(logPath)
    if (stats.size < MAX_LOG_SIZE) return

    // Rotate: app.log.4 → app.log.5 (delete if > max), app.log.3 → app.log.4, etc.
    for (let i = MAX_ROTATED_FILES; i >= 1; i--) {
      const rotatedPath = `${logPath}.${i}`
      if (fs.existsSync(rotatedPath)) {
        if (i === MAX_ROTATED_FILES) {
          fs.unlinkSync(rotatedPath)
        } else {
          fs.renameSync(rotatedPath, `${logPath}.${i + 1}`)
        }
      }
    }
    fs.renameSync(logPath, `${logPath}.1`)
  } catch { /* rotation failure is non-fatal */ }
}

function writeLog(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return

  const timestamp = new Date().toISOString()
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : ''
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`

  // Console output
  switch (level) {
    case 'debug': console.debug(logLine.trim()); break
    case 'info': console.info(logLine.trim()); break
    case 'warn': console.warn(logLine.trim()); break
    case 'error': console.error(logLine.trim()); break
  }

  // File output (only in Node.js environment, not edge runtime)
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const logDir = path.join(process.cwd(), 'log')
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
      rotateIfNeeded()
      fs.appendFileSync(getLogPath(), logLine)
    }
  } catch { /* file logging failure is non-fatal */ }
}

export const logger = {
  debug: (msg: string, data?: unknown) => writeLog('debug', msg, data),
  info: (msg: string, data?: unknown) => writeLog('info', msg, data),
  warn: (msg: string, data?: unknown) => writeLog('warn', msg, data),
  error: (msg: string, data?: unknown) => writeLog('error', msg, data),
}
