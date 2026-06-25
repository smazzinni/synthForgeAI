'use client'

import { useState, useCallback } from 'react'
import { Bell, Check, Info, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from 'sonner'

type NotificationType = 'success' | 'info' | 'warning' | 'error'

interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  time: string
  read: boolean
}

const STORAGE_KEY = 'synthforge_notifications'

const seedNotifications: Notification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Database generated successfully',
    description: 'E-commerce database with 5 tables created',
    time: '5m ago',
    read: false,
  },
  {
    id: '2',
    type: 'info',
    title: 'New connection added',
    description: 'Supabase Test connection configured',
    time: '1h ago',
    read: false,
  },
  {
    id: '3',
    type: 'success',
    title: 'Quality check passed',
    description: 'All generated data passed quality validation',
    time: '2h ago',
    read: false,
  },
  {
    id: '4',
    type: 'info',
    title: 'API key created',
    description: "New API key 'production-key' was created",
    time: '1d ago',
    read: true,
  },
  {
    id: '5',
    type: 'info',
    title: 'Weekly summary ready',
    description: 'Your weekly usage report is available',
    time: '3d ago',
    read: true,
  },
]

function getNotifications(): Notification[] {
  if (typeof window === 'undefined') return seedNotifications
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
    // Seed on first visit
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedNotifications))
    return seedNotifications
  } catch {
    return seedNotifications
  }
}

function saveNotifications(notifications: Notification[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
  } catch {
    // ignore storage errors
  }
}

const typeConfig: Record<NotificationType, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  info: { icon: Info, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  warning: { icon: AlertTriangle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  error: { icon: X, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>(() => getNotifications())
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      saveNotifications(updated)
      const notification = updated.find((n) => n.id === id)
      if (notification) {
        toast(notification.title, {
          description: notification.description,
        })
      }
      return updated
    })
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }))
      saveNotifications(updated)
      return updated
    })
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between p-3 pb-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Notifications</h4>
            {unreadCount > 0 && (
              <Badge className="bg-red-500 text-white text-[10px] h-5 px-1.5 border-0">
                {unreadCount}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={markAllRead}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <Separator />

        {/* Notification List */}
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification, index) => {
                const config = typeConfig[notification.type]
                const Icon = config.icon
                return (
                  <div key={notification.id}>
                    <button
                      className={`w-full text-left flex items-start gap-3 p-3 transition-colors hover:bg-accent/50 ${
                        !notification.read ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${config.bg}`}>
                        <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <span className="mt-1 shrink-0 h-2 w-2 rounded-full bg-amber-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {notification.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {notification.time}
                        </p>
                      </div>
                    </button>
                    {index < notifications.length - 1 && <Separator />}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <Separator />
        {/* Footer */}
        <div className="p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
            onClick={() => setOpen(false)}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
