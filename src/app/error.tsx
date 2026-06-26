'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RotateCcw, Home, ExternalLink } from 'lucide-react'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden p-4 sm:p-6">
      {/* Animated background orbs — red/rose tones */}
      <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-red-400/15 dark:bg-red-500/8 blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
      <div className="absolute top-40 right-10 h-96 w-96 rounded-full bg-rose-400/10 dark:bg-rose-500/5 blur-3xl animate-pulse" style={{ animationDuration: '11s', animationDelay: '2s' }} />
      <div className="absolute bottom-10 left-1/4 h-80 w-80 rounded-full bg-pink-400/8 dark:bg-pink-500/5 blur-3xl animate-pulse" style={{ animationDuration: '9s', animationDelay: '4s' }} />

      <div className="relative z-10 text-center max-w-lg w-full">
        {/* Large animated 500 */}
        <h1
          className="text-8xl md:text-9xl font-extrabold bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent mb-4 animate-bounce"
          style={{ animationDuration: '3s' }}
        >
          500
        </h1>

        <h2 className="text-2xl sm:text-3xl font-bold mb-2">Something Went Wrong</h2>
        <p className="text-muted-foreground mb-8 text-sm sm:text-base">
          An unexpected error occurred. Our team has been notified and is working on a fix.
        </p>

        {/* Terminal illustration with stack trace */}
        <div className="mb-8 mx-auto max-w-sm">
          <Card className="overflow-hidden border-border/50 shadow-lg">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/50 border-b border-border/50">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">synthforge-ai — error</span>
            </div>
            <CardContent className="p-3 font-mono text-xs text-left bg-muted/20">
              <p className="text-red-500 dark:text-red-400 font-semibold">
                INTERNAL_SERVER_ERROR
              </p>
              <div className="mt-1.5 text-muted-foreground/60 space-y-0.5">
                <p>at processRequest (server.ts:142:8)</p>
                <p>at handleRoute (router.ts:89:12)</p>
                <p>at middleware (auth.ts:34:5)</p>
              </div>
              <div className="flex items-center mt-2 text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">~</span>
                <span className="mx-1">$</span>
                <span className="inline-block h-3.5 w-1.5 bg-red-500 dark:bg-red-400 animate-pulse ml-0.5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error details card */}
        {error?.message && (
          <div className="mb-8 mx-auto max-w-sm">
            <Card className="overflow-hidden border-red-500/30 bg-red-500/5">
              <CardContent className="p-3 font-mono text-xs text-left">
                <p className="text-red-600 dark:text-red-400 font-semibold mb-1">Error Details</p>
                <p className="text-muted-foreground break-words">{error.message}</p>
                {error.digest && (
                  <p className="text-muted-foreground/50 mt-1 text-[10px]">
                    Digest: {error.digest}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            onClick={reset}
            className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-md hover:shadow-lg transition-shadow duration-200"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" asChild className="border-border/50 hover:border-red-500/50 hover:text-red-600 transition-colors duration-200">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
          <Button variant="outline" asChild className="border-border/50 hover:border-rose-500/50 hover:text-rose-600 transition-colors duration-200">
            <a
              href="https://github.com/smazzinni/synthForgeAI/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Report Issue
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
