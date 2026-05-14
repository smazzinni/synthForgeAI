'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, ArrowRight, Sparkles } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 dark:from-primary/10 dark:via-transparent dark:to-purple-500/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 sm:pt-32 sm:pb-24">
        <div className="text-center max-w-3xl mx-auto">
          {/* Badge */}
          <div className="mb-6 flex justify-center">
            <Badge variant="secondary" className="px-4 py-1.5 text-sm gap-2 border-primary/20 bg-primary/5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Powered by Advanced AI
            </Badge>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
            AI-Powered{' '}
            <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Synthetic Data
            </span>{' '}
            Generation
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Generate realistic, privacy-safe synthetic databases with AI. Design schemas, validate quality, and create production-ready test data in minutes — not days.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-12 px-8 text-base gap-2" asChild>
              <Link href="/signup">
                Start for Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" asChild>
              <Link href="/dashboard/studio">Try Live Demo</Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div>
              <p className="text-2xl sm:text-3xl font-bold">50K+</p>
              <p className="text-sm text-muted-foreground">Databases Created</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold">99.2%</p>
              <p className="text-sm text-muted-foreground">Quality Score</p>
            </div>
            <div>
              <p className="text-2xl sm:text-3xl font-bold">10x</p>
              <p className="text-sm text-muted-foreground">Faster than Manual</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
