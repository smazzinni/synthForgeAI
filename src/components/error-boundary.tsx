'use client'

import React from 'react'
import { AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Structured Logger ───────────────────────────────────────────
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
type LogLevel = (typeof LOG_LEVELS)[number]

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: unknown
}

function structuredLog(level: LogLevel, message: string, data?: unknown) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    data
  }

  // Console output
  switch (level) {
    case 'debug': console.debug('[SynthForge]', message, data) ; break
    case 'info': console.info('[SynthForge]', message, data) ; break
    case 'warn': console.warn('[SynthForge]', message, data) ; break
    case 'error': console.error('[SynthForge]', message, data) ; break
  }

  // Store in sessionStorage for diagnostics (keep last 50)
  try {
    const existing: LogEntry[] = JSON.parse(sessionStorage.getItem('synthforge-error-log') || '[]')
    existing.push(entry)
    sessionStorage.setItem('synthforge-error-log', JSON.stringify(existing.slice(-50)))
  } catch { /* sessionStorage unavailable */ }
}

export { structuredLog }

// ─── Error Boundary ───────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  errorCount: number
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null, errorCount: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    structuredLog('error', 'React Error Boundary caught an error', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })

    this.setState(prev => ({
      errorInfo,
      errorCount: prev.errorCount + 1
    }))
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleClearLog = () => {
    try { sessionStorage.removeItem('synthforge-error-log') } catch { /* */ }
    this.handleRetry()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-red-100 to-amber-50 flex items-center justify-center mx-auto">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                SynthForge AI encountered an unexpected error. Your data is safe — try refreshing.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-muted rounded-lg p-3 text-left">
                <p className="text-xs font-mono text-red-600 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {this.state.errorCount > 2 && (
              <p className="text-xs text-amber-600">
                Multiple errors detected. Try clearing the error log.
              </p>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={this.handleRetry}
                className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-2"
              >
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleClearLog}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" /> Clear & Retry
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Error details have been logged for diagnostics.
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
