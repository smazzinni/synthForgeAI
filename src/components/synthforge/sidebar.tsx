'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, LayoutDashboard, X, Zap, ArrowRight, Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Workspace, Project, Database_ } from './types'

interface SidebarProps {
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  projects: Project[]
  activeDb: Database_ | null
  sidebarOpen: boolean
  onWorkspaceChange: (ws: Workspace) => void
  onOpenDatabase: (db: Database_) => void
  onCloseSidebar: () => void
  onBackToHome: () => void
}

export const Sidebar = React.memo(function Sidebar({
  workspaces,
  activeWorkspace,
  projects,
  activeDb,
  sidebarOpen,
  onWorkspaceChange,
  onOpenDatabase,
  onCloseSidebar,
  onBackToHome,
}: SidebarProps) {
  return (
    <>
      <AnimatePresence>
        {(sidebarOpen || (typeof window !== 'undefined' && window.innerWidth >= 768)) && (
          <motion.aside
            initial={{ x: -280, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -280, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed md:relative z-40 w-64 border-r bg-card h-screen flex flex-col md:translate-x-0"
          >
            <div className="h-14 flex items-center gap-2 px-4 border-b shrink-0">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-sm">SynthForge AI</span>
              <Button variant="ghost" size="sm" className="ml-auto md:hidden h-7 w-7 p-0" onClick={onCloseSidebar} aria-label="Close sidebar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Workspaces</p>
                {workspaces.map(ws => (
                  <button
                    key={ws.id}
                    className={`w-full text-left p-2 rounded-md text-sm transition-all ${activeWorkspace?.id === ws.id ? 'bg-amber-50 font-medium text-amber-900 border border-amber-200' : 'hover:bg-amber-50/50 text-muted-foreground hover:text-foreground'}`}
                    onClick={() => onWorkspaceChange(ws)}
                  >
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      {ws.name}
                    </div>
                  </button>
                ))}
              </div>

              <Separator className="my-2" />

              <div className="p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Projects</p>
                {projects.map(proj => (
                  <div key={proj.id} className="px-2">
                    <p className="text-sm font-medium py-1">{proj.name}</p>
                    {(proj.databases || []).map(db => (
                      <motion.button
                        key={db.id}
                        whileHover={{ x: 2 }}
                        className={`w-full text-left p-2 rounded-md text-xs hover:bg-amber-50/50 transition-all flex items-center gap-2 ${activeDb?.id === db.id ? 'bg-amber-50 text-amber-900 font-medium border border-amber-200' : 'text-muted-foreground hover:text-foreground'}`}
                        onClick={() => onOpenDatabase(db)}
                        aria-label={`Open ${db.name}`}
                      >
                        <Database className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                        <span className="truncate">{db.name}</span>
                        {db._count?.datasets !== undefined && (
                          <Badge variant="secondary" className="text-[9px] ml-auto">{db._count.datasets}</Badge>
                        )}
                      </motion.button>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={onBackToHome}
              >
                <ArrowRight className="h-3 w-3 mr-1 rotate-180" /> Back to Home
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {sidebarOpen && typeof window !== 'undefined' && window.innerWidth < 768 && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={onCloseSidebar} />
      )}
    </>
  )
})
