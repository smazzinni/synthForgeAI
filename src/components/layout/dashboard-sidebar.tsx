'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Zap,
  Plus,
  LayoutDashboard,
  FlaskConical,
  Database,
  FolderKanban,
  PlugZap,
  KeyRound,
  Settings,
  Moon,
  Sun,
  LogOut,
  ChevronDown,
} from 'lucide-react'

const mainLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/studio', label: 'AI Studio', icon: FlaskConical },
  { href: '/dashboard/databases', label: 'My Databases', icon: Database },
  { href: '/dashboard/workspaces', label: 'Workspaces', icon: FolderKanban },
]

const toolLinks = [
  { href: '/dashboard/connections', label: 'DB Connections', icon: PlugZap },
  { href: '/dashboard/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

export function DashboardSidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
  }

  const renderLink = (link: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname?.startsWith(link.href))
    const Icon = link.icon
    return (
      <Link
        key={link.href}
        href={link.href}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
          isActive
            ? 'border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 pl-[10px]'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground hover:scale-[1.01] active:scale-[0.99]'
        }`}
      >
        <Icon className="h-4 w-4" />
        {link.label}
      </Link>
    )
  }

  return (
    <div className="flex flex-col h-full w-64 border-r bg-card">
      {/* Logo Header */}
      <div className="p-4 border-b">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold">SynthForge<span className="text-amber-600">AI</span></span>
        </Link>
      </div>

      {/* Quick Create Button */}
      <div className="px-3 pt-3 pb-1">
        <Button
          asChild
          className="w-full h-9 bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-600 hover:to-red-700 text-white text-sm font-medium"
        >
          <Link href="/dashboard/studio" onClick={onNavigate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Database
          </Link>
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="px-2 space-y-1">
          {mainLinks.map(renderLink)}
        </nav>

        <div className="px-3 py-2">
          <Separator />
        </div>

        <div className="px-3 pb-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Tools</span>
        </div>
        <nav className="px-2 space-y-1">
          {toolLinks.map(renderLink)}
        </nav>
      </ScrollArea>

      {/* User Footer */}
      <div className="border-t p-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-gradient-to-br from-amber-500 to-red-600 text-white text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-0">
                Free Plan
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user?.email || 'Local Mode'}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
