'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  LayoutDashboard,
  FlaskConical,
  Database,
  Settings,
  Search,
  Home,
  ArrowLeft,
} from 'lucide-react'

const quickLinks = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: FlaskConical, label: 'AI Studio', href: '/dashboard/studio' },
  { icon: Database, label: 'My Databases', href: '/dashboard/databases' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
]

export default function NotFound() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/dashboard/studio?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden p-4 sm:p-6">
      {/* Animated background orbs */}
      <div className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-amber-400/15 dark:bg-amber-500/8 blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute top-40 right-10 h-96 w-96 rounded-full bg-red-400/10 dark:bg-red-500/5 blur-3xl animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
      <div className="absolute bottom-10 left-1/4 h-80 w-80 rounded-full bg-orange-400/8 dark:bg-orange-500/5 blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '4s' }} />

      <div className="relative z-10 text-center max-w-lg w-full">
        {/* Large animated 404 */}
        <h1
          className="text-8xl md:text-9xl font-extrabold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent mb-4 animate-bounce"
          style={{ animationDuration: '3s' }}
        >
          404
        </h1>

        <h2 className="text-2xl sm:text-3xl font-bold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8 text-sm sm:text-base">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Terminal illustration */}
        <div className="mb-8 mx-auto max-w-sm">
          <Card className="overflow-hidden border-border/50 shadow-lg">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/50 border-b border-border/50">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="ml-2 text-xs text-muted-foreground font-mono">synthforge-ai</span>
            </div>
            <CardContent className="p-3 font-mono text-xs text-left bg-muted/20">
              <p className="text-red-500 dark:text-red-400 font-semibold">
                ERROR 404: Page not found
              </p>
              <p className="text-muted-foreground mt-1">
                The requested resource could not be located.
              </p>
              <div className="flex items-center mt-2 text-muted-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">~</span>
                <span className="mx-1">$</span>
                <span className="inline-block h-3.5 w-1.5 bg-amber-600 dark:bg-amber-400 animate-pulse ml-0.5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="mb-8 mx-auto max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for a page..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 h-10 bg-background border-border/50 focus:border-amber-500/50 focus:ring-amber-500/20"
            />
          </div>
        </form>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 mx-auto max-w-md">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="group cursor-pointer border-border/40 hover:border-amber-500/50 hover:shadow-md transition-all duration-200">
                <CardContent className="flex flex-col items-center gap-1.5 p-3 sm:p-4">
                  <link.icon className="h-5 w-5 text-muted-foreground group-hover:text-amber-600 transition-colors duration-200" />
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                    {link.label}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white shadow-md hover:shadow-lg transition-shadow duration-200">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Go Home
            </Link>
          </Button>
          <Button variant="outline" asChild className="border-border/50 hover:border-amber-500/50 hover:text-amber-600 transition-colors duration-200">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
