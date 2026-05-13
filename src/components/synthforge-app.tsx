'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, MessageSquare, Plus, Send, ChevronRight, ChevronDown,
  Table2, Download, Copy, Sparkles, LayoutDashboard,
  Code2, FileJson, FileText, Trash2, Zap, Upload, X, Check,
  Loader2, ArrowRight, Hash, Paperclip, Play, FolderTree,
  Brain, Wand2, AlertCircle, Circle,
  Columns3, Key, Link2, RefreshCw, Menu, Eye, EyeOff,
  PanelLeftClose, PanelLeft, Shield, RotateCcw, Gauge, GitBranch,
  Activity, Users, BarChart3, Clock, Settings,
  FileDown, ClipboardCheck, Rows3, Target, Network, StopCircle,
  WifiOff, ArrowDown, CheckCircle2, XCircle, Ban, HelpCircle,
  AlignLeft, Terminal, ZoomIn, ZoomOut, Maximize2, Move,
  GitFork, Sitemap, Search, AlertTriangle, ListOrdered,
  Wrench, Bug, CheckCheck, Clock3, Bot, Cpu
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useToast } from '@/hooks/use-toast'
import { structuredLog } from '@/components/error-boundary'

// ─── Types ─────────────────────────────────────────────
interface Workspace { id: string; name: string; slug: string; agentInstructions: string }
interface Project { id: string; name: string; description: string; workspaceId: string; databases?: Database_[] }
interface Database_ { id: string; name: string; dbType: string; schemaJson: string; dataJson: string; projectId: string; updatedAt: string; _count?: { datasets: number; conversations: number } }
interface QualityScore { overall: number; breakdown: { completeness: number; uniqueness: number; distribution: number; referentialIntegrity: number } }
interface PIICheck { hasPII: boolean; findings: { type: string; field: string; count: number }[] }
interface Message {
  id: string
  role: string
  content: string
  sqlCode: string
  tokensIn: number
  tokensOut: number
  cost: number
  createdAt: string
  agentName: string
  reasoningSteps: string
  options: string
  tablesJson: string
  qualityScore?: QualityScore | null
  piiCheck?: PIICheck | null
  schemaVersion?: number
  isError?: boolean
  isStreaming?: boolean
  isCancelled?: boolean
  generationStatus?: 'thinking' | 'generating' | 'completed' | 'failed' | 'cancelled'
}
interface Conversation { id: string; title: string; messages: Message[] }

interface ReasoningStep {
  type: 'intent' | 'domain_detection' | 'entity_extraction' | 'relationship_mapping' | 'constraint_planning' | 'data_strategy' | 'validation' | 'execution' | 'reflection'
  label: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
}

interface ClarificationOption {
  id: string
  label: string
  value: string
  description?: string
}

interface AgentStepUI {
  agent: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  tables?: string[]
}

interface QualityReportData {
  overallScore: number
  totalTables: number
  totalRows: number
  totalIssues: number
  criticalCount: number
  warningCount: number
  infoCount: number
  tables: { table: string; rowCount: number; columnCount: number; score: number; issues: { table: string; column?: string; type: string; severity: string; message: string; count: number; recoverable: boolean }[] }[]
  fixesApplied: number
  fixDetails: { table: string; column?: string; type: string; severity: string; message: string; count: number; recoverable: boolean; before?: unknown; after?: unknown }[]
}

type View = 'landing' | 'dashboard' | 'studio'
type AgentMode = 'plan' | 'execute' | 'auto'

// ─── Animation Variants ────────────────────────────────
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
}

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 }
  }
}

const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 }
}

const messageSlideIn = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
}

// ─── Animated Dots Component ───────────────────────────
function AnimatedDots() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '.' : prev + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])
  return <span>{dots}</span>
}

// ─── Gradient background animation keyframes ──────────
const gradientStyle = `
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
`

// ─── React.memo TableTreeView ───────────────────────────────
const TableTreeView = React.memo(function TableTreeView({
  tableNames,
  tableRowCounts,
  selectedTable,
  onSelectTable
}: {
  tableNames: string[]
  tableRowCounts: Record<string, number>
  selectedTable: string | null
  onSelectTable: (name: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border rounded-lg bg-card">
      <button
        className="flex items-center gap-2 w-full p-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FolderTree className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-xs font-semibold">Tables</span>
        <Badge variant="secondary" className="text-[10px] ml-auto">{tableNames.length}</Badge>
      </button>
      {expanded && (
        <div className="border-t">
          {tableNames.length === 0 ? (
            <p className="text-[10px] text-muted-foreground p-2 text-center">No tables yet</p>
          ) : (
            tableNames.map(name => (
              <button
                key={name}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors text-left ${
                  selectedTable === name ? 'bg-amber-50 text-amber-900 border-l-2 border-amber-600' : ''
                }`}
                onClick={() => onSelectTable(name)}
              >
                <Table2 className="h-3 w-3 text-amber-700 shrink-0" />
                <span className="truncate flex-1">{name}</span>
                {tableRowCounts[name] !== undefined && (
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">{tableRowCounts[name]}</Badge>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
})

// ─── React.memo DataTable (with lazy loading) ──────────────────
const DataTable = React.memo(function DataTable({
  tableName,
  allRows,
  schemaObj,
  onRegenerate,
  isLoading,
  onExportTable,
  onCopyTable,
  initialPageSize
}: {
  tableName: string
  allRows: Record<string, unknown>[]
  schemaObj: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  onRegenerate: (name: string) => void
  isLoading: boolean
  onExportTable: (name: string, rows: Record<string, unknown>[], format: string) => void
  onCopyTable: (name: string, rows: Record<string, unknown>[]) => void
  initialPageSize?: number
}) {
  const [page, setPage] = useState(0)
  const [visibleCount, setVisibleCount] = useState(initialPageSize ?? 50)
  const pageSize = 20
  const visibleRows = allRows.slice(0, visibleCount)
  const hasMore = visibleCount < allRows.length
  const totalPages = Math.ceil(visibleRows.length / pageSize)
  const startIdx = page * pageSize
  const pageRows = visibleRows.slice(startIdx, startIdx + pageSize)
  const tableSchema = schemaObj[tableName]

  const getColumnType = (colName: string): string => {
    if (tableSchema?.columns?.[colName]) return tableSchema.columns[colName]
    if (colName === 'id') return 'PK'
    if (colName.endsWith('_id')) return 'FK'
    return ''
  }

  const columnTypeColor = (colType: string): string => {
    if (!colType) return ''
    if (colType === 'PK' || colType.includes('SERIAL') || colType.includes('PRIMARY')) return 'bg-amber-100 text-amber-800'
    if (colType === 'FK' || colType.includes('REFERENCES') || colType.includes('INTEGER')) return 'bg-sky-100 text-sky-800'
    if (colType.includes('VARCHAR') || colType.includes('TEXT')) return 'bg-emerald-100 text-emerald-800'
    if (colType.includes('DECIMAL') || colType.includes('FLOAT') || colType.includes('NUMERIC')) return 'bg-purple-100 text-purple-800'
    if (colType.includes('TIMESTAMP') || colType.includes('DATE')) return 'bg-orange-100 text-orange-800'
    if (colType.includes('BOOLEAN') || colType.includes('BOOL')) return 'bg-pink-100 text-pink-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Table2 className="h-4 w-4 text-amber-700" />
            {tableName}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-amber-50"
                    onClick={() => onCopyTable(tableName, allRows)}
                    aria-label={`Copy ${tableName} data`}
                  >
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy table data</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-amber-50" aria-label={`Export ${tableName}`}>
                  <Download className="h-3 w-3 text-amber-700" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'json')}>
                  <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'csv')}>
                  <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'sql-insert')}>
                  <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onExportTable(tableName, allRows, 'sql-full')}>
                  <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:bg-amber-50"
                    onClick={() => onRegenerate(tableName)}
                    disabled={isLoading}
                    aria-label={`Regenerate ${tableName}`}
                  >
                    <RotateCcw className="h-3 w-3 text-amber-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Regenerate {tableName}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="text-xs">{allRows.length} rows</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {pageRows.length > 0 ? (
          <ScrollArea className="max-h-80">
            <table className="w-full text-xs" role="table">
              <thead>
                <tr className="border-b bg-muted/30 sticky top-0">
                  {Object.keys(pageRows[0]).map(key => {
                    const colType = getColumnType(key)
                    return (
                      <th key={key} className="text-left py-1.5 px-2 whitespace-nowrap" scope="col">
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">{key}</span>
                          {colType && (
                            <Badge className={`text-[8px] px-1 py-0 h-3.5 font-mono ${columnTypeColor(colType)}`}>
                              {colType === 'PK' ? 'PK' : colType === 'FK' ? 'FK' : colType.split('(')[0]}
                            </Badge>
                          )}
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-amber-50/30 transition-colors">
                    {Object.entries(row).map(([key, val], j) => {
                      const colType = getColumnType(key)
                      const isPK = colType === 'PK' || key === 'id'
                      const isFK = colType === 'FK' || key.endsWith('_id')
                      return (
                        <td key={j} className={`py-1.5 px-2 whitespace-nowrap max-w-[200px] truncate ${isPK ? 'font-mono font-semibold text-amber-700' : isFK ? 'font-mono text-sky-700' : ''}`}>
                          {val === null ? <span className="text-muted-foreground italic">null</span> : String(val)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-2 border-t">
                <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Previous page">
                    Prev
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} aria-label="Next page">
                    Next
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        ) : (
          <p className="text-xs text-muted-foreground">No data rows</p>
        )}
        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setVisibleCount(prev => prev + 50)}
            >
              <ArrowDown className="h-3 w-3 mr-1" />
              Load More ({allRows.length - visibleCount} remaining)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
})

// ─── React.memo SchemaCard ───────────────────────────────
const SchemaCard = React.memo(function SchemaCard({ tableName, columns }: { tableName: string; columns: Record<string, string> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Table2 className="h-4 w-4 text-amber-700" />
          {tableName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-48">
          <div className="space-y-1">
            {Object.entries(columns).map(([colName, colType]) => (
              <div key={colName} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0 hover:bg-muted/30 px-1 rounded">
                <div className="flex items-center gap-2">
                  {colName.toLowerCase() === 'id' && <Key className="h-3 w-3 text-amber-600" />}
                  {colName.toLowerCase().endsWith('_id') && <Link2 className="h-3 w-3 text-sky-500" />}
                  <span className="font-mono font-medium">{colName}</span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">{colType}</Badge>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
})

// ─── React.memo ChatInputBox ───────────────────────────────
const ChatInputBox = React.memo(function ChatInputBox({
  onSend,
  isLoading,
  onAbort,
  attachedFiles,
  onRemoveFile,
  onFileUpload,
  fileInputRef
}: {
  onSend: (message: string, files: { name: string; content: string; type: string }[]) => void
  isLoading: boolean
  onAbort: () => void
  attachedFiles: { name: string; content: string; type: string }[]
  onRemoveFile: (index: number) => void
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const msgText = inputValue.trim()
    if (!msgText && attachedFiles.length === 0) return
    onSend(msgText, attachedFiles)
    setInputValue('')
  }, [inputValue, attachedFiles, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="border-t bg-background p-2.5 shrink-0">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {attachedFiles.map((file, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-1.5">
              <Paperclip className="h-2.5 w-2.5" />
              <span className="truncate max-w-[60px]">{file.name}</span>
              <button onClick={() => onRemoveFile(i)} className="hover:text-destructive transition-colors" aria-label={`Remove ${file.name}`}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".sql,.csv,.json,.txt,.xml"
          onChange={onFileUpload}
          aria-hidden="true"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach files (or drag & drop)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              e.stopPropagation()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe data..."
            className="min-h-[34px] max-h-24 resize-none text-xs py-1.5 px-2.5"
            disabled={isLoading}
            rows={1}
            aria-label="Chat message input"
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
          />
        </div>

        {isLoading ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-7 w-7 p-0 bg-red-600 hover:bg-red-700 text-white shrink-0"
                  onClick={onAbort}
                  aria-label="Stop generation"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              className="h-7 w-7 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0"
              onClick={handleSend}
              disabled={!inputValue.trim() && attachedFiles.length === 0}
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
})

// ─── React.memo QualityBadge ────────────────────────────
const QualityBadge = React.memo(function QualityBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-100 text-green-800 border-green-200' : score >= 60 ? 'bg-yellow-100 text-yellow-800 border-yellow-200' : 'bg-red-100 text-red-800 border-red-200'
  const icon = score >= 80 ? <Gauge className="h-3 w-3" /> : score >= 60 ? <Gauge className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-[10px] ${color} gap-1 cursor-help`}>
            {icon} {score}/100
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Data Quality Score</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

// ─── React.memo PIIShieldBadge ──────────────────────────
const PIIShieldBadge = React.memo(function PIIShieldBadge({ piiCheck }: { piiCheck: PIICheck | null }) {
  if (!piiCheck) return null
  const hasNoPII = !piiCheck.hasPII
  const color = hasNoPII ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-red-100 text-red-800 border-red-200'
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={`text-[10px] ${color} gap-1 cursor-help`}>
            <Shield className="h-3 w-3" /> {hasNoPII ? 'PII Safe' : 'PII Found'}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {hasNoPII ? 'No personally identifiable information detected' : `${piiCheck.findings.length} PII finding(s) detected`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})

// ─── React.memo AgentBadge ──────────────────────────────
const AgentBadge = React.memo(function AgentBadge({ name }: { name: string }) {
  const isPlan = name.includes('plan')
  const isExec = name.includes('exec')
  const color = isPlan ? 'bg-sky-100 text-sky-800 border-sky-200' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
  const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
  return (
    <Badge className={`text-xs ${color} gap-1`}>
      {icon} {name}
    </Badge>
  )
})

// ─── Main App ──────────────────────────────────────────
export default function SynthForgeApp({ initialDatabaseId }: { initialDatabaseId?: string }) {
  const [view, setView] = useState<View>('landing')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [activeDb, setActiveDb] = useState<Database_ | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showNewDbDialog, setShowNewDbDialog] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [newDbSchema, setNewDbSchema] = useState('')
  const [agentMode, setAgentMode] = useState<AgentMode>('auto')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const [rightTab, setRightTab] = useState('preview')
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<string>('')
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({})
  const [expandedSql, setExpandedSql] = useState<Record<string, boolean>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileStudioTab, setMobileStudioTab] = useState<'chat' | 'data'>('chat')
  const [schemaVersionCount, setSchemaVersionCount] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const [totalTokens, setTotalTokens] = useState(0)
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null)
  const [tableTreeExpanded, setTableTreeExpanded] = useState(true)

  const [isOnline, setIsOnline] = useState(true)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [sqlSuggestion, setSqlSuggestion] = useState<string>('')
  const [showSqlSuggestion, setShowSqlSuggestion] = useState(false)
  const [sqlValidationError, setSqlValidationError] = useState<string>('')
  const [explorerView, setExplorerView] = useState<'tree' | 'graph'>('tree')
  const [topologicalSortResult, setTopologicalSortResult] = useState<string[] | null>(null)
  const [cutpoints, setCutpoints] = useState<string[] | null>(null)
  const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null)
  const [reachableTables, setReachableTables] = useState<string[] | null>(null)
  const [constraintClosureResult, setConstraintClosureResult] = useState<{ from: string; to: string; via: string; cascades: string[] }[] | null>(null)
  const [qualityReport, setQualityReport] = useState<QualityReportData | null>(null)
  const [isQualityCheckRunning, setIsQualityCheckRunning] = useState(false)
  const [showQualityReport, setShowQualityReport] = useState(false)
  const [agentSteps, setAgentSteps] = useState<AgentStepUI[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const graphSvgRef = useRef<SVGSVGElement>(null)
  const graphTransformRef = useRef({ x: 0, y: 0, scale: 1 })
  const graphDragRef = useRef<{ isDragging: boolean; startX: number; startY: number; startTransformX: number; startTransformY: number }>({ isDragging: false, startX: 0, startY: 0, startTransformX: 0, startTransformY: 0 })
  const erSvgRef = useRef<SVGSVGElement>(null)
  const erTransformRef = useRef({ x: 0, y: 0, scale: 1 })
  const erDragRef = useRef<{ isDragging: boolean; startX: number; startY: number; startTransformX: number; startTransformY: number; target: string | null }>({ isDragging: false, startX: 0, startY: 0, startTransformX: 0, startTransformY: 0, target: null })
  const erTablePositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const { toast } = useToast()

  // ─── Network status tracking ────────────────────────
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true) ; structuredLog('info', 'Network back online') }
    const handleOffline = () => { setIsOnline(false) ; structuredLog('warn', 'Network went offline') }
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Load workspaces on mount
  useEffect(() => {
    const init = async () => {
      await loadWorkspaces()
      if (initialDatabaseId) {
        try {
          const res = await fetch('/api/databases')
          const data = await res.json()
          const db = data.databases?.find((d: Database_) => d.id === initialDatabaseId)
          if (db) {
            openDatabase(db)
          }
        } catch { /* silent */ }
      }
    }
    init()
  }, [initialDatabaseId])

  // ─── Smart auto-scroll with requestAnimationFrame ──
  useEffect(() => {
    if (isNearBottom && chatScrollRef.current) {
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTo({
            top: chatScrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    }
  }, [messages, isLoading, isNearBottom])

  // Track scroll position for near-bottom detection & scroll-to-bottom button
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
  }, [view])

  // Track total tokens
  useEffect(() => {
    const total = messages.reduce((sum, m) => sum + m.tokensIn + m.tokensOut, 0)
    setTotalTokens(total)
  }, [messages])

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces')
      const data = await res.json()
      if (data.workspaces?.length > 0) {
        setWorkspaces(data.workspaces)
        setActiveWorkspace(data.workspaces[0])
        loadProjects(data.workspaces[0].id)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load workspaces', variant: 'destructive' })
    }
  }

  const loadProjects = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/projects?workspaceId=${workspaceId}`)
      const data = await res.json()
      if (data.projects) {
        setProjects(data.projects)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' })
    }
  }

  const refreshDatabase = async (dbId: string) => {
    try {
      const res = await fetch('/api/databases')
      const data = await res.json()
      const updated = data.databases?.find((d: Database_) => d.id === dbId)
      if (updated) setActiveDb(updated)
    } catch { /* silent */ }
  }

  const allDatabases = useMemo(() => projects.flatMap(p => p.databases || []), [projects])

  const openDatabase = async (db: Database_) => {
    setActiveDb(db)
    setRightTab('preview')
    setAgentMode('auto')
    setSqlQuery('')
    setSqlResult('')
    setAttachedFiles([])
    setMobileStudioTab('chat')
    setView('studio')

    try {
      const res = await fetch(`/api/chat?databaseId=${db.id}`)
      const data = await res.json()
      if (data.conversation && data.conversation.messages?.length > 0) {
        setConversation({ id: data.conversation.id, title: data.conversation.title, messages: data.conversation.messages })
        setMessages(data.conversation.messages)
      } else {
        setConversation(null)
        setMessages([])
      }
    } catch {
      setConversation(null)
      setMessages([])
    }

    try {
      const dbDetail = await fetch(`/api/databases`)
      const dbData = await dbDetail.json()
      const currentDb = dbData.databases?.find((d: Database_) => d.id === db.id)
      if (currentDb) setActiveDb(currentDb)
    } catch { /* silent */ }
  }

  // ─── Core Send Message (with AbortController & SSE streaming) ──
  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    const msgText = messageText.trim()
    if ((!msgText && files.length === 0) || isLoading || !activeDb) return

    setIsLoading(true)

    // Optimistic user message with proper ID format
    const tempId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const tempUserMsg: Message = {
      id: tempId,
      role: 'user',
      content: msgText + (files.length > 0 ? `\n\n[Attached: ${files.map(f => f.name).join(', ')}]` : ''),
      sqlCode: '',
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      createdAt: new Date().toISOString(),
      agentName: '',
      reasoningSteps: '[]',
      options: '[]',
      tablesJson: '{}'
    }
    setMessages(prev => [...prev, tempUserMsg])

    // Create AbortController for this request
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Create placeholder assistant message for streaming
    const streamId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const streamMsg: Message = {
      id: streamId,
      role: 'assistant',
      content: '',
      sqlCode: '',
      tokensIn: 0,
      tokensOut: 0,
      cost: 0,
      createdAt: new Date().toISOString(),
      agentName: agentMode + '-agent',
      reasoningSteps: '[]',
      options: '[]',
      tablesJson: '{}',
      isStreaming: true,
      generationStatus: 'thinking'
    }
    streamingIdRef.current = streamId
    setMessages(prev => [...prev, streamMsg])

    try {
      // Use non-streaming mode for reliability (streaming can cause server crashes)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id || null,
          databaseId: activeDb.id,
          workspaceId: activeWorkspace?.id,
          message: msgText,
          stream: false,
          agentMode,
          files: files.map(f => ({ name: f.name, content: f.content, type: f.type }))
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        let errMsg = 'Chat request failed'
        try {
          const errData = await res.json()
          errMsg = errData.error || errData.hint || errMsg
        } catch {
          errMsg = `Request failed (${res.status})`
        }
        throw new Error(errMsg)
      }

      const data = await res.json()

      // Update conversation ID if new
      if (!conversation && data.conversationId) {
        setConversation({ id: data.conversationId, title: msgText.slice(0, 60), messages: [] })
      }

      // Parse the response
      const msg = data.message
      if (msg) {
        setMessages(prev => prev.map(m =>
          m.id === streamId
            ? {
                ...m,
                isStreaming: false,
                generationStatus: 'completed' as const,
                content: msg.content,
                tokensIn: msg.tokensIn || 0,
                tokensOut: msg.tokensOut || 0,
                cost: msg.cost || 0,
                tablesJson: msg.tablesJson || '{}',
                sqlCode: msg.sqlCode || '',
                agentName: msg.agentName || agentMode + '-agent',
                reasoningSteps: typeof msg.reasoningSteps === 'string' ? msg.reasoningSteps : JSON.stringify(msg.reasoningSteps || []),
                options: typeof msg.options === 'string' ? msg.options : JSON.stringify(msg.options || []),
                qualityScore: msg.qualityScore || null,
                piiCheck: msg.piiCheck || null
              }
            : m
        ))
      }

      await refreshDatabase(activeDb.id)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        structuredLog('info', 'Chat request aborted by user')
        // Mark streaming message as cancelled (keep partial content)
        setMessages(prev => prev.map(m =>
          m.id === streamId ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
      } else {
        // Remove streaming placeholder on real errors
        setMessages(prev => prev.filter(m => m.id !== streamId))
        const errMsg = error instanceof Error ? error.message : 'Failed to get response'
        structuredLog('error', 'Chat request failed', errMsg)

        // Mark the user message as failed (keep it with retry button)
        setMessages(prev => prev.map(m =>
          m.id === tempId ? { ...m, isError: true } : m
        ))

        toast({
          title: 'Error',
          description: errMsg,
          variant: 'destructive'
        })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
      streamingIdRef.current = null
    }
  }, [isLoading, activeDb, conversation, activeWorkspace, toast, agentMode])

  // ─── Abort generation ───────────────────────────────
  const handleAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      // Mark the streaming message as cancelled
      if (streamingIdRef.current) {
        setMessages(prev => prev.map(m =>
          m.id === streamingIdRef.current ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
        streamingIdRef.current = null
      }
    }
  }, [])

  // ─── Retry failed message ───────────────────────────
  const handleRetry = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    // Remove error state, re-send
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isError: false } : m))
    const originalText = msg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [messages, sendMessage])

  // ─── Regenerate assistant message ─────────────────────
  const handleRegenerate = useCallback((msgId: string) => {
    // Find the user message before this assistant message
    const msgIdx = messages.findIndex(m => m.id === msgId)
    if (msgIdx < 1) return
    const prevMsg = messages[msgIdx - 1]
    if (prevMsg.role !== 'user') return
    // Remove the current assistant message and resend
    setMessages(prev => prev.filter(m => m.id !== msgId))
    const originalText = prevMsg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [messages, sendMessage])

  // ─── Chat Send Message (from ChatInputBox) ────────────────
  const handleSendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    const msgText = messageText.trim() || 'Generate data from the attached file(s)'
    setAttachedFiles([])
    await sendMessage(msgText, files)
  }, [sendMessage])

  // ─── Memoized computed values ──────────────────────────
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

  const getSchemaFromDb = useMemo((): Record<string, { columns: Record<string, string>; relationships?: string[] }> => {
    if (!activeDb?.schemaJson) return {}
    try {
      return JSON.parse(activeDb.schemaJson)
    } catch { return {} }
  }, [activeDb?.schemaJson])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied!', description: 'Content copied to clipboard' })
  }, [toast])


  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  const createDatabase = async () => {
    if (!newDbName.trim() || !projects[0]) return

    let schemaObj = {}
    if (newDbSchema.trim()) {
      try {
        schemaObj = JSON.parse(newDbSchema)
      } catch {
        toast({ title: 'Invalid JSON', description: 'Schema must be valid JSON', variant: 'destructive' })
        return
      }
    }

    try {
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDbName,
          dbType: 'postgresql',
          schemaJson: schemaObj,
          projectId: projects[0].id
        })
      })

      const data = await res.json()
      if (data.database) {
        await loadProjects(activeWorkspace!.id)
        setShowNewDbDialog(false)
        setNewDbName('')
        setNewDbSchema('')
        toast({ title: 'Database Created', description: `${newDbName} is ready` })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create database', variant: 'destructive' })
    }
  }

  const deleteDatabase = async (dbId: string) => {
    try {
      await fetch(`/api/databases?id=${dbId}`, { method: 'DELETE' })
      if (activeDb?.id === dbId) {
        setActiveDb(null)
        setView('dashboard')
      }
      await loadProjects(activeWorkspace!.id)
      toast({ title: 'Deleted', description: 'Database removed' })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete database', variant: 'destructive' })
    }
  }

  // ─── Enhanced Export with multiple formats ────────────────
  const exportData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    let filename = 'synthforge-data'
    let type = 'text/plain'

    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
      filename += '.json'
      type = 'application/json'
    } else if (format === 'csv') {
      const parts: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const headers = Object.keys(rows[0])
          parts.push(`-- Table: ${tableName}`)
          parts.push(headers.map(h => `"${tableName}.${h}"`).join(','))
          for (const row of rows) {
            parts.push(headers.map(h => {
              const v = row[h]
              if (v === null || v === undefined) return '""'
              const s = String(v).replace(/"/g, '""')
              return `"${s}"`
            }).join(','))
          }
          parts.push('')
        }
      }
      content = parts.join('\n')
      filename += '.csv'
      type = 'text/csv'
    } else if (format === 'sql-insert') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
        }
      }
      content = statements.join('\n')
      filename += '.sql'
      type = 'text/plain'
    } else if (format === 'sql-full') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          const colDefs = cols.map(c => {
            const sampleVal = rows[0][c]
            let sqlType = 'VARCHAR(255)'
            if (typeof sampleVal === 'number') sqlType = Number.isInteger(sampleVal) ? 'INTEGER' : 'DECIMAL(10,2)'
            else if (typeof sampleVal === 'boolean') sqlType = 'BOOLEAN'
            else if (c === 'id') sqlType = 'SERIAL PRIMARY KEY'
            else if (c.endsWith('_id')) sqlType = 'INTEGER REFERENCES ' + c.replace(/_id$/, '') + 's(id)'
            else if (typeof sampleVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sampleVal)) sqlType = 'TIMESTAMP'
            return `${c} ${sqlType}`
          })
          statements.push(`CREATE TABLE ${tableName} (\n  ${colDefs.join(',\n  ')}\n);\n`)
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
          statements.push('')
        }
      }
      content = statements.join('\n')
      filename += '.sql'
      type = 'text/plain'
    }

    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Exported!', description: `Downloaded as ${filename}` })
  }, [toast])

  // ─── Per-table export ─────────────────────────────────
  const exportTable = useCallback((tableName: string, rows: Record<string, unknown>[], format: string) => {
    exportData({ [tableName]: rows }, format)
  }, [exportData])

  // ─── Copy table data ──────────────────────────────────
  const copyTable = useCallback((tableName: string, rows: Record<string, unknown>[]) => {
    const content = JSON.stringify({ [tableName]: rows }, null, 2)
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: `${tableName} data copied to clipboard` })
  }, [toast])

  // ─── Copy all data to clipboard ──────────────────────
  const copyAllData = useCallback((tables: Record<string, Record<string, unknown>[]>, format: string) => {
    let content = ''
    if (format === 'json') {
      content = JSON.stringify(tables, null, 2)
    } else if (format === 'sql') {
      const statements: string[] = []
      for (const [tableName, rows] of Object.entries(tables)) {
        if (rows?.length > 0) {
          const cols = Object.keys(rows[0])
          for (const row of rows) {
            const values = cols.map(c => {
              const v = row[c]
              return typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v ?? 'NULL')
            })
            statements.push(`INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${values.join(', ')});`)
          }
        }
      }
      content = statements.join('\n')
    } else {
      content = JSON.stringify(tables, null, 2)
    }
    navigator.clipboard.writeText(content)
    toast({ title: 'Copied!', description: 'Data copied to clipboard' })
  }, [toast])

  const runSqlPlayground = () => {
    if (!sqlQuery.trim()) return
    const tables = getTablesFromMessages
    const tableName = sqlQuery.match(/FROM\s+(\w+)/i)?.[1] || sqlQuery.match(/from\s+(\w+)/i)?.[1]
    if (tableName && tables[tableName]) {
      setSqlResult(`Found ${tables[tableName].length} rows in "${tableName}"\n\n${JSON.stringify(tables[tableName].slice(0, 5), null, 2)}${tables[tableName].length > 5 ? '\n\n... and more' : ''}`)
    } else {
      setSqlResult(`Query executed (simulated)\n\nAvailable tables: ${Object.keys(tables).join(', ') || 'None'}\n\nNote: SQL Playground runs in preview mode. Generated data is available for inspection.`)
    }
  }

  // ─── SQL Validation ──────────────────────────────────
  const validateSql = useCallback((sql: string) => {
    if (!sql.trim()) {
      setSqlValidationError('')
      return
    }
    // Check for unbalanced parentheses
    let parenCount = 0
    for (const char of sql) {
      if (char === '(') parenCount++
      if (char === ')') parenCount--
      if (parenCount < 0) {
        setSqlValidationError('Unbalanced parentheses: extra closing ")"')
        return
      }
    }
    if (parenCount > 0) {
      setSqlValidationError(`Unbalanced parentheses: missing ${parenCount} closing ")"`)
      return
    }
    // Check for common syntax issues
    const upperSql = sql.toUpperCase().trim()
    if (upperSql.endsWith('FROM') || upperSql.endsWith('SELECT') || upperSql.endsWith('WHERE') || upperSql.endsWith('JOIN') || upperSql.endsWith('ON')) {
      setSqlValidationError('Query appears incomplete (ends with a keyword)')
      return
    }
    setSqlValidationError('')
  }, [])



  // ─── Regenerate table data ────────────────────────────────
  const regenerateTable = useCallback(async (tableName: string) => {
    if (!activeDb || !conversation) return
    await sendMessage(`Regenerate data for the ${tableName} table with different values`)
  }, [activeDb, conversation, sendMessage])

  // ─── Render Helper: Reasoning Steps ───────────────────
  const ReasoningTimeline = ({ steps, msgId }: { steps: ReasoningStep[]; msgId: string }) => {
    const isOpen = expandedReasoning[msgId] ?? false
    if (!steps || steps.length === 0) return null

    return (
      <Collapsible open={isOpen} onOpenChange={(o) => setExpandedReasoning(prev => ({ ...prev, [msgId]: o }))}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Brain className="h-3 w-3" /> Reasoning ({steps.length})
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-1.5 pl-1">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-2 text-xs"
              >
                <div className="mt-0.5 shrink-0">
                  {step.status === 'completed' && <Check className="h-3 w-3 text-green-600" />}
                  {step.status === 'running' && <Loader2 className="h-3 w-3 text-yellow-600 animate-spin" />}
                  {step.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-600" />}
                  {step.status === 'pending' && <Circle className="h-3 w-3 text-slate-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{step.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">{step.type.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-muted-foreground">{step.description}</p>
                  {step.output && (
                    <p className="text-green-700 mt-0.5 font-mono text-[11px] leading-tight">{step.output}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  // ─── Render Helper: Clarification Options ─────────────
  const ClarificationOptions = ({ options }: { options: ClarificationOption[] }) => {
    if (!options || options.length === 0) return null
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Choose an option:</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <motion.div key={opt.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                variant="outline"
                size="sm"
                className="h-auto py-1.5 px-3 text-xs hover:bg-amber-50 hover:border-amber-300 transition-colors"
                onClick={() => sendMessage(opt.value)}
                disabled={isLoading}
              >
                {opt.label}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Quick Action Buttons (after generation) ─────────
  const QuickActions = ({ msg }: { msg: Message }) => {
    const tables = getTablesFromMessages
    if (msg.role !== 'assistant' || Object.keys(tables).length === 0) return null

    return (
      <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-border/50">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => exportData(tables, 'json')}
          aria-label="Export as JSON"
        >
          <FileJson className="h-3 w-3" /> Export JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => exportData(tables, 'csv')}
          aria-label="Export as CSV"
        >
          <FileText className="h-3 w-3" /> Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => copyAllData(tables, 'json')}
          aria-label="Copy data to clipboard"
        >
          <Copy className="h-3 w-3" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] gap-1 hover:bg-amber-50 hover:border-amber-300"
          onClick={() => sendMessage('Add more rows to each table')}
          disabled={isLoading}
          aria-label="Add more data"
        >
          <Plus className="h-3 w-3" /> Add More
        </Button>
      </div>
    )
  }

  // ─── Render: Assistant Content ────────────────────────
  const renderAssistantContent = (content: string) => {
    let displayContent = content
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.explanation) {
          displayContent = parsed.explanation
        }
      }
    } catch { /* use raw content */ }

    return (
      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-headings:my-2 prose-pre:my-1 prose-pre:bg-white prose-pre:border prose-code:text-xs">
        <ReactMarkdown>{displayContent}</ReactMarkdown>
      </div>
    )
  }

  // ─── Quality Check Handler ────────────────────────────
  const runQualityCheck = useCallback(async (autoFix = false) => {
    if (!activeDb || isQualityCheckRunning) return
    setIsQualityCheckRunning(true)
    try {
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId: activeDb.id, autoFix })
      })
      const data = await res.json()
      if (data.report) {
        setQualityReport(data.report)
        setShowQualityReport(true)
        if (autoFix && data.report.fixesApplied > 0) {
          toast({ title: 'Fixes Applied', description: `${data.report.fixesApplied} issue(s) auto-fixed` })
          await refreshDatabase(activeDb.id)
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Quality check failed', variant: 'destructive' })
    } finally {
      setIsQualityCheckRunning(false)
    }
  }, [activeDb, isQualityCheckRunning, toast])

  // ─── AgentPipeline Component ─────────────────────────
  const AgentPipeline = ({ steps }: { steps: AgentStepUI[] }) => {
    if (!steps || steps.length === 0) return null
    const completedCount = steps.filter(s => s.status === 'completed' || s.status === 'failed').length
    const progress = steps.length > 0 ? (completedCount / steps.length) * 100 : 0

    const getAgentIcon = (agentName: string) => {
      if (agentName.includes('schema')) return <Brain className="h-3.5 w-3.5" />
      if (agentName.includes('data')) return <Database className="h-3.5 w-3.5" />
      if (agentName.includes('quality')) return <CheckCheck className="h-3.5 w-3.5" />
      return <Bot className="h-3.5 w-3.5" />
    }

    const getStatusIcon = (status: string) => {
      if (status === 'completed') return <Check className="h-3 w-3 text-green-600" />
      if (status === 'running') return <Loader2 className="h-3 w-3 text-amber-600 animate-spin" />
      if (status === 'failed') return <XCircle className="h-3 w-3 text-red-600" />
      return <Clock3 className="h-3 w-3 text-slate-400" />
    }

    return (
      <div className="mt-3 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Cpu className="h-3.5 w-3.5" /> Agent Pipeline
          </div>
          <span className="text-[10px] text-muted-foreground">
            Step {completedCount}/{steps.length} complete
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
          <motion.div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
        {/* Steps timeline */}
        <div className="space-y-1.5">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-2"
            >
              <div className="mt-0.5 shrink-0">{getStatusIcon(step.status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{getAgentIcon(step.agent)} {step.agent}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                    {step.status}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">{step.task}</p>
                {step.output && step.status === 'completed' && (
                  <p className="text-[10px] text-green-700 mt-0.5 font-mono leading-tight truncate max-w-[300px]">
                    {step.output}
                  </p>
                )}
                {step.output && step.status === 'failed' && (
                  <p className="text-[10px] text-red-700 mt-0.5 font-mono leading-tight truncate max-w-[300px]">
                    {step.output}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Quality Report Panel Component ────────────────────
  const QualityReportPanel = () => {
    if (!qualityReport) return null
    const scoreColor = qualityReport.overallScore >= 80 ? 'text-green-600' : qualityReport.overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
    const scoreBg = qualityReport.overallScore >= 80 ? 'bg-green-50 border-green-200' : qualityReport.overallScore >= 60 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'

    return (
      <Dialog open={showQualityReport} onOpenChange={setShowQualityReport}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-amber-700" />
              Data Quality Report
            </DialogTitle>
            <DialogDescription>
              Quality analysis of your generated data
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Overall Score */}
            <div className={`rounded-lg border p-4 text-center ${scoreBg}`}>
              <div className={`text-4xl font-bold ${scoreColor}`}>{qualityReport.overallScore}</div>
              <div className="text-xs text-muted-foreground mt-1">Overall Quality Score</div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-sm font-semibold">{qualityReport.totalTables}</div>
                <div className="text-[10px] text-muted-foreground">Tables</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-sm font-semibold">{qualityReport.totalRows}</div>
                <div className="text-[10px] text-muted-foreground">Rows</div>
              </div>
              <div className="text-center p-2 rounded bg-red-50">
                <div className="text-sm font-semibold text-red-700">{qualityReport.criticalCount}</div>
                <div className="text-[10px] text-red-600">Critical</div>
              </div>
              <div className="text-center p-2 rounded bg-yellow-50">
                <div className="text-sm font-semibold text-yellow-700">{qualityReport.warningCount}</div>
                <div className="text-[10px] text-yellow-600">Warnings</div>
              </div>
            </div>

            {/* Per-table breakdown */}
            {qualityReport.tables.map((t) => (
              <Card key={t.table} className="overflow-hidden">
                <CardHeader className="pb-2 px-4 pt-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xs font-semibold flex items-center gap-2">
                      <Table2 className="h-3.5 w-3.5 text-amber-700" />
                      {t.table}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{t.rowCount} rows</Badge>
                      <Badge className={`text-[10px] ${t.score >= 80 ? 'bg-green-100 text-green-800' : t.score >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                        {t.score}/100
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                {t.issues.length > 0 && (
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="space-y-1 mt-1">
                      {t.issues.map((issue, j) => (
                        <div key={j} className={`text-[11px] px-2 py-1 rounded flex items-start gap-1.5 ${issue.severity === 'critical' ? 'bg-red-50 text-red-800' : issue.severity === 'warning' ? 'bg-yellow-50 text-yellow-800' : 'bg-sky-50 text-sky-800'}`}>
                          {issue.severity === 'critical' ? <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" /> : issue.severity === 'warning' ? <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> : <Circle className="h-3 w-3 shrink-0 mt-0.5" />}
                          <span>{issue.message}</span>
                          {issue.recoverable && <Badge className="text-[8px] ml-1 bg-emerald-100 text-emerald-700 h-3.5 px-1">fixable</Badge>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* Fix Details */}
            {qualityReport.fixesApplied > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green-800 mb-2">
                  <CheckCheck className="h-3.5 w-3.5" />
                  {qualityReport.fixesApplied} fix(es) applied
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {qualityReport.fixDetails.map((fix, i) => (
                    <div key={i} className="text-[11px] text-green-700">
                      <span className="font-medium">{fix.table}.{fix.column || 'row'}</span>: {fix.message}
                      {fix.before !== undefined && fix.after !== undefined && (
                        <span className="font-mono ml-1">({String(fix.before).slice(0, 20)} → {String(fix.after).slice(0, 20)})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-fix button */}
            {qualityReport.totalIssues > 0 && qualityReport.fixesApplied === 0 && (
              <Button
                onClick={() => runQualityCheck(true)}
                disabled={isQualityCheckRunning}
                className="w-full gap-2"
              >
                <Wrench className="h-4 w-4" />
                {isQualityCheckRunning ? 'Fixing...' : 'Auto-Fix Recoverable Issues'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ─── Graph analysis utilities ─────────────────────────
  const buildDependencyGraph = useCallback(() => {
    const schema = getSchemaFromDb
    const tables = getTablesFromMessages
    const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])
    const edges: { from: string; to: string; via: string }[] = []
    const adj: Record<string, string[]> = {}
    const revAdj: Record<string, string[]> = {}

    for (const name of allTableNames) {
      adj[name] = []
      revAdj[name] = []
    }

    for (const tableName of allTableNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        for (const colName of Object.keys(tableSchema.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = colName.replace(/_id$/, '') + 's'
            if (allTableNames.has(refTableName)) {
              edges.push({ from: tableName, to: refTableName, via: colName })
              adj[tableName].push(refTableName)
              revAdj[refTableName].push(tableName)
            }
          }
        }
      }
    }

    return { allTableNames, edges, adj, revAdj }
  }, [getSchemaFromDb, getTablesFromMessages])

  const topologicalSort = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    const inDegree: Record<string, number> = {}
    for (const name of allTableNames) inDegree[name] = 0
    for (const name of allTableNames) {
      for (const dep of adj[name]) {
        inDegree[dep] = (inDegree[dep] || 0) + 1
      }
    }
    // Wait, this is wrong. We want tables with no dependencies first.
    // adj[A] = [B] means A depends on B (A has FK to B)
    // So in-degree for topological sort: B has in-degree from A
    // We want to process tables that have no incoming edges first (no one depends on them)
    // Actually, for dependency order: tables with no FK deps first
    // adj[A] contains tables A depends on. So we reverse: revAdj[A] = tables that depend on A
    // For topo sort: start with tables that have no dependencies (adj[name] is empty)
    const sorted: string[] = []
    const queue: string[] = []
    const visited = new Set<string>()

    // Start with tables that have no dependencies
    for (const name of allTableNames) {
      if (adj[name].length === 0) queue.push(name)
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      sorted.push(current)

      // Find tables that depend on current and check if all their deps are visited
      const { revAdj: ra } = buildDependencyGraph()
      for (const dependent of ra[current] || []) {
        const allDepsVisited = adj[dependent].every((dep: string) => visited.has(dep))
        if (allDepsVisited && !visited.has(dependent)) {
          queue.push(dependent)
        }
      }
    }

    // Add any remaining (cycle) tables
    for (const name of allTableNames) {
      if (!visited.has(name)) sorted.push(name)
    }

    setTopologicalSortResult(sorted)
    return sorted
  }, [buildDependencyGraph])

  const findCutpoints = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    if (allTableNames.size <= 2) {
      setCutpoints(Array.from(allTableNames))
      return Array.from(allTableNames)
    }

    // Build undirected adjacency for cutpoint analysis
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) {
      for (const dep of adj[name]) {
        undirectedAdj[name].add(dep)
        undirectedAdj[dep].add(name)
      }
    }

    // Tarjan's algorithm for articulation points
    const disc: Record<string, number> = {}
    const low: Record<string, number> = {}
    const parent: Record<string, string | null> = {}
    const ap: Set<string> = new Set()
    let time = 0

    const dfs = (u: string) => {
      let children = 0
      disc[u] = low[u] = time++
      for (const v of undirectedAdj[u]) {
        if (disc[v] === undefined) {
          children++
          parent[v] = u
          dfs(v)
          low[u] = Math.min(low[u], low[v])
          // u is AP if parent is null and has 2+ children, or parent is not null and low[v] >= disc[u]
          if ((parent[u] === null && children > 1) || (parent[u] !== null && low[v] >= disc[u])) {
            ap.add(u)
          }
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u], disc[v])
        }
      }
    }

    for (const name of allTableNames) {
      if (disc[name] === undefined) {
        parent[name] = null
        dfs(name)
      }
    }

    // Also include isolated nodes (tables with no connections)
    for (const name of allTableNames) {
      if (undirectedAdj[name].size === 0) ap.add(name)
    }

    const result = Array.from(ap)
    setCutpoints(result)
    return result
  }, [buildDependencyGraph])

  const bfsReachable = useCallback((startNode: string) => {
    const { allTableNames, adj } = buildDependencyGraph()
    // Build undirected adjacency for reachability
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) {
      for (const dep of adj[name]) {
        undirectedAdj[name].add(dep)
        undirectedAdj[dep].add(name)
      }
    }

    const visited = new Set<string>()
    const queue = [startNode]
    visited.add(startNode)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of undirectedAdj[current]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    const result = Array.from(visited).filter(n => n !== startNode)
    setReachableTables(result)
    setSelectedGraphNode(startNode)
    return result
  }, [buildDependencyGraph])

  const computeConstraintClosure = useCallback(() => {
    const { edges, adj } = buildDependencyGraph()
    // For each FK edge, trace cascading constraints
    const result: { from: string; to: string; via: string; cascades: string[] }[] = []

    for (const edge of edges) {
      const cascades: string[] = []
      // Follow the chain from edge.to to find all tables that would be affected
      const visited = new Set<string>()
      const queue = [edge.to]
      visited.add(edge.to)

      while (queue.length > 0) {
        const current = queue.shift()!
        for (const dep of adj[current]) {
          if (!visited.has(dep)) {
            visited.add(dep)
            cascades.push(dep)
            queue.push(dep)
          }
        }
      }

      result.push({ from: edge.from, to: edge.to, via: edge.via, cascades })
    }

    setConstraintClosureResult(result)
    return result
  }, [buildDependencyGraph])

  // ─── Render: Interactive ER Diagram (SVG-based) ──
  const SchemaVisualization = () => {
    const schema = getSchemaFromDb
    const tables = getTablesFromMessages
    const allTableNames = Array.from(new Set([...Object.keys(tables), ...Object.keys(schema)]))

    const [erDragState, setErDragState] = useState<{ isDragging: boolean; target: string | null; startX: number; startY: number; offsetX: number; offsetY: number }>({ isDragging: false, target: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 })
    const [erTransform, setErTransform] = useState({ x: 0, y: 0, scale: 1 })
    const [erIsPanning, setErIsPanning] = useState(false)
    const [erPanStart, setErPanStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
    const [erTablePositions, setErTablePositions] = useState<Record<string, { x: number; y: number }>>(() => {
      const positions: Record<string, { x: number; y: number }> = {}
      const cols = Math.ceil(Math.sqrt(allTableNames.length))
      allTableNames.forEach((name, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions[name] = { x: col * 280 + 40, y: row * 220 + 40 }
      })
      return positions
    })

    // Compute relationships
    const relationships: { from: string; to: string; via: string; type: string }[] = []
    for (const tableName of allTableNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        for (const colName of Object.keys(tableSchema.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = colName.replace(/_id$/, '') + 's'
            if (allTableNames.includes(refTableName)) {
              relationships.push({ from: tableName, to: refTableName, via: colName, type: '1:N' })
            }
          }
        }
      }
    }

    // Check for M:N (junction tables)
    for (const tableName of allTableNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        const fks = Object.keys(tableSchema.columns).filter(c => c.endsWith('_id') && c !== 'id')
        if (fks.length >= 2) {
          for (const rel of relationships) {
            if (rel.from === tableName) rel.type = 'M:N'
          }
        }
      }
    }

    const tableWidth = 200
    const headerHeight = 28
    const rowHeight = 18

    const getTableHeight = (name: string) => {
      const tableSchema = schema[name]
      const colCount = tableSchema?.columns ? Object.keys(tableSchema.columns).length : 1
      return headerHeight + colCount * rowHeight + 8
    }

    const relationshipColor = (type: string) => {
      if (type === '1:1') return '#8b5cf6' // purple
      if (type === '1:N') return '#0ea5e9' // sky
      if (type === 'M:N') return '#f59e0b' // amber
      return '#6b7280' // gray
    }

    if (allTableNames.length === 0) {
      return (
        <div className="text-center py-20">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
            <Network className="h-8 w-8 text-amber-700/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground mb-1">No schema to visualize</p>
          <p className="text-xs text-muted-foreground mb-4">Ask the AI to generate data with related tables</p>
        </div>
      )
    }

    // Calculate SVG dimensions
    const maxX = Math.max(...allTableNames.map(n => (erTablePositions[n]?.x || 0) + tableWidth + 40), 800)
    const maxY = Math.max(...allTableNames.map(n => (erTablePositions[n]?.y || 0) + getTableHeight(n) + 40), 600)

    const handleErMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      const target = (e.target as SVGElement).closest('[data-table]')
      if (target) {
        const tableName = target.getAttribute('data-table')!
        const pos = erTablePositions[tableName]
        if (pos) {
          setErDragState({
            isDragging: true, target: tableName,
            startX: e.clientX, startY: e.clientY,
            offsetX: pos.x, offsetY: pos.y
          })
        }
      } else {
        // Start panning
        setErIsPanning(true)
        setErPanStart({ x: e.clientX, y: e.clientY, tx: erTransform.x, ty: erTransform.y })
      }
    }

    const handleErMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (erDragState.isDragging && erDragState.target) {
        const dx = (e.clientX - erDragState.startX) / erTransform.scale
        const dy = (e.clientY - erDragState.startY) / erTransform.scale
        setErTablePositions(prev => ({
          ...prev,
          [erDragState.target!]: {
            x: erDragState.offsetX + dx,
            y: erDragState.offsetY + dy
          }
        }))
      } else if (erIsPanning) {
        const dx = e.clientX - erPanStart.x
        const dy = e.clientY - erPanStart.y
        setErTransform(prev => ({ ...prev, x: erPanStart.tx + dx, y: erPanStart.ty + dy }))
      }
    }

    const handleErMouseUp = () => {
      setErDragState({ isDragging: false, target: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 })
      setErIsPanning(false)
    }

    const handleErWheel = (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setErTransform(prev => ({
        ...prev,
        scale: Math.max(0.2, Math.min(3, prev.scale * delta))
      }))
    }

    // Render edge with cardinality
    const renderEdge = (rel: { from: string; to: string; via: string; type: string }, idx: number) => {
      const fromPos = erTablePositions[rel.from]
      const toPos = erTablePositions[rel.to]
      if (!fromPos || !toPos) return null

      const fromH = getTableHeight(rel.from)
      const toH = getTableHeight(rel.to)

      // Calculate edge points (from right side of from table to left side of to table)
      const fromCenterX = fromPos.x + tableWidth / 2
      const fromCenterY = fromPos.y + fromH / 2
      const toCenterX = toPos.x + tableWidth / 2
      const toCenterY = toPos.y + toH / 2

      // Determine best connection sides
      let fromX: number, fromY: number, toX: number, toY: number
      if (fromCenterX < toCenterX) {
        fromX = fromPos.x + tableWidth
        toX = toPos.x
      } else {
        fromX = fromPos.x
        toX = toPos.x + tableWidth
      }
      fromY = fromCenterY
      toY = toCenterY

      const color = relationshipColor(rel.type)
      const midX = (fromX + toX) / 2

      // Cardinality labels
      const fromCardinality = rel.type === '1:1' ? '1' : rel.type === 'M:N' ? 'N' : 'N'
      const toCardinality = rel.type === '1:1' ? '1' : '1'

      return (
        <g key={`edge-${idx}`}>
          <path
            d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.7}
            markerEnd={`url(#arrow-${rel.type})`}
          />
          {/* Cardinality labels */}
          <text x={fromX + (fromCenterX < toCenterX ? 8 : -12)} y={fromY - 6} fontSize="11" fontWeight="bold" fill={color}>{fromCardinality}</text>
          <text x={toX + (fromCenterX < toCenterX ? -12 : 8)} y={toY - 6} fontSize="11" fontWeight="bold" fill={color}>{toCardinality}</text>
          {/* FK label on edge */}
          <text x={midX} y={(fromY + toY) / 2 - 8} fontSize="9" fill={color} textAnchor="middle" opacity={0.8}>{rel.via}</text>
        </g>
      )
    }

    // Minimap dimensions
    const minimapW = 160
    const minimapH = 100
    const minimapScale = Math.min(minimapW / maxX, minimapH / maxY)

    return (
      <div className="flex flex-col h-full">
        {/* ER Diagram toolbar */}
        <div className="flex items-center gap-2 p-2 border-b bg-muted/30 shrink-0 flex-wrap">
          <Badge variant="outline" className="text-[10px] gap-1">
            <Table2 className="h-3 w-3" /> {allTableNames.length} tables
          </Badge>
          <Badge variant="outline" className="text-[10px] gap-1">
            <Link2 className="h-3 w-3" /> {relationships.length} relationships
          </Badge>
          <div className="flex items-center gap-1 ml-auto">
            {/* Relationship type legend */}
            <div className="flex items-center gap-1 text-[10px]">
              <span className="inline-block w-3 h-0.5 bg-sky-500" /> 1:N
            </div>
            <div className="flex items-center gap-1 text-[10px] ml-2">
              <span className="inline-block w-3 h-0.5 bg-amber-500" /> M:N
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform({ x: 0, y: 0, scale: 1 })} aria-label="Reset view">
              <Maximize2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform(prev => ({ ...prev, scale: Math.min(3, prev.scale * 1.2) }))} aria-label="Zoom in">
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform(prev => ({ ...prev, scale: Math.max(0.2, prev.scale * 0.8) }))} aria-label="Zoom out">
              <ZoomOut className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Main SVG canvas */}
        <div className="flex-1 relative overflow-hidden">
          <svg
            ref={erSvgRef}
            className="w-full h-full"
            style={{ cursor: erDragState.isDragging ? 'grabbing' : erIsPanning ? 'grabbing' : 'grab' }}
            onMouseDown={handleErMouseDown}
            onMouseMove={handleErMouseMove}
            onMouseUp={handleErMouseUp}
            onMouseLeave={handleErMouseUp}
            onWheel={handleErWheel}
          >
            <defs>
              <marker id="arrow-1:N" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" />
              </marker>
              <marker id="arrow-M:N" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
              </marker>
              <marker id="arrow-1:1" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
              </marker>
              {/* Grid pattern */}
              <pattern id="er-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
              </pattern>
            </defs>

            <g transform={`translate(${erTransform.x}, ${erTransform.y}) scale(${erTransform.scale})`}>
              {/* Background grid */}
              <rect x="-1000" y="-1000" width={maxX + 2000} height={maxY + 2000} fill="url(#er-grid)" />

              {/* Render edges */}
              {relationships.map((rel, i) => renderEdge(rel, i))}

              {/* Render table nodes */}
              {allTableNames.map(tableName => {
                const tableSchema = schema[tableName]
                const tableRows = tables[tableName]
                const columns = tableSchema?.columns || {}
                const colEntries = Object.entries(columns)
                const pos = erTablePositions[tableName] || { x: 0, y: 0 }
                const height = getTableHeight(tableName)

                return (
                  <g key={tableName} data-table={tableName} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: 'move' }}>
                    {/* Shadow */}
                    <rect x={2} y={2} width={tableWidth} height={height} rx={6} fill="rgba(0,0,0,0.08)" />
                    {/* Table body */}
                    <rect width={tableWidth} height={height} rx={6} fill="white" stroke="#d4a054" strokeWidth={1.5} />
                    {/* Header */}
                    <rect width={tableWidth} height={headerHeight} rx={6} fill="#d4a054" />
                    <rect y={headerHeight - 6} width={tableWidth} height={6} fill="#d4a054" />
                    {/* Table name */}
                    <text x={tableWidth / 2} y={18} textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">
                      {tableName}
                    </text>
                    {tableRows && (
                      <text x={tableWidth - 8} y={18} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.8)">
                        {tableRows.length} rows
                      </text>
                    )}
                    {/* Column rows */}
                    {colEntries.map(([colName, colType], i) => {
                      const isPK = colName === 'id'
                      const isFK = colName.endsWith('_id') && colName !== 'id'
                      const y = headerHeight + 14 + i * rowHeight
                      return (
                        <g key={colName}>
                          <line x1={0} y1={y - 12} x2={tableWidth} y2={y - 12} stroke="#f3f0e7" strokeWidth={0.5} />
                          {isPK && <text x={8} y={y} fontSize="9" fill="#d4a054">🔑</text>}
                          {isFK && <text x={8} y={y} fontSize="9" fill="#0ea5e9">🔗</text>}
                          {!isPK && !isFK && <text x={8} y={y} fontSize="9" fill="#9ca3af">●</text>}
                          <text x={isPK || isFK ? 22 : 16} y={y} fontSize="10" fontFamily="monospace" fill="#374151">{colName}</text>
                          <text x={tableWidth - 8} y={y} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#9ca3af">
                            {colType.split('(')[0]}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Minimap */}
          <div className="absolute bottom-3 right-3 border rounded-lg bg-white/90 shadow-lg p-1.5">
            <svg width={minimapW} height={minimapH}>
              <rect width={minimapW} height={minimapH} fill="#fafaf9" rx={4} />
              {allTableNames.map(name => {
                const pos = erTablePositions[name] || { x: 0, y: 0 }
                const h = getTableHeight(name)
                return (
                  <rect
                    key={name}
                    x={pos.x * minimapScale}
                    y={pos.y * minimapScale}
                    width={tableWidth * minimapScale}
                    height={h * minimapScale}
                    fill="#d4a054"
                    stroke="#b8860b"
                    strokeWidth={0.5}
                    rx={1}
                    opacity={0.7}
                  />
                )
              })}
              {/* Viewport indicator */}
              <rect
                x={(-erTransform.x / erTransform.scale) * minimapScale}
                y={(-erTransform.y / erTransform.scale) * minimapScale}
                width={(800 / erTransform.scale) * minimapScale}
                height={(500 / erTransform.scale) * minimapScale}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1}
                strokeDasharray="3 2"
                rx={2}
              />
            </svg>
          </div>
        </div>
      </div>
    )
  }

  // ─── Render: Explorer (Tree + Graph) ────────────────────
  const ExplorerTree = () => {
    const tables = getTablesFromMessages
    const schema = getSchemaFromDb
    const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])

    // Graph view state
    const [graphTransform, setGraphTransform] = useState({ x: 0, y: 0, scale: 1 })
    const [graphIsPanning, setGraphIsPanning] = useState(false)
    const [graphPanStart, setGraphPanStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
    const [hoveredNode, setHoveredNode] = useState<string | null>(null)

    // Build dependency data
    const { edges } = buildDependencyGraph()

    // Calculate node positions using grid layout
    const graphNodePositions = useMemo(() => {
      const names = Array.from(allTableNames)
      const positions: Record<string, { x: number; y: number }> = {}
      const cols = Math.ceil(Math.sqrt(names.length))
      names.forEach((name, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        positions[name] = { x: col * 160 + 80, y: row * 120 + 60 }
      })
      return positions
    }, [allTableNames])

    const isCutpoint = cutpoints ? (name: string) => cutpoints.includes(name) : () => false
    const isReachable = reachableTables ? (name: string) => reachableTables.includes(name) : () => false

    // Graph event handlers
    const handleGraphMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      const target = (e.target as SVGElement).closest('[data-node]')
      if (target) {
        const nodeName = target.getAttribute('data-node')!
        // Click on node: show reachable tables
        bfsReachable(nodeName)
      } else {
        // Start panning
        setGraphIsPanning(true)
        setGraphPanStart({ x: e.clientX, y: e.clientY, tx: graphTransform.x, ty: graphTransform.y })
      }
    }

    const handleGraphMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      if (graphIsPanning) {
        const dx = e.clientX - graphPanStart.x
        const dy = e.clientY - graphPanStart.y
        setGraphTransform(prev => ({ ...prev, x: graphPanStart.tx + dx, y: graphPanStart.ty + dy }))
      }
    }

    const handleGraphMouseUp = () => {
      setGraphIsPanning(false)
    }

    const handleGraphWheel = (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setGraphTransform(prev => ({
        ...prev,
        scale: Math.max(0.3, Math.min(3, prev.scale * delta))
      }))
    }

    // SVG dimensions
    const graphW = Math.max(...Object.values(graphNodePositions).map(p => p.x + 80), 400)
    const graphH = Math.max(...Object.values(graphNodePositions).map(p => p.y + 60), 300)

    return (
      <div className="flex flex-col h-full">
        {/* View toggle + analysis buttons */}
        <div className="flex items-center gap-1.5 p-2 border-b bg-muted/30 shrink-0 flex-wrap">
          <div className="flex items-center bg-muted rounded-md p-0.5">
            <Button
              variant={explorerView === 'tree' ? 'default' : 'ghost'}
              size="sm"
              className={`h-6 text-[10px] px-2 ${explorerView === 'tree' ? 'bg-amber-700 text-white' : ''}`}
              onClick={() => setExplorerView('tree')}
              aria-label="Tree view"
            >
              <FolderTree className="h-3 w-3 mr-1" /> Tree
            </Button>
            <Button
              variant={explorerView === 'graph' ? 'default' : 'ghost'}
              size="sm"
              className={`h-6 text-[10px] px-2 ${explorerView === 'graph' ? 'bg-amber-700 text-white' : ''}`}
              onClick={() => setExplorerView('graph')}
              aria-label="Graph view"
            >
              <GitBranch className="h-3 w-3 mr-1" /> Graph
            </Button>
          </div>

          {explorerView === 'graph' && (
            <div className="flex items-center gap-1 ml-auto flex-wrap">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={topologicalSort} aria-label="Sort dependencies">
                      <ListOrdered className="h-3 w-3" /> Sort
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Topological sort (dependency order)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={findCutpoints} aria-label="Find cutpoints">
                      <AlertTriangle className="h-3 w-3" /> Cutpoints
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Find critical tables (cutpoints)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={computeConstraintClosure} aria-label="Show constraints">
                      <Link2 className="h-3 w-3" /> Constraints
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Show cascading constraints</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setGraphTransform({ x: 0, y: 0, scale: 1 })} aria-label="Reset graph view">
                <Maximize2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden">
          {explorerView === 'tree' ? (
            <div className="p-2 h-full overflow-y-auto">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                <FolderTree className="h-3 w-3" /> DATABASE TABLES
              </div>
              {allTableNames.size === 0 ? (
                <div className="text-center py-12">
                  <Table2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No tables yet. Chat with AI to generate data.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Topological sort result */}
                  {topologicalSortResult && (
                    <div className="mb-3 p-2 border rounded-md bg-sky-50 border-sky-200">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-800 mb-1.5">
                        <ListOrdered className="h-3 w-3" /> Dependency Order
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {topologicalSortResult.map((name, i) => (
                          <React.Fragment key={name}>
                            <Badge variant="outline" className="text-[9px] font-mono">{name}</Badge>
                            {i < topologicalSortResult.length - 1 && <span className="text-sky-400 text-[10px]">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.from(allTableNames).map(tableName => {
                    const rows = tables[tableName] || []
                    const schemaDef = schema[tableName]
                    const isCut = isCutpoint(tableName)
                    return (
                      <motion.button
                        key={tableName}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group ${isCut ? 'border-l-2 border-red-400 bg-red-50/50' : ''}`}
                        onClick={() => setRightTab('preview')}
                        aria-label={`View ${tableName} table`}
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                          <Table2 className="h-3.5 w-3.5 text-amber-700" />
                          <span className="text-sm font-medium">{tableName}</span>
                          {isCut && <AlertTriangle className="h-3 w-3 text-red-500" />}
                        </div>
                        <div className="ml-6 mt-0.5 text-[11px] text-muted-foreground">
                          {rows.length > 0 && <span>{rows.length} rows</span>}
                          {schemaDef?.columns && <span>{rows.length > 0 ? ' · ' : ''}{Object.keys(schemaDef.columns).length} columns</span>}
                        </div>
                        {schemaDef?.columns && (
                          <div className="ml-6 mt-1 flex flex-wrap gap-1">
                            {Object.keys(schemaDef.columns).slice(0, 4).map(col => (
                              <Badge key={col} variant="outline" className="text-[9px] px-1 py-0 font-mono">{col}</Badge>
                            ))}
                            {Object.keys(schemaDef.columns).length > 4 && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0">+{Object.keys(schemaDef.columns).length - 4}</Badge>
                            )}
                          </div>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {allTableNames.size === 0 ? (
                <div className="text-center py-12">
                  <Network className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No tables to graph. Chat with AI to generate data.</p>
                </div>
              ) : (
                <>
                  {/* SVG Dependency Graph */}
                  <div className="flex-1 relative overflow-hidden">
                    <svg
                      ref={graphSvgRef}
                      className="w-full h-full"
                      style={{ cursor: graphIsPanning ? 'grabbing' : 'pointer' }}
                      onMouseDown={handleGraphMouseDown}
                      onMouseMove={handleGraphMouseMove}
                      onMouseUp={handleGraphMouseUp}
                      onMouseLeave={handleGraphMouseUp}
                      onWheel={handleGraphWheel}
                    >
                      <defs>
                        <marker id="graph-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                        </marker>
                        <pattern id="graph-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.5" />
                        </pattern>
                      </defs>

                      <g transform={`translate(${graphTransform.x}, ${graphTransform.y}) scale(${graphTransform.scale})`}>
                        <rect x="-500" y="-500" width={graphW + 1000} height={graphH + 1000} fill="url(#graph-grid)" />

                        {/* Edges */}
                        {edges.map((edge, i) => {
                          const fromPos = graphNodePositions[edge.from]
                          const toPos = graphNodePositions[edge.to]
                          if (!fromPos || !toPos) return null
                          const midX = (fromPos.x + toPos.x) / 2
                          const midY = (fromPos.y + toPos.y) / 2
                          const isHighlighted = selectedGraphNode === edge.from || selectedGraphNode === edge.to
                          return (
                            <g key={`ge-${i}`}>
                              <path
                                d={`M ${fromPos.x} ${fromPos.y} C ${midX} ${fromPos.y}, ${midX} ${toPos.y}, ${toPos.x} ${toPos.y}`}
                                fill="none"
                                stroke={isHighlighted ? '#f59e0b' : '#94a3b8'}
                                strokeWidth={isHighlighted ? 2 : 1.5}
                                strokeOpacity={isHighlighted ? 1 : 0.5}
                                markerEnd="url(#graph-arrow)"
                              />
                              <text x={midX} y={midY - 6} fontSize="8" fill="#64748b" textAnchor="middle" opacity={0.7}>{edge.via}</text>
                            </g>
                          )
                        })}

                        {/* Nodes */}
                        {Array.from(allTableNames).map(name => {
                          const pos = graphNodePositions[name]
                          if (!pos) return null
                          const isCut = isCutpoint(name)
                          const isReach = isReachable(name)
                          const isSelected = selectedGraphNode === name
                          const isHovered = hoveredNode === name
                          const nodeW = 120
                          const nodeH = 36

                          let fillColor = '#ffffff'
                          let strokeColor = '#d4a054'
                          let textColor = '#374151'
                          if (isCut) { fillColor = '#fef2f2'; strokeColor = '#ef4444' }
                          if (isReach) { fillColor = '#ecfdf5'; strokeColor = '#10b981' }
                          if (isSelected) { fillColor = '#fffbeb'; strokeColor = '#f59e0b'; textColor = '#92400e' }
                          if (isHovered && !isSelected) { fillColor = '#fefce8' }

                          return (
                            <g
                              key={name}
                              data-node={name}
                              transform={`translate(${pos.x - nodeW / 2}, ${pos.y - nodeH / 2})`}
                              onMouseEnter={() => setHoveredNode(name)}
                              onMouseLeave={() => setHoveredNode(null)}
                              style={{ cursor: 'pointer' }}
                            >
                              <rect width={nodeW} height={nodeH} rx={6} fill={fillColor} stroke={strokeColor} strokeWidth={isSelected ? 2.5 : 1.5} />
                              <text x={nodeW / 2} y={nodeH / 2 + 4} textAnchor="middle" fontSize="11" fontWeight={isSelected ? 'bold' : '600'} fill={textColor}>
                                {name}
                              </text>
                              {isCut && (
                                <text x={nodeW - 6} y={12} fontSize="9" fill="#ef4444">⚠</text>
                              )}
                              {/* Row count badge */}
                              {tables[name] && (
                                <text x={nodeW / 2} y={nodeH - 4} textAnchor="middle" fontSize="7" fill="#9ca3af">{tables[name].length} rows</text>
                              )}
                            </g>
                          )
                        })}
                      </g>
                    </svg>
                  </div>

                  {/* Analysis results panels */}
                  <div className="border-t shrink-0 max-h-[40%] overflow-y-auto">
                    {/* Selected node: Reachable tables (BFS) */}
                    {selectedGraphNode && reachableTables !== null && (
                      <div className="p-2 border-b bg-amber-50/50">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 mb-1">
                          <Search className="h-3 w-3" /> Reachable from <span className="font-mono">{selectedGraphNode}</span>
                        </div>
                        {reachableTables.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground">No reachable tables via FK relationships</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {reachableTables.map(name => (
                              <Badge key={name} variant="outline" className="text-[9px] font-mono bg-green-50 border-green-300 text-green-800">{name}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cutpoint result */}
                    {cutpoints && cutpoints.length > 0 && (
                      <div className="p-2 border-b bg-red-50/50">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-800 mb-1">
                          <AlertTriangle className="h-3 w-3" /> Critical Tables (Cutpoints)
                        </div>
                        <p className="text-[9px] text-muted-foreground mb-1">Removing these tables would disconnect the schema graph</p>
                        <div className="flex flex-wrap gap-1">
                          {cutpoints.map(name => (
                            <Badge key={name} variant="outline" className="text-[9px] font-mono bg-red-50 border-red-300 text-red-800">{name}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Constraint closure result */}
                    {constraintClosureResult && constraintClosureResult.length > 0 && (
                      <div className="p-2 bg-sky-50/50">
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-800 mb-1">
                          <Link2 className="h-3 w-3" /> Cascading Constraints
                        </div>
                        <div className="space-y-1">
                          {constraintClosureResult.map((cc, i) => (
                            <div key={i} className="text-[9px] bg-white/50 rounded p-1.5 border border-sky-100">
                              <span className="font-mono text-sky-700">{cc.from}</span>
                              <span className="text-muted-foreground mx-1">→{cc.via}→</span>
                              <span className="font-mono text-sky-700">{cc.to}</span>
                              {cc.cascades.length > 0 && (
                                <span className="text-muted-foreground ml-1">affects: {cc.cascades.map(c => <span key={c} className="font-mono text-amber-700">{c}</span>).reduce((acc, el, idx) => idx === 0 ? [el] : [...acc, ', ', el], [] as React.ReactNode[])}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Render: Chat Message (React.memo moved outside) ──────────────────
  const ChatMessage = React.memo(function ChatMessage({ msg }: { msg: Message }) {
    const isUser = msg.role === 'user'

    if (isUser) {
      return (
        <motion.div {...messageSlideIn} className="flex justify-end">
          <div className="max-w-[90%] bg-gradient-to-br from-amber-600 to-red-700 text-white rounded-xl rounded-br-sm px-3 py-2 shadow-sm relative">
            <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
            {/* Retry button for failed user messages */}
            {msg.isError && (
              <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center gap-2">
                <AlertCircle className="h-3 w-3 text-red-200" />
                <span className="text-[10px] text-red-200">Failed to send</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-2 text-white hover:bg-white/20"
                  onClick={() => handleRetry(msg.id)}
                  aria-label="Retry sending message"
                >
                  <RefreshCw className="h-2.5 w-2.5 mr-1" /> Retry
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      )
    }

    // Assistant message
    let parsedOptions: ClarificationOption[] = []
    let parsedSteps: ReasoningStep[] = []
    try { parsedOptions = JSON.parse(msg.options || '[]') } catch { /* */ }
    try { parsedSteps = JSON.parse(msg.reasoningSteps || '[]') } catch { /* */ }

    let hasGeneratedTables = false
    try {
      const tables = JSON.parse(msg.tablesJson || '{}')
      hasGeneratedTables = Object.keys(tables).length > 0
    } catch { /* */ }

    // Generation status badge
    const renderStatusBadge = () => {
      if (msg.isStreaming && !msg.content) {
        return (
          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200 gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Thinking<AnimatedDots />
          </Badge>
        )
      }
      if (msg.isStreaming && msg.content) {
        return (
          <Badge className="text-[10px] bg-sky-100 text-sky-800 border-sky-200 gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> Generating
          </Badge>
        )
      }
      if (msg.generationStatus === 'completed') {
        return (
          <Badge className="text-[10px] bg-green-100 text-green-800 border-green-200 gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Completed
          </Badge>
        )
      }
      if (msg.generationStatus === 'failed' || msg.isError) {
        return (
          <Badge className="text-[10px] bg-red-100 text-red-800 border-red-200 gap-1">
            <XCircle className="h-2.5 w-2.5" /> Failed
          </Badge>
        )
      }
      if (msg.isCancelled || msg.generationStatus === 'cancelled') {
        return (
          <Badge className="text-[10px] bg-gray-100 text-gray-700 border-gray-300 gap-1">
            <Ban className="h-2.5 w-2.5" /> Cancelled
          </Badge>
        )
      }
      return null
    }

    return (
      <motion.div {...messageSlideIn} className="flex justify-start">
        <div className="max-w-[95%] bg-muted/50 rounded-xl rounded-bl-sm px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <AgentBadge name={msg.agentName} />
            {msg.qualityScore && <QualityBadge score={msg.qualityScore.overall} />}
            <PIIShieldBadge piiCheck={msg.piiCheck || null} />
            {renderStatusBadge()}
            {msg.tokensIn > 0 && (
              <span className="text-[9px] text-muted-foreground">
                {msg.tokensIn + msg.tokensOut} tok
              </span>
            )}
            {/* Regenerate button for completed assistant messages */}
            {!msg.isStreaming && !msg.isCancelled && msg.generationStatus === 'completed' && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-muted-foreground hover:text-amber-700 hover:bg-amber-50"
                      onClick={() => handleRegenerate(msg.id)}
                      aria-label="Regenerate response"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Regenerate response</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          {msg.isStreaming && !msg.content ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              <span>Thinking<AnimatedDots /></span>
            </div>
          ) : (
            <>
              {renderAssistantContent(msg.content)}
              {/* Show cancelled notice */}
              {msg.isCancelled && msg.content && (
                <div className="mt-2 pt-1.5 border-t border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Ban className="h-3 w-3" />
                  <span>Generation was cancelled. Partial content shown above.</span>
                </div>
              )}
            </>
          )}

          {msg.sqlCode && (
            <Collapsible
              open={expandedSql[msg.id] ?? false}
              onOpenChange={(o) => setExpandedSql(prev => ({ ...prev, [msg.id]: o }))}
            >
              <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer">
                {expandedSql[msg.id] ?? false ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <Code2 className="h-3 w-3" /> SQL
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 relative group">
                  <ScrollArea className="max-h-36">
                    <pre className="bg-slate-900 text-green-400 p-2 rounded-md text-[10px] font-mono overflow-x-auto">
                      <code>{msg.sqlCode}</code>
                    </pre>
                  </ScrollArea>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 bg-slate-800 text-slate-300 hover:text-white"
                      onClick={() => copyToClipboard(msg.sqlCode)}
                      aria-label="Copy SQL code"
                    >
                      <Copy className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <ReasoningTimeline steps={parsedSteps} msgId={msg.id} />
          {/* Agent Pipeline for multi-step tasks */}
          {agentSteps.length > 0 && <AgentPipeline steps={agentSteps} />}
          <ClarificationOptions options={parsedOptions} />
          {hasGeneratedTables && !msg.isStreaming && <QuickActions msg={msg} />}
        </div>
      </motion.div>
    )
  })


  // ─── Render: Chat Panel ────────────────────────────────
  const ChatPanel = () => (
    <div
      className={`flex flex-col h-full border-r transition-colors min-w-[280px] ${isDragOver ? 'bg-amber-50/50 border-amber-300' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-amber-50/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="h-10 w-10 text-amber-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-amber-700">Drop files here</p>
            <p className="text-xs text-amber-600">SQL, CSV, JSON, XML</p>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 flex items-center gap-2 shrink-0" role="alert">
          <WifiOff className="h-3.5 w-3.5 text-red-600 shrink-0" />
          <span className="text-xs text-red-700">You are offline. Some features may not work.</span>
        </div>
      )}

      {/* Messages Area */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto chat-scroll-area" style={{ scrollBehavior: 'smooth' }}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-10"
            >
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-3 shadow-lg"
              >
                <Sparkles className="h-6 w-6 text-white" />
              </motion.div>
              <h2 className="text-base font-bold mb-1">SynthForge AI</h2>
              <p className="text-muted-foreground max-w-[200px] mb-4 text-xs">
                Describe the data you need. AI generates realistic synthetic data.
              </p>

              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-1.5 w-full"
              >
                {[
                  { icon: <Hash className="h-3 w-3" />, text: 'Generate sample data' },
                  { icon: <Table2 className="h-3 w-3" />, text: 'Create a data schema' },
                  { icon: <Database className="h-3 w-3" />, text: 'Build relational tables' },
                  { icon: <Code2 className="h-3 w-3" />, text: 'Design a database' }
                ].map((suggestion, i) => (
                  <motion.button
                    key={i}
                    variants={staggerItem}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => sendMessage(suggestion.text)}
                  >
                    {suggestion.icon}
                    <span>{suggestion.text}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} msg={msg} />
          ))}

          {/* Loading Indicator (only when no streaming message is shown) */}
          {isLoading && !messages.some(m => m.isStreaming) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-3 py-2.5 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-sm text-muted-foreground">Thinking<AnimatedDots /></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full shadow-md bg-background border-amber-200 hover:bg-amber-50"
                    onClick={() => {
                      if (chatScrollRef.current) {
                        chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
                      }
                    }}
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-amber-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scroll to bottom</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <ChatInputBox
        onSend={handleSendMessage}
        isLoading={isLoading}
        onAbort={handleAbort}
        attachedFiles={attachedFiles}
        onRemoveFile={removeFile}
        onFileUpload={handleFileUpload}
        fileInputRef={fileInputRef}
      />
    </div>
  )

  // ─── Render: Data Workspace Panel ─────────────────────
  const DataWorkspace = () => {
    const allTables = getTablesFromMessages
    const schemaObj = getSchemaFromDb

    return (
      <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-3 shrink-0">
          <TabsTrigger value="preview" className="text-xs data-[state=active]:bg-muted">Data</TabsTrigger>
          <TabsTrigger value="schema" className="text-xs data-[state=active]:bg-muted">Schema</TabsTrigger>
          <TabsTrigger value="relationships" className="text-xs data-[state=active]:bg-muted">ER Diagram</TabsTrigger>
          <TabsTrigger value="sql" className="text-xs data-[state=active]:bg-muted">SQL</TabsTrigger>
          <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-muted">Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="flex-1 overflow-auto mt-0">
          <div className="flex h-full">
            {/* Table Tree Sidebar */}
            <div className="w-48 shrink-0 border-r bg-muted/20 overflow-y-auto">
              <div className="p-2">
                <TableTreeView
                  tableNames={Object.keys(allTables)}
                  tableRowCounts={Object.fromEntries(Object.entries(allTables).map(([k, v]) => [k, v.length]))}
                  selectedTable={selectedTableName}
                  onSelectTable={setSelectedTableName}
                />
              </div>
            </div>

            {/* Selected Table Content */}
            <div className="flex-1 overflow-auto">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {isLoading && Object.keys(allTables).length === 0 ? (
                    <div className="space-y-4">
                      {[1, 2].map(i => (
                        <Card key={i}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <Skeleton className="h-4 w-24" />
                              <Skeleton className="h-5 w-14" />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex gap-4">
                                {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-3 w-16" />)}
                              </div>
                              {[1, 2, 3, 4, 5].map(j => (
                                <div key={j} className="flex gap-4">
                                  {[1, 2, 3, 4].map(k => <Skeleton key={k} className="h-3 w-20" />)}
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : selectedTableName && allTables[selectedTableName] ? (
                    <>
                      {/* Show selected table only */}
                      {/* Export bar */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setSelectedTableName(null)}
                        >
                          <ChevronRight className="h-3 w-3 mr-1" />
                          All Tables
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {selectedTableName} · {allTables[selectedTableName].length} rows
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300"
                                  onClick={() => runQualityCheck(false)}
                                  disabled={isQualityCheckRunning}
                                  aria-label="Run quality check"
                                >
                                  {isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}
                                  Quality
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Run data quality check</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1 text-xs h-7" aria-label="Export all data">
                                <Download className="h-3 w-3" /> Export
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'json')}>
                                <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                                <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}>
                                <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}>
                                <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}>
                                <ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <DataTable
                        key={selectedTableName}
                        tableName={selectedTableName}
                        allRows={allTables[selectedTableName]}
                        schemaObj={schemaObj}
                        onRegenerate={regenerateTable}
                        isLoading={isLoading}
                        onExportTable={exportTable}
                        onCopyTable={copyTable}
                      />
                    </>
                  ) : !selectedTableName && Object.keys(allTables).length > 0 ? (
                    <>
                      {/* Show all tables when nothing selected */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(allTables).length} table{Object.keys(allTables).length !== 1 ? 's' : ''} · {Object.values(allTables).reduce((s, r) => s + r.length, 0)} total rows
                        </span>
                        <div className="ml-auto flex items-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300"
                                  onClick={() => runQualityCheck(false)}
                                  disabled={isQualityCheckRunning}
                                  aria-label="Run quality check"
                                >
                                  {isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}
                                  Quality
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Run data quality check</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1 text-xs h-7" aria-label="Export all data">
                                <Download className="h-3 w-3" /> Export
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'json')}>
                                <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                                <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}>
                                <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}>
                                <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}>
                                <ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {Object.entries(allTables).map(([tableName, rows]) => (
                        <DataTable
                          key={tableName}
                          tableName={tableName}
                          allRows={rows}
                          schemaObj={schemaObj}
                          onRegenerate={regenerateTable}
                          isLoading={isLoading}
                          onExportTable={exportTable}
                          onCopyTable={copyTable}
                        />
                      ))}
                    </>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center py-20"
                    >
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
                        <Table2 className="h-8 w-8 text-amber-700/50" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p>
                      <p className="text-xs text-muted-foreground mb-4">Chat with the AI to generate synthetic data</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => setMobileStudioTab('chat')}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" /> Start Chat
                      </Button>
                    </motion.div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">

              {Object.keys(schemaObj).length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20"
                >
                  <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4">
                    <Columns3 className="h-8 w-8 text-amber-700/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p>
                  <p className="text-xs text-muted-foreground mb-4">Ask the AI to design a database schema</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setMobileStudioTab('chat')}
                  >
                    <MessageSquare className="h-3 w-3 mr-1" /> Start Chat
                  </Button>
                </motion.div>
              ) : (
                Object.entries(schemaObj).map(([tableName, def]) => (
                  <SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="relationships" className="flex-1 mt-0 overflow-hidden">
          <SchemaVisualization />
        </TabsContent>

        <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
          <div className="p-4 space-y-3 flex-1 flex flex-col">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-semibold">SQL Playground</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">Preview Mode</Badge>
            </div>

            {/* SQL Suggestion Area */}
            {showSqlSuggestion && sqlSuggestion && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-amber-700" />
                  <span className="text-xs font-semibold text-amber-800">AI Suggestion</span>
                </div>
                <ScrollArea className="max-h-32">
                  <pre className="text-[11px] font-mono whitespace-pre-wrap text-amber-900">{sqlSuggestion}</pre>
                </ScrollArea>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => {
                      setSqlQuery(sqlSuggestion)
                      setShowSqlSuggestion(false)
                      setSqlSuggestion('')
                      toast({ title: 'SQL Accepted', description: 'AI suggestion applied to editor' })
                    }}
                  >
                    <Check className="h-2.5 w-2.5" /> Accept
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] gap-1 border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setShowSqlSuggestion(false)
                      setSqlSuggestion('')
                    }}
                  >
                    <X className="h-2.5 w-2.5" /> Reject
                  </Button>
                </div>
              </motion.div>
            )}

            {/* SQL Editor with Syntax Highlighting */}
            <div className="flex-1 relative">
              <Textarea
                value={sqlQuery}
                onChange={(e) => {
                  setSqlQuery(e.target.value)
                  validateSql(e.target.value)
                  setShowSqlSuggestion(false)
                }}
                placeholder={"-- Write a comment like: Get all users older than 30\n-- Or type SQL directly:\nSELECT * FROM users LIMIT 10;"}
                className="min-h-[120px] font-mono text-xs flex-1"
                aria-label="SQL query input"
              />
              {sqlValidationError && (
                <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {sqlValidationError}
                </div>
              )}
            </div>

            {/* SQL Action Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                size="sm"
                className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white h-7 text-xs"
                onClick={runSqlPlayground}
                disabled={!sqlQuery.trim()}
              >
                <Play className="h-3 w-3 mr-1" /> Run
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  const commentMatch = sqlQuery.match(/^--\s*(.+)$/m)
                  if (commentMatch) {
                    sendMessage(`Generate SQL for: ${commentMatch[1]}`)
                  } else if (sqlQuery.trim()) {
                    sendMessage(`Generate an improved or alternative SQL query for: ${sqlQuery.trim()}`)
                  } else {
                    toast({ title: 'No query', description: 'Write a comment (-- text) or SQL query first', variant: 'destructive' })
                  }
                }}
                disabled={isLoading || !sqlQuery.trim()}
              >
                <Wand2 className="h-3 w-3" /> Ask AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  if (!sqlQuery.trim()) {
                    toast({ title: 'No query', description: 'Write a SQL query first', variant: 'destructive' })
                    return
                  }
                  sendMessage(`Explain this SQL query in plain English: ${sqlQuery.trim()}`)
                }}
                disabled={isLoading || !sqlQuery.trim()}
              >
                <HelpCircle className="h-3 w-3" /> Explain
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  if (!sqlQuery.trim()) return
                  // Simple SQL formatting
                  let formatted = sqlQuery
                    .replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|ORDER BY|GROUP BY|HAVING|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|AS|IN|NOT|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|LIMIT|OFFSET|UNION|CASE|WHEN|THEN|ELSE|END)\b/gi, '\n$1')
                    .replace(/^\n/, '')
                    .replace(/\n\n+/g, '\n')
                  setSqlQuery(formatted)
                }}
              >
                <AlignLeft className="h-3 w-3" /> Format
              </Button>
            </div>

            {sqlResult && (
              <ScrollArea className="max-h-64">
                <pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap">
                  {sqlResult}
                </pre>
              </ScrollArea>
            )}
          </div>
        </TabsContent>

        <TabsContent value="explorer" className="flex-1 mt-0 overflow-hidden">
          <ExplorerTree />
        </TabsContent>
      </Tabs>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // LANDING PAGE
  // ═══════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div className="min-h-screen flex flex-col bg-white overflow-x-hidden">
        <style>{gradientStyle}</style>
        {/* Nav */}
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight">SynthForge AI</span>
            </div>
            <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
              <button className="hover:text-foreground transition-colors">Features</button>
              <button className="hover:text-foreground transition-colors">Pricing</button>
              <button className="hover:text-foreground transition-colors">Docs</button>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
                Dashboard
              </Button>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => setView('dashboard')}>
                  Get Started Free
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.nav>

        {/* Hero */}
        <main className="flex-1">
          <section className="relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: 'linear-gradient(135deg, #f59e0b15, #ef444415, #f59e0b15, #8b5cf615)',
                backgroundSize: '400% 400%',
                animation: 'gradientShift 15s ease infinite'
              }}
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-32">
              <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Badge className="mb-4 bg-amber-100 text-amber-800 border-amber-200">
                    <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Synthetic Data
                  </Badge>
                  <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                    Generate <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-red-700">Realistic Data</span> in Seconds
                  </h1>
                  <p className="text-base sm:text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
                    Create privacy-safe, relationally intact synthetic data from scratch.
                    Just describe what you need and our multi-agent AI generates statistically accurate datasets instantly.
                  </p>
                  <div className="flex flex-wrap gap-3 mb-8">
                    <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                      <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white text-base px-8" onClick={() => setView('dashboard')}>
                        Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </motion.div>
                    <Button size="lg" variant="outline" className="text-base" onClick={() => setView('dashboard')}>
                      Try Demo
                    </Button>
                  </div>
                  <div className="flex gap-6 sm:gap-8">
                    {[
                      { value: '10M+', label: 'Rows Generated' },
                      { value: '99.2%', label: 'FK Integrity' },
                      { value: '<3s', label: 'Avg Gen Time' }
                    ].map((stat, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                      >
                        <p className="text-2xl font-bold text-amber-700">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 30, y: 20 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="relative hidden sm:block"
                >
                  <Card className="shadow-2xl border-0 bg-white">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-400" />
                        <div className="h-3 w-3 rounded-full bg-amber-400" />
                        <div className="h-3 w-3 rounded-full bg-green-400" />
                        <span className="ml-2 text-xs text-muted-foreground font-mono">SynthForge AI Studio</span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="bg-muted rounded-lg p-3 text-sm">
                        <span className="text-amber-700 font-medium">You:</span> Generate realistic sample data for my project
                      </div>
                      <div className="bg-primary/5 rounded-lg p-3 text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-primary font-medium">SynthForge:</span>
                          <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200"><Wand2 className="h-2.5 w-2.5 mr-0.5" /> auto-agent</Badge>
                        </div>
                        <p className="text-muted-foreground">I&apos;ll design a schema and generate realistic synthetic data based on your requirements.</p>
                        <div className="bg-white rounded border p-2 font-mono text-xs overflow-hidden">
                          <p className="text-green-700">-- 3 tables generated</p>
                          <p className="text-muted-foreground">users (50 rows) | orders (127 rows) | products (30 rows)</p>
                          <p className="text-amber-700 mt-1">-- Referential integrity: OK</p>
                          <p className="text-amber-700">-- PII check: All synthetic</p>
                          <p className="text-sky-700">-- Quality score: 94/100</p>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Brain className="h-3 w-3" /> 6 reasoning steps completed
                        </div>
                        <div className="flex gap-1.5">
                          <Badge variant="outline" className="text-[9px] gap-0.5"><FileJson className="h-2.5 w-2.5" />JSON</Badge>
                          <Badge variant="outline" className="text-[9px] gap-0.5"><FileText className="h-2.5 w-2.5" />CSV</Badge>
                          <Badge variant="outline" className="text-[9px] gap-0.5"><Code2 className="h-2.5 w-2.5" />SQL</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </section>

          {/* Features */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 bg-slate-50/50">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <Badge variant="outline" className="mb-4">Core Features</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
            </motion.div>
            <motion.div
              variants={staggerContainer}
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
            >
              {[
                { icon: Sparkles, title: 'AI-Powered Generation', desc: 'Describe data in natural language. Multi-agent AI generates realistic, domain-specific synthetic data instantly.', color: 'from-amber-100 to-amber-50' },
                { icon: Shield, title: 'Privacy-First', desc: 'Automatic PII detection and masking. All generated data is privacy-safe by design with quality scoring.', color: 'from-emerald-100 to-emerald-50' },
                { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT, or full SQL dump with CREATE TABLE statements. Copy to clipboard.', color: 'from-sky-100 to-sky-50' },
                { icon: Eye, title: 'Real-time Preview', desc: 'Instantly preview generated data with column type highlighting, FK indicators, and pagination.', color: 'from-purple-100 to-purple-50' }
              ].map((feature, i) => (
                <motion.div key={i} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                  <Card className="hover:shadow-lg transition-shadow h-full group">
                    <CardContent className="pt-6">
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <feature.icon className="h-5 w-5 text-foreground" />
                      </div>
                      <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* How it works */}
          <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground text-base sm:text-lg">Three steps from idea to data</p>
            </motion.div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Describe', desc: 'Tell the AI what data you need in natural language, or upload a schema file.', icon: MessageSquare },
                { step: '2', title: 'Generate', desc: 'Our multi-agent AI plans the schema, generates realistic data, and validates integrity.', icon: Wand2 },
                { step: '3', title: 'Export', desc: 'Preview the data, refine it with chat, and export in your preferred format.', icon: Download }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="text-center"
                >
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-lg mb-2 flex items-center justify-center gap-2">
                    <item.icon className="h-5 w-5 text-amber-700" />
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Social Proof / CTA */}
          <section className="bg-gradient-to-r from-amber-600 to-red-700 py-12 sm:py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to Generate Synthetic Data?</h2>
              <p className="text-white/80 text-base sm:text-lg mb-8 max-w-xl mx-auto">Start creating privacy-safe, realistic synthetic data in seconds. No credit card required.</p>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="lg"
                  className="bg-white text-amber-700 hover:bg-white/90 text-base px-8 font-semibold"
                  onClick={() => setView('dashboard')}
                >
                  Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="border-t py-8 bg-white mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-medium">SynthForge AI</span>
            </div>
            <p className="text-xs text-muted-foreground">Privacy-safe synthetic data generation</p>
          </div>
        </footer>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'dashboard') {
    const totalTables = allDatabases.reduce((sum, db) => {
      try {
        const schema = JSON.parse(db.schemaJson || '{}')
        return sum + Object.keys(schema).length
      } catch { return sum }
    }, 0)
    const totalRows = allDatabases.reduce((sum, db) => {
      try {
        const data = JSON.parse(db.dataJson || '{}')
        return sum + Object.values(data).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
      } catch { return sum }
    }, 0) as number
    const totalConversations = allDatabases.reduce((sum, db) => sum + (db._count?.conversations || 0), 0)

    return (
      <div className="min-h-screen flex bg-background overflow-x-hidden">
        {/* Sidebar */}
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
                <Button variant="ghost" size="sm" className="ml-auto md:hidden h-7 w-7 p-0" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Workspaces</p>
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      className={`w-full text-left p-2 rounded-md text-sm transition-colors ${activeWorkspace?.id === ws.id ? 'bg-muted font-medium' : 'hover:bg-muted/50'}`}
                      onClick={() => { setActiveWorkspace(ws); loadProjects(ws.id) }}
                    >
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
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
                          className="w-full text-left p-2 rounded-md text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                          onClick={() => openDatabase(db)}
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
                  onClick={() => setView('landing')}
                >
                  <ArrowRight className="h-3 w-3 mr-1 rotate-180" /> Back to Home
                </Button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {sidebarOpen && typeof window !== 'undefined' && window.innerWidth < 768 && (
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
        )}

        <main className="flex-1 min-h-screen min-w-0">
          <header className="h-14 border-b flex items-center px-4 gap-3 shrink-0 bg-card">
            <Button variant="ghost" size="sm" className="md:hidden h-8 w-8 p-0" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <Menu className="h-4 w-4" />
            </Button>
            <h1 className="font-semibold text-lg">Dashboard</h1>
            <div className="ml-auto flex items-center gap-2">
              <Dialog open={showNewDbDialog} onOpenChange={setShowNewDbDialog}>
                <DialogTrigger asChild>
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white gap-1">
                      <Plus className="h-4 w-4" /> New Database
                    </Button>
                  </motion.div>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Database</DialogTitle>
                    <DialogDescription>Create a new synthetic database to generate data with AI.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="new-db-name">Database Name</label>
                      <Input
                        id="new-db-name"
                        value={newDbName}
                        onChange={(e) => setNewDbName(e.target.value)}
                        placeholder="e.g., My Database"
                        onKeyDown={(e) => e.key === 'Enter' && createDatabase()}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" htmlFor="new-db-schema">Schema (Optional JSON)</label>
                      <Textarea
                        id="new-db-schema"
                        value={newDbSchema}
                        onChange={(e) => setNewDbSchema(e.target.value)}
                        placeholder='{"users": {"columns": {"id": "SERIAL", "name": "VARCHAR"}}}'
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>

                    <Button onClick={createDatabase} className="w-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white">
                      Create Database
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </header>

          <ScrollArea className="h-[calc(100vh-56px)]">
            <div className="p-4 sm:p-6 max-w-6xl mx-auto">
              {/* Workspace Stats */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8"
              >
                {[
                  { icon: <Database className="h-4 w-4 text-amber-700" />, label: 'Databases', value: allDatabases.length, color: 'from-amber-100 to-amber-50' },
                  { icon: <Table2 className="h-4 w-4 text-emerald-700" />, label: 'Total Tables', value: totalTables, color: 'from-emerald-100 to-emerald-50' },
                  { icon: <Rows3 className="h-4 w-4 text-sky-700" />, label: 'Total Rows', value: totalRows > 1000 ? `${(totalRows / 1000).toFixed(1)}k` : totalRows, color: 'from-sky-100 to-sky-50' },
                  { icon: <MessageSquare className="h-4 w-4 text-purple-700" />, label: 'Conversations', value: totalConversations, color: 'from-purple-100 to-purple-50' }
                ].map((stat, i) => (
                  <motion.div key={i} variants={staggerItem}>
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center mb-2`}>
                          {stat.icon}
                        </div>
                        <p className="text-xl sm:text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Quick Actions */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-8"
              >
                {[
                  { icon: <MessageSquare className="h-5 w-5 text-amber-700" />, title: 'Chat to Generate', desc: 'Describe data in natural language', action: () => allDatabases[0] ? openDatabase(allDatabases[0]) : setShowNewDbDialog(true) },
                  { icon: <Upload className="h-5 w-5 text-amber-700" />, title: 'Upload Schema', desc: 'Import SQL, CSV, or JSON', action: () => setShowNewDbDialog(true) },
                  { icon: <Wand2 className="h-5 w-5 text-amber-700" />, title: 'Auto Mode', desc: 'Plan & generate in one step', action: () => { setAgentMode('auto'); if (allDatabases[0]) openDatabase(allDatabases[0]) } }
                ].map((action, i) => (
                  <motion.div key={i} variants={staggerItem} whileHover={{ y: -2, transition: { duration: 0.15 } }}>
                    <Card className="cursor-pointer hover:shadow-md transition-all group" onClick={action.action}>
                      <CardContent className="pt-5 pb-4">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mb-2.5 group-hover:from-amber-200 group-hover:to-red-100 transition-colors">
                          {action.icon}
                        </div>
                        <h3 className="font-semibold text-sm">{action.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              {/* Recent Activity */}
              {messages.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" /> Recent Activity
                  </h2>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        {messages.slice(-5).reverse().map(msg => (
                          <div key={msg.id} className="flex items-start gap-3 text-xs">
                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                              {msg.role === 'user' ? <Hash className="h-3 w-3" /> : <Sparkles className="h-3 w-3 text-amber-600" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate">{msg.content.slice(0, 100)}</p>
                              <p className="text-muted-foreground mt-0.5">
                                <Clock className="h-2.5 w-2.5 inline mr-1" />
                                {new Date(msg.createdAt).toLocaleTimeString()}
                                {msg.tokensIn > 0 && <span className="ml-2">{msg.tokensIn + msg.tokensOut} tokens</span>}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Databases Grid */}
              <div className="mb-4">
                <h2 className="text-lg font-semibold mb-4">Your Databases</h2>
                {allDatabases.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16"
                  >
                    <Database className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">No databases yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Create your first database to start generating synthetic data</p>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white"
                      onClick={() => setShowNewDbDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Create Database
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    variants={staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {allDatabases.map(db => {
                      let tableCount = 0
                      let rowCount = 0
                      try {
                        const schema = JSON.parse(db.schemaJson || '{}')
                        tableCount = Object.keys(schema).length
                        const data = JSON.parse(db.dataJson || '{}')
                        rowCount = Object.values(data).reduce((s: number, rows) => s + (Array.isArray(rows) ? rows.length : 0), 0)
                      } catch { /* */ }

                      return (
                        <motion.div key={db.id} variants={staggerItem} whileHover={{ y: -3, transition: { duration: 0.15 } }}>
                          <Card className="cursor-pointer hover:shadow-lg transition-all group" onClick={() => openDatabase(db)}>
                            <CardHeader className="pb-2">
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                  <Database className="h-4 w-4 text-amber-700" />
                                  <span className="truncate">{db.name}</span>
                                </CardTitle>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Database options">
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); deleteDatabase(db.id) }}>
                                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs">{db.dbType}</Badge>
                                {tableCount > 0 && (
                                  <Badge variant="outline" className="text-xs gap-0.5">
                                    <Table2 className="h-2.5 w-2.5" /> {tableCount} tables
                                  </Badge>
                                )}
                                {rowCount > 0 && (
                                  <Badge variant="outline" className="text-xs gap-0.5">
                                    <Rows3 className="h-2.5 w-2.5" /> {rowCount} rows
                                  </Badge>
                                )}
                              </div>
                              {db.schemaJson && db.schemaJson !== '{}' && (() => {
                                try {
                                  const schema = JSON.parse(db.schemaJson)
                                  const tableNames = Object.keys(schema)
                                  return (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {tableNames.slice(0, 3).map(t => (
                                        <Badge key={t} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                                          <Table2 className="h-2.5 w-2.5 mr-0.5 text-amber-700" />
                                          {t}
                                        </Badge>
                                      ))}
                                      {tableNames.length > 3 && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{tableNames.length - 3}</Badge>
                                      )}
                                    </div>
                                  )
                                } catch { return null }
                              })()}
                              <p className="text-[10px] text-muted-foreground mt-2">
                                <Clock className="h-2.5 w-2.5 inline mr-1" />
                                Updated {new Date(db.updatedAt).toLocaleDateString()}
                              </p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </motion.div>
                )}
              </div>
            </div>
          </ScrollArea>
        </main>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════
  // STUDIO VIEW
  // ═══════════════════════════════════════════════════════════
  if (view === 'studio' && activeDb) {
    const allTables = getTablesFromMessages

    return (
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Studio Header */}
        <header className="border-b bg-card h-12 flex items-center px-3 gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1 text-xs h-7" aria-label="Back to dashboard">
            <ChevronRight className="h-3 w-3 rotate-180" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <Database className="h-4 w-4 text-amber-700 shrink-0" />
          <span className="font-semibold text-sm truncate max-w-[150px]">{activeDb.name}</span>
          <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{activeDb.dbType}</Badge>
          {(schemaVersionCount > 0 || messages.some(m => m.schemaVersion && m.schemaVersion > 0)) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex">
                    <GitBranch className="h-2.5 w-2.5" /> v{schemaVersionCount || messages.reduce((max, m) => Math.max(max, m.schemaVersion || 0), 0) || 1}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Schema version (evolution tracking)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Agent Mode Selector */}
          <Separator orientation="vertical" className="h-5 hidden md:block" />
          <div className="items-center gap-1 hidden md:flex">
            <span className="text-[10px] text-muted-foreground mr-1">Agent:</span>
            {(['plan', 'execute', 'auto'] as AgentMode[]).map((mode) => {
              const isPlan = mode === 'plan'
              const isExec = mode === 'execute'
              const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
              const label = isPlan ? 'Plan' : isExec ? 'Execute' : 'Auto'
              const activeColor = isPlan ? 'bg-sky-100 text-sky-800 border-sky-300' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'

              return (
                <Button
                  key={mode}
                  variant="outline"
                  size="sm"
                  className={`h-7 text-[11px] gap-1 px-2.5 ${agentMode === mode ? activeColor : 'text-muted-foreground'}`}
                  onClick={() => setAgentMode(mode)}
                  aria-label={`${label} mode`}
                >
                  {icon} {label}
                </Button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {totalTokens > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex">
                      <Zap className="h-2.5 w-2.5 text-amber-600" /> {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tok
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Total tokens used in this session</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Mobile Tab Toggle */}
            <div className="flex md:hidden items-center gap-0.5 bg-muted rounded-md p-0.5">
              <Button
                variant={mobileStudioTab === 'chat' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMobileStudioTab('chat')}
                aria-label="Chat tab"
              >
                <MessageSquare className="h-3 w-3" />
              </Button>
              <Button
                variant={mobileStudioTab === 'data' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => setMobileStudioTab('data')}
                aria-label="Data tab"
              >
                <Table2 className="h-3 w-3" />
              </Button>
            </div>

            {Object.keys(allTables).length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 text-xs h-7" aria-label="Export data">
                    <Download className="h-3 w-3" /> <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'json')}>
                    <FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}>
                    <Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}>
                    <Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}>
                    <ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        {/* Mobile: tab-based switching */}
        <div className="flex-1 overflow-hidden md:hidden">
          {mobileStudioTab === 'chat' ? <ChatPanel /> : <DataWorkspace />}
        </div>

        {/* Desktop: Resizable Panels — Chat 25% | Data 75% */}
        <div className="flex-1 overflow-hidden hidden md:block">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
              <ChatPanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75} minSize={40}>
              <DataWorkspace />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    )
  }

  // Fallback: if studio but no activeDb
  if (view === 'studio' && !activeDb) {
    setView('dashboard')
    return null
  }

  // Render Quality Report dialog (must be inside return)
  // Default fallback
  return <>{qualityReport && <QualityReportPanel />}</>
}
