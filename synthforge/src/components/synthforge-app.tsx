'use client'

import React, { useEffect, useRef, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Database, MessageSquare, Plus, Send, Sparkles, LayoutDashboard,
  Trash2, Zap, X, Check, Loader2, ArrowRight,
  PanelLeftClose, PanelLeft, Shield, RotateCcw, Gauge,
  Activity, Users, BarChart3, Clock, Layers,
  Columns3, Key, RefreshCw, Menu, Eye,
  Settings, Target, StopCircle,
  CheckCircle2, Bot, Cpu
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { structuredLog } from '@/components/error-boundary'
import { useIsMobile } from '@/hooks/use-mobile'

// Store — select individual slices to avoid re-rendering on unrelated state changes
import { useAppStore } from '@/stores/app-store'

// Hooks
import { useChat } from '@/hooks/use-chat'
import { useDatabase } from '@/hooks/use-database'
import { useExport } from '@/hooks/use-export'
import { useGraphAnalysis } from '@/hooks/use-graph-analysis'
import { useQuality } from '@/hooks/use-quality'

// Extracted components
import { ChatPanel } from '@/components/chat/chat-panel'
import { DataWorkspace } from '@/components/workspace/data-workspace'
import { QualityReport } from '@/components/quality/quality-report'

// Constants & types
import type { SchemaDef } from '@/lib/types'
import { gradientStyle, schemaTemplates } from '@/lib/constants'

// ─── Main App ──────────────────────────────────────────
export default function SynthForgeApp() {
  // BUG FIX (was Bug 2 — Maximum Update Depth):
  // Previously, `const store = useAppStore()` subscribed to the ENTIRE store, meaning
  // ANY state change caused a re-render. Combined with useEffect hooks that called
  // store setters, this created cascading re-renders and infinite loops.
  //
  // Root Cause: Subscribing to the full store + useEffect hooks that read and write
  // store state creates feedback loops. For example, the generation timer effect reads
  // store.generationStartTime and writes store.setGenerationElapsed, which triggers
  // another render, which re-runs the effect, etc.
  //
  // Fix: Select only the specific state slices needed for each piece of logic.
  // This prevents re-renders from unrelated state changes and breaks the feedback loops.

  const isMobile = useIsMobile()
  const { toast } = useToast()

  // ─── Granular store subscriptions ────────────────────────
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const activeDb = useAppStore((s) => s.activeDb)
  const messages = useAppStore((s) => s.messages)
  const isLoading = useAppStore((s) => s.isLoading)
  const isOnline = useAppStore((s) => s.isOnline)
  const setIsOnline = useAppStore((s) => s.setIsOnline)
  const isDragOver = useAppStore((s) => s.isDragOver)
  const input = useAppStore((s) => s.input)
  const setInput = useAppStore((s) => s.setInput)
  const attachedFiles = useAppStore((s) => s.attachedFiles)
  const setAttachedFiles = useAppStore((s) => s.setAttachedFiles)
  const setIsDragOver = useAppStore((s) => s.setIsDragOver)
  const agentMode = useAppStore((s) => s.agentMode)
  const setAgentMode = useAppStore((s) => s.setAgentMode)
  const generationElapsed = useAppStore((s) => s.generationElapsed)

  const totalTokens = useAppStore((s) => s.totalTokens)
  const setTotalTokens = useAppStore((s) => s.setTotalTokens)
  const showScrollToBottom = useAppStore((s) => s.showScrollToBottom)
  const setShowScrollToBottom = useAppStore((s) => s.setShowScrollToBottom)
  const isNearBottom = useAppStore((s) => s.isNearBottom)
  const setIsNearBottom = useAppStore((s) => s.setIsNearBottom)
  const sidebarOpen = useAppStore((s) => s.sidebarOpen)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const showQualityReport = useAppStore((s) => s.showQualityReport)
  const qualityReport = useAppStore((s) => s.qualityReport)
  const setShowQualityReport = useAppStore((s) => s.setShowQualityReport)
  const isQualityCheckRunning = useAppStore((s) => s.isQualityCheckRunning)
  const showNewDbDialog = useAppStore((s) => s.showNewDbDialog)
  const setShowNewDbDialog = useAppStore((s) => s.setShowNewDbDialog)
  const newDbName = useAppStore((s) => s.newDbName)
  const setNewDbName = useAppStore((s) => s.setNewDbName)
  const newDbSchema = useAppStore((s) => s.newDbSchema)
  const setNewDbSchema = useAppStore((s) => s.setNewDbSchema)
  const workspaces = useAppStore((s) => s.workspaces)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputValueRef = useRef<string>('')

  // Hooks
  const { sendMessage, handleAbort, handleRetry, handleRegenerate, handleSubmit, regenerateTable } = useChat()
  const { allDatabases, loadWorkspaces, loadProjects, openDatabase, createDatabase, deleteDatabase } = useDatabase()
  const { exportData, exportTable, copyTable, copyAllData, copyToClipboard } = useExport()
  const { runQualityCheck } = useQuality()

  // Computed values — memoized to prevent unnecessary recalculations
  const getTablesFromMessages = useMemo((): Record<string, Record<string, unknown>[]> => {
    const allTables: Record<string, Record<string, unknown>[]> = {}
    if (activeDb?.dataJson) {
      try {
        const dbData = JSON.parse(activeDb.dataJson)
        if (dbData && typeof dbData === 'object') {
          for (const [k, v] of Object.entries(dbData)) {
            if (Array.isArray(v)) allTables[k] = v
          }
        }
      } catch { /* */ }
    }
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        try {
          const tables = JSON.parse(msg.tablesJson || '{}')
          for (const [k, v] of Object.entries(tables)) {
            if (Array.isArray(v)) allTables[k] = v
          }
        } catch { /* */ }
      }
    }
    return allTables
  }, [activeDb?.dataJson, messages])

  const getSchemaFromDb = useMemo((): Record<string, SchemaDef> => {
    if (!activeDb?.schemaJson) return {}
    try {
      return JSON.parse(activeDb.schemaJson)
    } catch { return {} }
  }, [activeDb?.schemaJson])

  const graphAnalysis = useGraphAnalysis(getTablesFromMessages, getSchemaFromDb)

  // ─── Floating chat widget state ────────────────────────
  const [dashChatOpen, setDashChatOpen] = React.useState(false)
  const [dashChatInput, setDashChatInput] = React.useState('')

  // ─── Network status tracking ────────────────────────
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); structuredLog('info', 'Network back online') }
    const handleOffline = () => { setIsOnline(false); structuredLog('warn', 'Network went offline') }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setIsOnline])

  // Load workspaces on mount — only once
  useEffect(() => { loadWorkspaces() }, [loadWorkspaces])

  // ─── Smart auto-scroll ──────────────────────────────
  useEffect(() => {
    if (isNearBottom && chatScrollRef.current) {
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
        }
      })
    }
  }, [messages, isLoading, isNearBottom])

  // Track scroll position
  useEffect(() => {
    const scrollContainer = chatScrollRef.current
    if (!scrollContainer) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const nearBottom = scrollHeight - scrollTop - clientHeight < 150
      setIsNearBottom(nearBottom)
      setShowScrollToBottom(!nearBottom)
    }
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [view, setIsNearBottom, setShowScrollToBottom])

  // Track total tokens — only recalculate when messages change
  useEffect(() => {
    const total = messages.reduce((sum, m) => sum + m.tokensIn + m.tokensOut, 0)
    setTotalTokens(total)
  }, [messages, setTotalTokens])

  // BUG FIX: Removed duplicate escape key handler — useChat already handles this.
  // Previously both this component and use-chat.ts registered an escape key handler,
  // which could cause double-abort or race conditions.

  // Generation time tracking is handled by use-chat.ts hook — no duplicate timer here (Bug 1 fix).

  const scrollToBottom = useCallback(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // ═══════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen flex flex-col bg-white overflow-x-hidden">
        <style>{gradientStyle}</style>
        <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center"><Zap className="h-5 w-5 text-white" /></div><span className="text-xl font-bold tracking-tight">SynthForge AI</span></div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground"><button className="hover:text-foreground transition-colors">Features</button><button className="hover:text-foreground transition-colors">Pricing</button><button className="hover:text-foreground transition-colors">Docs</button></div>
            <div className="flex items-center gap-3"><Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>Dashboard</Button><motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}><Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>Get Started Free</Button></motion.div></div>
          </div>
        </motion.nav>
        <main className="flex-1">
          <section className="relative overflow-hidden">
            <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(135deg, #f59e0b15, #ef444415, #f59e0b15, #8b5cf615)', backgroundSize: '400% 400%', animation: 'gradientShift 15s ease infinite' }} />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-32">
              <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7 }} className="text-center max-w-3xl mx-auto">
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.2 }} className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
                  <Sparkles className="h-4 w-4" /> Powered by Advanced AI Agents
                </motion.div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">Generate <span className="bg-gradient-to-r from-amber-600 to-red-700 bg-clip-text text-transparent">Realistic Synthetic Data</span> with AI</h1>
                <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">Describe your data needs in plain English. Our multi-agent AI system generates production-quality synthetic data with referential integrity, constraints, and realistic distributions.</p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white text-base px-8 h-12" onClick={() => setView('dashboard')}>
                      Start Generating <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </motion.div>
                  <Button variant="outline" size="lg" className="text-base px-8 h-12">Watch Demo</Button>
                </div>
              </motion.div>
            </div>
          </section>
          <section className="py-20 bg-muted/30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12"><h2 className="text-3xl font-bold mb-4">How It Works</h2><p className="text-muted-foreground max-w-2xl mx-auto">Three simple steps to generate production-quality synthetic data</p></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { icon: <MessageSquare className="h-8 w-8 text-amber-600" />, title: '1. Describe', desc: 'Tell our AI what data you need in plain English. Specify tables, relationships, and constraints.' },
                  { icon: <Bot className="h-8 w-8 text-red-600" />, title: '2. AI Generates', desc: 'Our multi-agent system plans, generates, and validates realistic synthetic data with referential integrity.' },
                  { icon: <Database className="h-8 w-8 text-amber-600" />, title: '3. Export', desc: 'Download your data as JSON, CSV, SQL, or use it directly. Perfect for testing, development, and demos.' }
                ].map((step, i) => (
                  <motion.div key={i} initial={{ y: 20, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.15 }} viewport={{ once: true }}>
                    <Card className="text-center h-full hover:shadow-lg transition-shadow"><CardContent className="pt-8 pb-6"><div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-red-50">{step.icon}</div><h3 className="text-lg font-semibold mb-2">{step.title}</h3><p className="text-sm text-muted-foreground">{step.desc}</p></CardContent></Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
          <section className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12"><h2 className="text-3xl font-bold mb-4">Key Features</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { icon: <Shield className="h-6 w-6" />, title: 'PII Protection', desc: 'Automatic detection and masking of personally identifiable information' },
                  { icon: <Gauge className="h-6 w-6" />, title: 'Quality Scoring', desc: 'Real-time data quality analysis with auto-fix capabilities' },
                  { icon: <Layers className="h-6 w-6" />, title: 'Multi-Table Support', desc: 'Generate related tables with proper foreign keys and constraints' },
                  { icon: <Activity className="h-6 w-6" />, title: 'Agent Pipeline', desc: 'Watch AI agents plan, execute, and validate in real-time' },
                  { icon: <RotateCcw className="h-6 w-6" />, title: 'Iterative Refinement', desc: 'Chat with the AI to refine and improve generated data' },
                  { icon: <Columns3 className="h-6 w-6" />, title: 'SQL Playground', desc: 'Query your generated data with a built-in SQL editor' }
                ].map((feature, i) => (
                  <motion.div key={i} initial={{ y: 15, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }}>
                    <Card className="h-full hover:shadow-md hover:border-amber-200 transition-all"><CardContent className="pt-6"><div className="flex items-center gap-3 mb-3"><div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center text-amber-700">{feature.icon}</div><h3 className="font-semibold">{feature.title}</h3></div><p className="text-sm text-muted-foreground">{feature.desc}</p></CardContent></Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>
        </main>
        <footer className="border-t py-8 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2"><div className="h-6 w-6 rounded-md bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center"><Zap className="h-3 w-3 text-white" /></div><span className="text-sm font-semibold">SynthForge AI</span></div>
            <p className="text-xs text-muted-foreground">&copy; 2024 SynthForge. Built with AI.</p>
          </div>
        </footer>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD
  // ═══════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-muted/20">
        <header className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={() => setView('landing')}><Zap className="h-4 w-4" /><span className="hidden sm:inline">SynthForge</span></Button>
              <Separator orientation="vertical" className="h-5" />
              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Dashboard</span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1.5" onClick={() => setShowNewDbDialog(true)}><Plus className="h-3.5 w-3.5" /> New Database</Button>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { icon: <Database className="h-5 w-5" />, label: 'Databases', value: allDatabases?.length ?? 0, color: 'text-amber-700' },
              { icon: <BarChart3 className="h-5 w-5" />, label: 'Total Tables', value: Object.keys(getSchemaFromDb).length, color: 'text-red-700' },
              { icon: <Users className="h-5 w-5" />, label: 'Workspaces', value: workspaces.length, color: 'text-amber-700' },
              { icon: <Activity className="h-5 w-5" />, label: 'Conversations', value: messages.length, color: 'text-red-700' }
            ].map((stat, i) => (
              <Card key={i}><CardContent className="p-4 flex items-center gap-3"><div className={`h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center ${stat.color}`}>{stat.icon}</div><div><p className="text-[11px] text-muted-foreground">{stat.label}</p><p className="text-xl font-bold">{stat.value}</p></div></CardContent></Card>
            ))}
          </div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Databases</h2>
          </div>
          {allDatabases && allDatabases.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allDatabases.map((dbItem: { id: string; name: string; dbType: string; schemaJson: string; updatedAt: string }) => {
                let tableCount = 0
                try { tableCount = Object.keys(JSON.parse(dbItem.schemaJson || '{}')).length } catch { /* */ }
                return (
                  <motion.div key={dbItem.id} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                    <Card className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all" onClick={() => openDatabase(dbItem)}>
                      <CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-sm font-semibold">{dbItem.name}</CardTitle><Badge variant="secondary" className="text-[10px]">{dbItem.dbType}</Badge></div></CardHeader>
                      <CardContent><div className="flex items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{tableCount} tables</span><span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(dbItem.updatedAt).toLocaleDateString()}</span></div></CardContent>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Database className="h-8 w-8 text-amber-700/50" /></div>
              <p className="text-sm font-medium text-muted-foreground mb-1">No databases yet</p>
              <p className="text-xs text-muted-foreground mb-4">Create your first database to start generating synthetic data</p>
              <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1.5" onClick={() => setShowNewDbDialog(true)}><Plus className="h-3.5 w-3.5" /> Create Database</Button>
            </motion.div>
          )}
        </main>

        {/* New Database Dialog */}
        <Dialog open={showNewDbDialog} onOpenChange={setShowNewDbDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Create New Database</DialogTitle><DialogDescription>Set up a new database for synthetic data generation</DialogDescription></DialogHeader>
            <div className="space-y-4 py-2">
              <div><label className="text-sm font-medium mb-1.5 block">Name</label><Input placeholder="e.g., E-Commerce DB" value={newDbName} onChange={(e) => setNewDbName(e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1.5 block">Schema (optional JSON)</label><Input placeholder='{"users": {"columns": {"id": "SERIAL", "name": "VARCHAR"}}}' value={newDbSchema} onChange={(e) => setNewDbSchema(e.target.value)} /></div>
              <div><label className="text-sm font-medium mb-1.5 block">Quick Start Template</label>
                <div className="grid grid-cols-2 gap-2">
                  {schemaTemplates.slice(0, 4).map(tmpl => (
                    <button key={tmpl.name} className="text-left p-2 rounded-md border hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-xs" onClick={() => { setNewDbSchema(JSON.stringify(tmpl.schema)); setNewDbName(tmpl.name) }}>
                      <span className="font-medium">{tmpl.name}</span><br /><span className="text-muted-foreground">{tmpl.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => createDatabase(newDbName, newDbSchema)} disabled={!newDbName.trim()}>Create Database</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating AI Chat Widget */}
        <div className="fixed bottom-4 right-4 z-50">
          {dashChatOpen ? (
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="w-80 sm:w-96 bg-background border border-amber-200 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-amber-600 to-red-700 text-white">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4" /><span className="text-sm font-semibold">SynthForge AI</span></div>
                <button onClick={() => setDashChatOpen(false)} className="hover:bg-white/20 rounded p-0.5 transition-colors" aria-label="Close chat"><X className="h-4 w-4" /></button>
              </div>
              <div className="h-48 overflow-y-auto p-3 space-y-2 chat-scroll-area">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Ask me anything about data generation!</p>
                ) : (
                  messages.slice(-3).map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${msg.role === 'user' ? 'bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                        {msg.role === 'assistant' ? (() => { try { const p = JSON.parse(msg.content.match(/\{[\s\S]*\}/)?.[0] || '{}'); return p.explanation || msg.content.slice(0, 100) } catch { return msg.content.slice(0, 100) } })() : msg.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t p-2 flex items-center gap-2">
                <input value={dashChatInput} onChange={(e) => setDashChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && dashChatInput.trim()) { e.preventDefault(); sendMessage(dashChatInput.trim()); setDashChatInput('') } }} placeholder="Ask about data..." className="flex-1 text-xs px-2.5 py-1.5 border rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 bg-background" aria-label="Chat message input" />
                <Button size="sm" className="h-7 w-7 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0" onClick={() => { if (dashChatInput.trim()) { sendMessage(dashChatInput.trim()); setDashChatInput('') } }} disabled={!dashChatInput.trim() || isLoading} aria-label="Send message"><Send className="h-3 w-3" /></Button>
              </div>
            </motion.div>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button className="h-12 w-12 rounded-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shadow-lg shadow-amber-200" onClick={() => setDashChatOpen(true)} aria-label="Open AI chat">
                <MessageSquare className="h-5 w-5" />
              </Button>
            </motion.div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // STUDIO VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'studio' && activeDb) {
    return (
      <div className="h-screen flex flex-col bg-background">
        {/* Studio Header */}
        <header className="border-b bg-background/95 backdrop-blur-sm shrink-0 z-40">
          <div className="flex items-center justify-between px-3 h-11">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setView('dashboard')} aria-label="Back to dashboard"><LayoutDashboard className="h-3.5 w-3.5" /></Button>
              <Separator orientation="vertical" className="h-4" />
              <div className="h-5 w-5 rounded bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center"><Zap className="h-3 w-3 text-white" /></div>
              <span className="text-sm font-semibold truncate max-w-[120px]">{activeDb.name}</span>
              <Badge variant="outline" className="text-[9px]">{activeDb.dbType}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] gap-1"><Cpu className="h-2.5 w-2.5" />{agentMode}</Badge>
              <Select value={agentMode} onValueChange={(v) => setAgentMode(v as 'plan' | 'execute' | 'auto')}>
                <SelectTrigger className="h-6 w-16 text-[9px] px-1.5 border-none"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">Auto</SelectItem><SelectItem value="plan">Plan</SelectItem><SelectItem value="execute">Execute</SelectItem></SelectContent>
              </Select>
              {totalTokens > 0 && (<Badge variant="secondary" className="text-[9px] gap-1"><Activity className="h-2.5 w-2.5" />{totalTokens} tok</Badge>)}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </header>

        {/* Studio Body */}
        <div className="flex-1 flex overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={40} minSize={25} maxSize={60}>
              <ChatPanel
                messages={messages}
                isLoading={isLoading}
                isOnline={isOnline}
                isDragOver={isDragOver}
                input={input}
                attachedFiles={attachedFiles}
                generationElapsed={generationElapsed}
                showScrollToBottom={showScrollToBottom}
                chatScrollRef={chatScrollRef}
                chatInputRef={chatInputRef}
                fileInputRef={fileInputRef}
                inputValueRef={inputValueRef}
                messagesEndRef={messagesEndRef}
                onSendMessage={sendMessage}
                onHandleSubmit={handleSubmit}
                onHandleAbort={handleAbort}
                onHandleRetry={handleRetry}
                onHandleRegenerate={handleRegenerate}
                onSetInput={setInput}
                onSetAttachedFiles={setAttachedFiles}
                onSetIsDragOver={setIsDragOver}
                onCopyToClipboard={copyToClipboard}
                onExportData={exportData}
                onCopyAllData={copyAllData}
                allTables={getTablesFromMessages}
                onScrollToBottom={scrollToBottom}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={60} minSize={30}>
              <DataWorkspace
                allTables={getTablesFromMessages}
                schemaObj={getSchemaFromDb}
                onSendMessage={sendMessage}
                onExportData={exportData}
                onExportTable={exportTable}
                onCopyTable={copyTable}
                onCopyAllData={copyAllData}
                onRegenerateTable={regenerateTable}
                onRunQualityCheck={runQualityCheck}
                onSetMobileStudioTab={useAppStore.getState().setMobileStudioTab}
                graphAnalysis={graphAnalysis}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* Quality Report Modal */}
        {showQualityReport && qualityReport && (
          <QualityReport qualityReport={qualityReport} showQualityReport={showQualityReport} setShowQualityReport={setShowQualityReport} onAutoFix={() => runQualityCheck(true)} isQualityCheckRunning={isQualityCheckRunning} />
        )}
      </div>
    )
  }

  // BUG FIX: Redirect to dashboard when studio view has no active DB.
  // Previously, this called setView during render, which caused infinite re-renders.
  // Now we use useEffect to defer the state update.
  useEffect(() => {
    if (view === 'studio' && !activeDb) {
      setView('dashboard')
    }
  }, [view, activeDb, setView])

  if (view === 'studio' && !activeDb) {
    return null
  }

  return null
}
