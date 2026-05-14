'use client'

import React, { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Database, MessageSquare, ChevronRight,
  Table2, Download, Copy, Sparkles,
  Code2, FileJson, FileText, X, Check,
  Loader2, Play,
  Brain, Wand2, AlertCircle,
  Columns3,
  GitBranch, Zap, HelpCircle,
  AlignLeft, Bug, ClipboardCheck
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useToast } from '@/hooks/use-toast'

// Extracted components
import { TableTreeView } from '@/components/synthforge/table-tree-view'
import { DataTable } from '@/components/synthforge/data-table'
import { SchemaCard } from '@/components/synthforge/schema-card'
import { ChatPanel } from '@/components/synthforge/chat-panel'
import { QualityReportPanel } from '@/components/synthforge/quality-report-panel'
import { ERDiagram } from '@/components/synthforge/er-diagram'
import { ExplorerPanel } from '@/components/explorer-panel'
// AgentStatusPanel removed - agents are only visible inside the chat during AI thinking

// Shared types
import type { Database_, Message, Conversation, AgentStepUI, QualityReportData, View, AgentMode } from '@/components/synthforge/types'

// ─── DataWorkspacePanel Props ─────────────────────────
interface DataWorkspacePanelProps {
  rightTab: string
  setRightTab: (tab: string) => void
  allTables: Record<string, Record<string, unknown>[]>
  schemaObj: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  selectedTableName: string | null
  setSelectedTableName: (name: string | null) => void
  isLoading: boolean
  setMobileStudioTab: (tab: 'chat' | 'data') => void
  runQualityCheck: (autoFix?: boolean) => void
  isQualityCheckRunning: boolean
  exportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  exportTable: (name: string, rows: Record<string, unknown>[], format: string) => void
  copyTable: (name: string, rows: Record<string, unknown>[]) => void
  copyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  regenerateTable: (name: string) => void
  erSvgRef: React.RefObject<SVGSVGElement | null>
  explorerView: 'tree' | 'graph'
  setExplorerView: (view: 'tree' | 'graph') => void
  cutpoints: string[] | null
  reachableTables: string[] | null
  selectedGraphNode: string | null
  constraintClosureResult: { from: string; to: string; via: string; cascades: string[] }[] | null
  topologicalSortResult: string[] | null
  buildDependencyGraph: () => { allTableNames: Set<string>; edges: { from: string; to: string; via: string }[]; adj: Record<string, string[]>; revAdj: Record<string, string[]> }
  topologicalSort: () => string[]
  findCutpoints: () => string[]
  bfsReachable: (startNode: string) => string[]
  computeConstraintClosure: () => { from: string; to: string; via: string; cascades: string[] }[]
  graphSvgRef: React.RefObject<SVGSVGElement | null>
  sqlQuery: string
  setSqlQuery: (q: string) => void
  sqlResult: string
  sqlSuggestion: string
  showSqlSuggestion: boolean
  setShowSqlSuggestion: (show: boolean) => void
  setSqlSuggestion: (s: string) => void
  sqlValidationError: string
  runSqlPlayground: () => void
  validateSql: (sql: string) => void
  sendMessage: (messageText: string, files?: { name: string; content: string; type: string }[]) => void
  isLoadingChat: boolean
  toast: (opts: { title: string; description: string; variant?: 'default' | 'destructive' | null }) => void
}

// ─── DataWorkspacePanel (proper component, not inline) ───
const DataWorkspacePanel = React.memo(function DataWorkspacePanel({
  rightTab,
  setRightTab,
  allTables,
  schemaObj,
  selectedTableName,
  setSelectedTableName,
  isLoading,
  setMobileStudioTab,
  runQualityCheck,
  isQualityCheckRunning,
  exportData,
  exportTable,
  copyTable,
  copyAllData,
  regenerateTable,
  erSvgRef,
  explorerView,
  setExplorerView,
  cutpoints,
  reachableTables,
  selectedGraphNode,
  constraintClosureResult,
  topologicalSortResult,
  buildDependencyGraph,
  topologicalSort,
  findCutpoints,
  bfsReachable,
  computeConstraintClosure,
  graphSvgRef,
  sqlQuery,
  setSqlQuery,
  sqlResult,
  sqlSuggestion,
  showSqlSuggestion,
  setShowSqlSuggestion,
  setSqlSuggestion,
  sqlValidationError,
  runSqlPlayground,
  validateSql,
  sendMessage,
  isLoadingChat,
  toast,
}: DataWorkspacePanelProps) {
  return (
    <Tabs value={rightTab} onValueChange={setRightTab} className="flex flex-col h-full">
      <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-10 px-3 shrink-0">
        <TabsTrigger value="preview" className="text-xs data-[state=active]:bg-muted">Data</TabsTrigger>
        <TabsTrigger value="schema" className="text-xs data-[state=active]:bg-muted">Schema</TabsTrigger>
        <TabsTrigger value="relationships" className="text-xs data-[state=active]:bg-muted">ER Diagram</TabsTrigger>
        <TabsTrigger value="sql" className="text-xs data-[state=active]:bg-muted">SQL</TabsTrigger>
        <TabsTrigger value="explorer" className="text-xs data-[state=active]:bg-muted">Explorer</TabsTrigger>

      </TabsList>

      <TabsContent value="preview" className="flex-1 overflow-hidden mt-0">
        <div className="flex h-full">
          <div className="w-48 shrink-0 border-r bg-muted/20 overflow-y-auto">
            <div className="p-2">
              <TableTreeView tableNames={Object.keys(allTables)} tableRowCounts={Object.fromEntries(Object.entries(allTables).map(([k, v]) => [k, v.length]))} selectedTable={selectedTableName} onSelectTable={setSelectedTableName} />
            </div>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <div className="p-4 space-y-4 min-w-fit">
                {isLoading && Object.keys(allTables).length === 0 ? (
                  <div className="space-y-4">{[1, 2].map(i => <Card key={i}><CardHeader className="pb-2"><div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-14" /></div></CardHeader><CardContent><div className="space-y-2"><div className="flex gap-4">{[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-3 w-16" />)}</div>{[1, 2, 3, 4, 5].map(j => <div key={j} className="flex gap-4">{[1, 2, 3, 4].map(k => <Skeleton key={k} className="h-3 w-20" />)}</div>)}</div></CardContent></Card>)}</div>
                ) : selectedTableName && allTables[selectedTableName] ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setSelectedTableName(null)}><ChevronRight className="h-3 w-3 mr-1" />All Tables</Button>
                      <span className="text-xs text-muted-foreground">{selectedTableName} · {allTables[selectedTableName].length} rows</span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300" onClick={() => runQualityCheck(false)} disabled={isQualityCheckRunning}>{isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}Quality</Button>
                        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> Export</Button></DropdownMenuTrigger><DropdownMenuContent>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard</DropdownMenuItem>
                        </DropdownMenuContent></DropdownMenu>
                      </div>
                    </div>
                    <DataTable key={selectedTableName} tableName={selectedTableName} allRows={allTables[selectedTableName]} schemaObj={schemaObj} onRegenerate={regenerateTable} isLoading={isLoading} onExportTable={exportTable} onCopyTable={copyTable} />
                  </>
                ) : !selectedTableName && Object.keys(allTables).length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">{Object.keys(allTables).length} table{Object.keys(allTables).length !== 1 ? 's' : ''} · {Object.values(allTables).reduce((s, r) => s + r.length, 0)} total rows</span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="outline" size="sm" className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300" onClick={() => runQualityCheck(false)} disabled={isQualityCheckRunning}>{isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}Quality</Button>
                        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> Export</Button></DropdownMenuTrigger><DropdownMenuContent>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump (CREATE + INSERT)</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard</DropdownMenuItem>
                        </DropdownMenuContent></DropdownMenu>
                      </div>
                    </div>
                    {Object.entries(allTables).map(([tableName, rows]) => <DataTable key={tableName} tableName={tableName} allRows={rows} schemaObj={schemaObj} onRegenerate={regenerateTable} isLoading={isLoading} onExportTable={exportTable} onCopyTable={copyTable} />)}
                  </>
                ) : (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Table2 className="h-8 w-8 text-amber-700/50" /></div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Chat with the AI to generate synthetic data</p>
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => setMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button>
                  </motion.div>
                )}
              </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {Object.keys(schemaObj).length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Columns3 className="h-8 w-8 text-amber-700/50" /></div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p>
                <p className="text-xs text-muted-foreground mb-4">Ask the AI to design a database schema</p>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button>
              </motion.div>
            ) : Object.entries(schemaObj).map(([tableName, def]) => <SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} relationships={(def as any).relationships} rowCount={allTables[tableName]?.length} indexes={(def as any).indexes} constraints={(def as any).constraints} />)}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="relationships" className="flex-1 mt-0 overflow-hidden">
        <ERDiagram schema={schemaObj} tables={allTables} erSvgRef={erSvgRef} />
      </TabsContent>

      <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
        <div className="p-4 space-y-3 flex-1 flex flex-col">
          <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-amber-700" /><span className="text-sm font-semibold">SQL Playground</span><Badge variant="secondary" className="text-[10px] ml-auto">Preview Mode</Badge></div>

          {showSqlSuggestion && sqlSuggestion && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amber-700" /><span className="text-xs font-semibold text-amber-800">AI Suggestion</span></div>
              <ScrollArea className="max-h-32"><pre className="text-[11px] font-mono whitespace-pre-wrap text-amber-900">{sqlSuggestion}</pre></ScrollArea>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setSqlQuery(sqlSuggestion); setShowSqlSuggestion(false); setSqlSuggestion(''); toast({ title: 'SQL Accepted', description: 'AI suggestion applied to editor' }) }}><Check className="h-2.5 w-2.5" /> Accept</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setShowSqlSuggestion(false); setSqlSuggestion('') }}><X className="h-2.5 w-2.5" /> Reject</Button>
              </div>
            </motion.div>
          )}

          <div className="flex-1 relative">
            <Textarea value={sqlQuery} onChange={(e) => { setSqlQuery(e.target.value); validateSql(e.target.value); setShowSqlSuggestion(false) }} placeholder={"-- Write a comment like: Get all users older than 30\n-- Or type SQL directly:\nSELECT * FROM users LIMIT 10;"} className="min-h-[120px] font-mono text-xs flex-1" aria-label="SQL query input" />
            {sqlValidationError && <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded"><AlertCircle className="h-3 w-3 shrink-0" />{sqlValidationError}</div>}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white h-7 text-xs" onClick={runSqlPlayground} disabled={!sqlQuery.trim()}><Play className="h-3 w-3 mr-1" /> Run</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { const commentMatch = sqlQuery.match(/^--\s*(.+)$/m); if (commentMatch) sendMessage(`Generate SQL for: ${commentMatch[1]}`); else if (sqlQuery.trim()) sendMessage(`Generate an improved or alternative SQL query for: ${sqlQuery.trim()}`); else toast({ title: 'No query', description: 'Write a comment (-- text) or SQL query first', variant: 'destructive' }) }} disabled={isLoadingChat || !sqlQuery.trim()}><Wand2 className="h-3 w-3" /> Ask AI</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) { toast({ title: 'No query', description: 'Write a SQL query first', variant: 'destructive' }); return } sendMessage(`Explain this SQL query in plain English: ${sqlQuery.trim()}`) }} disabled={isLoadingChat || !sqlQuery.trim()}><HelpCircle className="h-3 w-3" /> Explain</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) return; let formatted = sqlQuery.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|ORDER BY|GROUP BY|HAVING|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|AS|IN|NOT|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|LIMIT|OFFSET|UNION|CASE|WHEN|THEN|ELSE|END)\b/gi, '\n$1').replace(/^\n/, '').replace(/\n\n+/g, '\n'); setSqlQuery(formatted) }}><AlignLeft className="h-3 w-3" /> Format</Button>
          </div>

          {sqlResult && <ScrollArea className="max-h-64"><pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap">{sqlResult}</pre></ScrollArea>}
        </div>
      </TabsContent>

      <TabsContent value="explorer" className="flex-1 mt-0 overflow-hidden">
        <ExplorerPanel
          tables={allTables} schema={schemaObj} explorerView={explorerView} setExplorerView={setExplorerView}
          cutpoints={cutpoints} reachableTables={reachableTables} selectedGraphNode={selectedGraphNode}
          constraintClosureResult={constraintClosureResult} topologicalSortResult={topologicalSortResult}
          buildDependencyGraph={buildDependencyGraph} topologicalSort={topologicalSort}
          findCutpoints={findCutpoints} bfsReachable={bfsReachable}
          computeConstraintClosure={computeConstraintClosure}
          onNavigateToData={() => setRightTab('preview')}
          graphSvgRef={graphSvgRef}
        />
      </TabsContent>


    </Tabs>
  )
})

// ─── StudioView Props ────────────────────────────────
interface StudioViewProps {
  activeDb: Database_
  messages: Message[]
  isLoading: boolean
  isDragOver: boolean
  isOnline: boolean
  conversation: Conversation | null
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
  attachedFiles: { name: string; content: string; type: string }[]
  allTables: Record<string, Record<string, unknown>[]>
  schemaObj: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  selectedTableName: string | null
  setSelectedTableName: (name: string | null) => void
  mobileStudioTab: 'chat' | 'data'
  setMobileStudioTab: (tab: 'chat' | 'data') => void
  totalTokens: number
  schemaVersionCount: number
  agentSteps: AgentStepUI[]
  // Callbacks
  sendMessage: (messageText: string, files?: { name: string; content: string; type: string }[]) => void
  handleAbort: () => void
  handleSendMessage: (messageText: string, files: { name: string; content: string; type: string }[]) => void
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => void
  removeFile: (index: number) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  handleRetry: (msgId: string) => void
  handleRegenerate: (msgId: string) => void
  copyToClipboard: (text: string) => void
  exportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  exportTable: (name: string, rows: Record<string, unknown>[], format: string) => void
  copyTable: (name: string, rows: Record<string, unknown>[]) => void
  copyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  regenerateTable: (name: string) => void
  runQualityCheck: (autoFix?: boolean) => void
  isQualityCheckRunning: boolean
  qualityReport: QualityReportData | null
  showQualityReport: boolean
  setShowQualityReport: (show: boolean) => void
  // Explorer
  explorerView: 'tree' | 'graph'
  setExplorerView: (view: 'tree' | 'graph') => void
  cutpoints: string[] | null
  reachableTables: string[] | null
  selectedGraphNode: string | null
  constraintClosureResult: { from: string; to: string; via: string; cascades: string[] }[] | null
  topologicalSortResult: string[] | null
  buildDependencyGraph: () => { allTableNames: Set<string>; edges: { from: string; to: string; via: string }[]; adj: Record<string, string[]>; revAdj: Record<string, string[]> }
  topologicalSort: () => string[]
  findCutpoints: () => string[]
  bfsReachable: (startNode: string) => string[]
  computeConstraintClosure: () => { from: string; to: string; via: string; cascades: string[] }[]
  graphSvgRef: React.RefObject<SVGSVGElement | null>
  erSvgRef: React.RefObject<SVGSVGElement | null>
  // Navigation
  setView: (view: View) => void
  setRightTab: (tab: string) => void
  rightTab: string
}

const StudioView = React.memo(function StudioView({
  activeDb,
  messages,
  isLoading,
  isDragOver,
  isOnline,
  conversation,
  agentMode,
  setAgentMode,
  attachedFiles,
  allTables,
  schemaObj,
  selectedTableName,
  setSelectedTableName,
  mobileStudioTab,
  setMobileStudioTab,
  totalTokens,
  schemaVersionCount,
  agentSteps,
  sendMessage,
  handleAbort,
  handleSendMessage,
  handleFileUpload,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  removeFile,
  fileInputRef,
  handleRetry,
  handleRegenerate,
  copyToClipboard,
  exportData,
  exportTable,
  copyTable,
  copyAllData,
  regenerateTable,
  runQualityCheck,
  isQualityCheckRunning,
  qualityReport,
  showQualityReport,
  setShowQualityReport,
  explorerView,
  setExplorerView,
  cutpoints,
  reachableTables,
  selectedGraphNode,
  constraintClosureResult,
  topologicalSortResult,
  buildDependencyGraph,
  topologicalSort,
  findCutpoints,
  bfsReachable,
  computeConstraintClosure,
  graphSvgRef,
  erSvgRef,
  setView,
  setRightTab,
  rightTab,
}: StudioViewProps) {
  // ─── SQL Playground state (only used in Studio View) ───
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<string>('')
  const [sqlSuggestion, setSqlSuggestion] = useState<string>('')
  const [showSqlSuggestion, setShowSqlSuggestion] = useState(false)
  const [sqlValidationError, setSqlValidationError] = useState<string>('')

  const { toast } = useToast()

  // ─── SQL Playground functions ────────────────────────
  const runSqlPlayground = useCallback(() => {
    if (!sqlQuery.trim()) return
    const tables = allTables
    const tableName = sqlQuery.match(/FROM\s+(\w+)/i)?.[1] || sqlQuery.match(/from\s+(\w+)/i)?.[1]
    if (tableName && tables[tableName]) {
      setSqlResult(`Found ${tables[tableName].length} rows in "${tableName}"\n\n${JSON.stringify(tables[tableName].slice(0, 5), null, 2)}${tables[tableName].length > 5 ? '\n\n... and more' : ''}`)
    } else {
      setSqlResult(`Query executed (simulated)\n\nAvailable tables: ${Object.keys(tables).join(', ') || 'None'}\n\nNote: SQL Playground runs in preview mode. Generated data is available for inspection.`)
    }
  }, [sqlQuery, allTables])

  const validateSql = useCallback((sql: string) => {
    if (!sql.trim()) { setSqlValidationError(''); return }
    let parenCount = 0
    for (const char of sql) { if (char === '(') parenCount++; if (char === ')') parenCount--; if (parenCount < 0) { setSqlValidationError('Unbalanced parentheses: extra closing ")"'); return } }
    if (parenCount > 0) { setSqlValidationError(`Unbalanced parentheses: missing ${parenCount} closing ")"`); return }
    const upperSql = sql.toUpperCase().trim()
    if (upperSql.endsWith('FROM') || upperSql.endsWith('SELECT') || upperSql.endsWith('WHERE') || upperSql.endsWith('JOIN') || upperSql.endsWith('ON')) { setSqlValidationError('Query appears incomplete (ends with a keyword)'); return }
    setSqlValidationError('')
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Studio Header */}
      <header className="border-b bg-card h-12 flex items-center px-3 gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setView('dashboard')} className="gap-1 text-xs h-7" aria-label="Back to dashboard"><ChevronRight className="h-3 w-3 rotate-180" /><span className="hidden sm:inline">Back</span></Button>
        <Separator orientation="vertical" className="h-5" />
        <Database className="h-4 w-4 text-amber-700 shrink-0" />
        <span className="font-semibold text-sm truncate max-w-[150px]">{activeDb.name}</span>
        <Badge variant="secondary" className="text-xs hidden sm:inline-flex">{activeDb.dbType}</Badge>
        {(schemaVersionCount > 0 || messages.some(m => m.schemaVersion && m.schemaVersion > 0)) && (
          <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex"><GitBranch className="h-2.5 w-2.5" /> v{schemaVersionCount || messages.reduce((max, m) => Math.max(max, m.schemaVersion || 0), 0) || 1}</Badge>
        )}

        <Separator orientation="vertical" className="h-5 hidden md:block" />
        <div className="items-center gap-1 hidden md:flex">
          <span className="text-[10px] text-muted-foreground mr-1">Agent:</span>
          {(['plan', 'execute', 'auto'] as AgentMode[]).map((mode) => {
            const isPlan = mode === 'plan'; const isExec = mode === 'execute'
            const icon = isPlan ? <Brain className="h-3 w-3" /> : isExec ? <Play className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />
            const label = isPlan ? 'Plan' : isExec ? 'Execute' : 'Auto'
            const activeColor = isPlan ? 'bg-sky-100 text-sky-800 border-sky-300' : isExec ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-amber-100 text-amber-800 border-amber-300'
            return <Button key={mode} variant="outline" size="sm" className={`h-7 text-[11px] gap-1 px-2.5 ${agentMode === mode ? activeColor : 'text-muted-foreground'}`} onClick={() => setAgentMode(mode)} aria-label={`${label} mode`}>{icon} {label}</Button>
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {totalTokens > 0 && <Badge variant="outline" className="text-[10px] gap-1 font-mono hidden sm:inline-flex"><Zap className="h-2.5 w-2.5 text-amber-600" /> {totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} tok</Badge>}

          <div className="flex md:hidden items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button variant={mobileStudioTab === 'chat' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setMobileStudioTab('chat')} aria-label="Chat tab"><MessageSquare className="h-3 w-3" /></Button>
            <Button variant={mobileStudioTab === 'data' ? 'secondary' : 'ghost'} size="sm" className="h-6 text-xs px-2" onClick={() => setMobileStudioTab('data')} aria-label="Data tab"><Table2 className="h-3 w-3" /></Button>
          </div>

          {Object.keys(allTables).length > 0 && (
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7"><Download className="h-3 w-3" /> <span className="hidden sm:inline">Export</span></Button></DropdownMenuTrigger><DropdownMenuContent>
              <DropdownMenuItem onClick={() => exportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => copyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden md:hidden">
        {mobileStudioTab === 'chat' ? <ChatPanel messages={messages} isLoading={isLoading} isDragOver={isDragOver} isOnline={isOnline} onSendMessage={sendMessage} onAbort={handleAbort} onHandleSendMessage={handleSendMessage} attachedFiles={attachedFiles} onFileUpload={handleFileUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onRemoveFile={removeFile} fileInputRef={fileInputRef} onRetry={handleRetry} onRegenerate={handleRegenerate} onCopyToClipboard={copyToClipboard} onExportData={exportData} onCopyAllData={copyAllData} agentSteps={agentSteps} allTables={allTables} /> : (
          <DataWorkspacePanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            allTables={allTables}
            schemaObj={schemaObj}
            selectedTableName={selectedTableName}
            setSelectedTableName={setSelectedTableName}
            isLoading={isLoading}
            setMobileStudioTab={setMobileStudioTab}
            runQualityCheck={runQualityCheck}
            isQualityCheckRunning={isQualityCheckRunning}
            exportData={exportData}
            exportTable={exportTable}
            copyTable={copyTable}
            copyAllData={copyAllData}
            regenerateTable={regenerateTable}
            erSvgRef={erSvgRef}
            explorerView={explorerView}
            setExplorerView={setExplorerView}
            cutpoints={cutpoints}
            reachableTables={reachableTables}
            selectedGraphNode={selectedGraphNode}
            constraintClosureResult={constraintClosureResult}
            topologicalSortResult={topologicalSortResult}
            buildDependencyGraph={buildDependencyGraph}
            topologicalSort={topologicalSort}
            findCutpoints={findCutpoints}
            bfsReachable={bfsReachable}
            computeConstraintClosure={computeConstraintClosure}
            graphSvgRef={graphSvgRef}
            sqlQuery={sqlQuery}
            setSqlQuery={setSqlQuery}
            sqlResult={sqlResult}
            sqlSuggestion={sqlSuggestion}
            showSqlSuggestion={showSqlSuggestion}
            setShowSqlSuggestion={setShowSqlSuggestion}
            setSqlSuggestion={setSqlSuggestion}
            sqlValidationError={sqlValidationError}
            runSqlPlayground={runSqlPlayground}
            validateSql={validateSql}
            sendMessage={sendMessage}
            isLoadingChat={isLoading}
            toast={toast}
          />
        )}
      </div>
      <div className="flex-1 overflow-hidden hidden md:block">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
            <ChatPanel messages={messages} isLoading={isLoading} isDragOver={isDragOver} isOnline={isOnline} onSendMessage={sendMessage} onAbort={handleAbort} onHandleSendMessage={handleSendMessage} attachedFiles={attachedFiles} onFileUpload={handleFileUpload} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onRemoveFile={removeFile} fileInputRef={fileInputRef} onRetry={handleRetry} onRegenerate={handleRegenerate} onCopyToClipboard={copyToClipboard} onExportData={exportData} onCopyAllData={copyAllData} agentSteps={agentSteps} allTables={allTables} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={75} minSize={40}>
            <DataWorkspacePanel
              rightTab={rightTab}
              setRightTab={setRightTab}
              allTables={allTables}
              schemaObj={schemaObj}
              selectedTableName={selectedTableName}
              setSelectedTableName={setSelectedTableName}
              isLoading={isLoading}
              setMobileStudioTab={setMobileStudioTab}
              runQualityCheck={runQualityCheck}
              isQualityCheckRunning={isQualityCheckRunning}
              exportData={exportData}
              exportTable={exportTable}
              copyTable={copyTable}
              copyAllData={copyAllData}
              regenerateTable={regenerateTable}
              erSvgRef={erSvgRef}
              explorerView={explorerView}
              setExplorerView={setExplorerView}
              cutpoints={cutpoints}
              reachableTables={reachableTables}
              selectedGraphNode={selectedGraphNode}
              constraintClosureResult={constraintClosureResult}
              topologicalSortResult={topologicalSortResult}
              buildDependencyGraph={buildDependencyGraph}
              topologicalSort={topologicalSort}
              findCutpoints={findCutpoints}
              bfsReachable={bfsReachable}
              computeConstraintClosure={computeConstraintClosure}
              graphSvgRef={graphSvgRef}
              sqlQuery={sqlQuery}
              setSqlQuery={setSqlQuery}
              sqlResult={sqlResult}
              sqlSuggestion={sqlSuggestion}
              showSqlSuggestion={showSqlSuggestion}
              setShowSqlSuggestion={setShowSqlSuggestion}
              setSqlSuggestion={setSqlSuggestion}
              sqlValidationError={sqlValidationError}
              runSqlPlayground={runSqlPlayground}
              validateSql={validateSql}
              sendMessage={sendMessage}
              isLoadingChat={isLoading}
              toast={toast}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <QualityReportPanel qualityReport={qualityReport} showQualityReport={showQualityReport} setShowQualityReport={setShowQualityReport} onRunQualityCheck={runQualityCheck} isQualityCheckRunning={isQualityCheckRunning} />
    </div>
  )
})

export { StudioView }
export type { StudioViewProps }
