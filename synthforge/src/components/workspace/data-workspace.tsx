'use client'

import React from 'react'
import { motion } from 'framer-motion'
import {
  Table2, Download, Copy, Sparkles, Code2, Database,
  FileJson, FileText, Trash2, Loader2, MessageSquare,
  Columns3, Layers, ChevronDown, Check, X, Play,
  Wand2, HelpCircle, Zap, AlignLeft, Bug, ClipboardCheck,
  AlertCircle, Upload, FileUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore } from '@/stores/app-store'
import { DataTable } from '@/components/data/data-table'
import { SchemaCard } from '@/components/data/schema-card'
import { SchemaVisualization, ExplorerTree } from '@/components/visualization/schema-visualization'
import { schemaTemplates } from '@/lib/constants'
import { useSQLHighlight, useSQLValidation } from '@/lib/sql-utils'
import { extractSchemaFromSQL, extractSchemaFromJSON, extractSchemaFromCSV } from '@/lib/schema-extract'
import type { SchemaDef } from '@/lib/types'

interface DataWorkspaceProps {
  allTables: Record<string, Record<string, unknown>[]>
  schemaObj: Record<string, SchemaDef>
  onSendMessage: (text: string) => void
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onExportTable: (tableName: string, rows: Record<string, unknown>[], format: string) => void
  onCopyTable: (tableName: string, rows: Record<string, unknown>[]) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onRegenerateTable: (tableName: string) => void
  onRunQualityCheck: (autoFix?: boolean) => void
  onSetMobileStudioTab: (tab: 'chat' | 'data') => void
  graphAnalysis: ReturnType<typeof import('@/hooks/use-graph-analysis').useGraphAnalysis>
}

export const DataWorkspace = React.memo(function DataWorkspace({
  allTables, schemaObj, onSendMessage, onExportData, onExportTable,
  onCopyTable, onCopyAllData, onRegenerateTable, onRunQualityCheck,
  onSetMobileStudioTab, graphAnalysis
}: DataWorkspaceProps) {
  const rightTab = useAppStore((s) => s.rightTab)
  const setRightTab = useAppStore((s) => s.setRightTab)
  const sqlQuery = useAppStore((s) => s.sqlQuery)
  const setSqlQuery = useAppStore((s) => s.setSqlQuery)
  const sqlResult = useAppStore((s) => s.sqlResult)
  const setSqlResult = useAppStore((s) => s.setSqlResult)
  const isLoading = useAppStore((s) => s.isLoading)
  const isQualityCheckRunning = useAppStore((s) => s.isQualityCheckRunning)
  const showSchemaTemplates = useAppStore((s) => s.showSchemaTemplates)
  const setShowSchemaTemplates = useAppStore((s) => s.setShowSchemaTemplates)
  const showSqlSuggestion = useAppStore((s) => s.showSqlSuggestion)
  const sqlSuggestion = useAppStore((s) => s.sqlSuggestion)
  const setSqlSuggestion = useAppStore((s) => s.setSqlSuggestion)
  const setShowSqlSuggestion = useAppStore((s) => s.setShowSqlSuggestion)
  const sqlValidationError = useAppStore((s) => s.sqlValidationError)
  const setSqlValidationError = useAppStore((s) => s.setSqlValidationError)
  const setNewDbSchema = useAppStore((s) => s.setNewDbSchema)
  const activeDb = useAppStore((s) => s.activeDb)
  const { highlightSQL } = useSQLHighlight()
  const { validateSql } = useSQLValidation()
  const [sqlGenerating, setSqlGenerating] = React.useState(false)
  const schemaFileInputRef = React.useRef<HTMLInputElement>(null)
  const [schemaInput, setSchemaInput] = React.useState('')
  const [schemaParseError, setSchemaParseError] = React.useState('')
  const [parsedSchemaPreview, setParsedSchemaPreview] = React.useState<Record<string, { columns: Record<string, string> }> | null>(null)

  const handleSqlAskAI = async () => {
    const comment = sqlQuery.trim()
    if (!comment) return
    setSqlGenerating(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: comment,
          sqlOnly: true,
          stream: false,
          databaseId: activeDb?.id || ''
        })
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errData.error || 'SQL generation failed')
      }
      const data = await res.json()
      const content = data.message?.content || data.message?.sqlCode || ''
      let extractedSql = ''
      // Try to extract SQL from the response
      try {
        const parsed = JSON.parse(content)
        extractedSql = parsed.sqlCode || ''
        if (!extractedSql && parsed.explanation) {
          // Try to find SQL code blocks
          const sqlMatch = parsed.explanation.match(/```sql\n([\s\S]*?)```/)
          if (sqlMatch) extractedSql = sqlMatch[1].trim()
        }
      } catch {
        // Content might be plain text with SQL
        const sqlMatch = content.match(/```sql\n([\s\S]*?)```/)
        if (sqlMatch) extractedSql = sqlMatch[1].trim()
        else if (content.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)/im)) extractedSql = content.trim()
      }
      if (extractedSql) {
        setSqlQuery(extractedSql)
        setSqlValidationError('')
      } else {
        throw new Error('No SQL was generated. Please try rephrasing your request.')
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'SQL generation failed'
      import('@/hooks/use-toast').then(m => m.useToast().toast).then(toast => toast({ title: 'SQL Generation Error', description: errMsg, variant: 'destructive' }))
    } finally {
      setSqlGenerating(false)
    }
  }

  const runSqlPlayground = () => {
    if (!sqlQuery.trim()) return
    const tables = allTables
    const tableName = sqlQuery.match(/FROM\s+(\w+)/i)?.[1] || sqlQuery.match(/from\s+(\w+)/i)?.[1]
    if (tableName && tables[tableName]) {
      setSqlResult(`Found ${tables[tableName].length} rows in "${tableName}"\n\n${JSON.stringify(tables[tableName].slice(0, 5), null, 2)}${tables[tableName].length > 5 ? '\n\n... and more' : ''}`)
    } else {
      setSqlResult(`Query executed (simulated)\n\nAvailable tables: ${Object.keys(tables).join(', ') || 'None'}\n\nNote: SQL Playground runs in preview mode. Generated data is available for inspection.`)
    }
  }

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
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {isLoading && Object.keys(allTables).length === 0 ? (
              <div className="space-y-4">{[1, 2].map(i => (<Card key={i}><div className="p-4"><div className="space-y-2"><div className="flex gap-4">{[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-3 w-16" />)}</div>{[1, 2, 3, 4, 5].map(j => (<div key={j} className="flex gap-4">{[1, 2, 3, 4].map(k => <Skeleton key={k} className="h-3 w-20" />)}</div>))}</div></div></Card>))}</div>
            ) : Object.keys(allTables).length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20"><div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Table2 className="h-8 w-8 text-amber-700/50" /></div><p className="text-sm font-medium text-muted-foreground mb-1">No data yet</p><p className="text-xs text-muted-foreground mb-4">Chat with the AI to generate synthetic data</p><Button variant="outline" size="sm" className="text-xs" onClick={() => onSetMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button></motion.div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">{Object.keys(allTables).length} table{Object.keys(allTables).length !== 1 ? 's' : ''} · {Object.values(allTables).reduce((s, r) => s + r.length, 0)} total rows</span>
                  <div className="ml-auto flex items-center gap-1">
                    <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7 hover:bg-amber-50 hover:border-amber-300" onClick={() => onRunQualityCheck(false)} disabled={isQualityCheckRunning} aria-label="Run quality check">{isQualityCheckRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}Quality</Button></TooltipTrigger><TooltipContent>Run data quality check</TooltipContent></Tooltip></TooltipProvider>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1 text-xs h-7" aria-label="Export all data"><Download className="h-3 w-3" /> Export</Button></DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => onExportData(allTables, 'json')}><FileJson className="h-3.5 w-3.5 mr-2" /> Export as JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExportData(allTables, 'csv')}><FileText className="h-3.5 w-3.5 mr-2" /> Export as CSV</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onExportData(allTables, 'sql-insert')}><Code2 className="h-3.5 w-3.5 mr-2" /> SQL INSERT statements</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onExportData(allTables, 'sql-full')}><Database className="h-3.5 w-3.5 mr-2" /> Full SQL dump</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onCopyAllData(allTables, 'json')}><Copy className="h-3.5 w-3.5 mr-2" /> Copy JSON to clipboard</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onCopyAllData(allTables, 'sql')}><ClipboardCheck className="h-3.5 w-3.5 mr-2" /> Copy SQL to clipboard</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {Object.entries(allTables).map(([tableName, rows]) => (<DataTable key={tableName} tableName={tableName} rows={rows} schemaObj={schemaObj} onRegenerate={onRegenerateTable} isLoading={isLoading} onExportTable={onExportTable} onCopyTable={onCopyTable} />))}
              </>
            )}
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            <div className="mb-4">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setShowSchemaTemplates(!showSchemaTemplates)}><Layers className="h-3 w-3" /> Schema Templates <ChevronDown className={`h-3 w-3 transition-transform ${showSchemaTemplates ? 'rotate-180' : ''}`} /></Button>
              {showSchemaTemplates && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  {schemaTemplates.map((tmpl) => (<Card key={tmpl.name} className="cursor-pointer hover:shadow-md hover:border-amber-300 transition-all" onClick={() => { setNewDbSchema(JSON.stringify(tmpl.schema)); onSendMessage(`Generate data for a ${tmpl.name.toLowerCase()} system with these tables: ${Object.keys(tmpl.schema).join(', ')}`) }}><CardContent className="p-3"><h4 className="text-xs font-semibold">{tmpl.name}</h4><p className="text-[10px] text-muted-foreground">{tmpl.desc}</p></CardContent></Card>))}
                </motion.div>
              )}
            </div>
            {/* Paste or Upload Schema */}
            <Card className="border-dashed border-amber-200 bg-amber-50/30">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2"><FileUp className="h-3.5 w-3.5 text-amber-700" /><span className="text-xs font-semibold text-amber-800">Paste or Upload Schema</span></div>
                <Textarea value={schemaInput} onChange={(e) => { e.stopPropagation(); setSchemaInput(e.target.value); setSchemaParseError(''); setParsedSchemaPreview(null) }} placeholder={"Paste SQL DDL, JSON schema, or CSV header here...\n-- Example SQL:\nCREATE TABLE users (id INTEGER, name VARCHAR);\n\n-- Example JSON:\n{\"users\": {\"columns\": {\"id\": \"INTEGER\", \"name\": \"VARCHAR\"}}}"} className="min-h-[80px] max-h-[200px] font-mono text-[11px] overflow-y-auto resize-none" aria-label="Schema input" />
                <input ref={schemaFileInputRef} type="file" className="hidden" accept=".sql,.json,.txt,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const reader = new FileReader(); reader.onload = (ev) => { const c = ev.target?.result as string; setSchemaInput(c); setSchemaParseError(''); setParsedSchemaPreview(null) }; reader.readAsText(f); if (schemaFileInputRef.current) schemaFileInputRef.current.value = '' }} aria-hidden="true" />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => schemaFileInputRef.current?.click()}><Upload className="h-2.5 w-2.5" /> Upload .sql/.json/.csv</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => {
                    setSchemaParseError('')
                    setParsedSchemaPreview(null)
                    const input = schemaInput.trim()
                    if (!input) { setSchemaParseError('Please paste or upload a schema first'); return }
                    let parsed: Record<string, { columns: Record<string, string> }> = {}
                    // Detect format and parse
                    if (input.match(/CREATE\s+TABLE/i)) {
                      parsed = extractSchemaFromSQL(input)
                    } else if (input.trim().startsWith('{') || input.trim().startsWith('[')) {
                      try { parsed = extractSchemaFromJSON(input) } catch { setSchemaParseError('Invalid JSON format'); return }
                    } else if (input.includes(',') && input.includes('\n')) {
                      parsed = extractSchemaFromCSV(input, 'uploaded_schema')
                    } else {
                      setSchemaParseError('Could not detect schema format. Use SQL DDL, JSON, or CSV.'); return
                    }
                    if (Object.keys(parsed).length === 0) { setSchemaParseError('No tables found in the provided schema'); return }
                    setParsedSchemaPreview(parsed)
                  }} disabled={!schemaInput.trim()}><Check className="h-2.5 w-2.5" /> Parse Schema</Button>
                  {parsedSchemaPreview && Object.keys(parsedSchemaPreview).length > 0 && (
                    <Button size="sm" className="h-6 text-[10px] gap-1 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => {
                      setNewDbSchema(JSON.stringify(parsedSchemaPreview))
                      onSendMessage(`Generate data for these tables: ${Object.keys(parsedSchemaPreview).join(', ')}. Schema: ${JSON.stringify(parsedSchemaPreview).slice(0, 1000)}`)
                      setParsedSchemaPreview(null)
                      setSchemaInput('')
                    }}><Sparkles className="h-2.5 w-2.5" /> Apply & Generate</Button>
                  )}
                </div>
                {schemaParseError && <p className="text-[10px] text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{schemaParseError}</p>}
                {parsedSchemaPreview && Object.keys(parsedSchemaPreview).length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] text-amber-800 font-medium">Parsed {Object.keys(parsedSchemaPreview).length} table(s):</p>
                    {Object.entries(parsedSchemaPreview).map(([tName, tDef]) => (
                      <div key={tName} className="text-[10px] bg-amber-50 rounded p-1.5"><span className="font-medium text-amber-900">{tName}</span>: {Object.keys(tDef.columns).join(', ')}</div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {Object.keys(schemaObj).length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20"><div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Columns3 className="h-8 w-8 text-amber-700/50" /></div><p className="text-sm font-medium text-muted-foreground mb-1">No schema defined</p><p className="text-xs text-muted-foreground mb-4">Ask the AI to design a database schema</p><Button variant="outline" size="sm" className="text-xs" onClick={() => onSetMobileStudioTab('chat')}><MessageSquare className="h-3 w-3 mr-1" /> Start Chat</Button></motion.div>
            ) : Object.entries(schemaObj).map(([tableName, def]) => (<SchemaCard key={tableName} tableName={tableName} columns={(def as { columns: Record<string, string> }).columns} />))}
          </div>
        </ScrollArea>
      </TabsContent>
      <TabsContent value="relationships" className="flex-1 mt-0 overflow-hidden"><SchemaVisualization schema={schemaObj} tables={allTables} /></TabsContent>
      <TabsContent value="sql" className="flex-1 flex flex-col mt-0">
        <div className="p-4 space-y-3 flex-1 flex flex-col">
          <div className="flex items-center gap-2"><Code2 className="h-4 w-4 text-amber-700" /><span className="text-sm font-semibold">SQL Playground</span><Badge variant="secondary" className="text-[10px] ml-auto">Preview Mode</Badge></div>
          {showSqlSuggestion && sqlSuggestion && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amber-700" /><span className="text-xs font-semibold text-amber-800">AI Suggestion</span></div>
              <ScrollArea className="max-h-32"><pre className="text-[11px] font-mono whitespace-pre-wrap text-amber-900">{sqlSuggestion}</pre></ScrollArea>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setSqlQuery(sqlSuggestion); setShowSqlSuggestion(false); setSqlSuggestion('') }}><Check className="h-2.5 w-2.5" /> Accept</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => { setSqlQuery(sqlSuggestion); setShowSqlSuggestion(false); setSqlSuggestion('') }}><AlignLeft className="h-2.5 w-2.5" /> Edit</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1 border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setShowSqlSuggestion(false); setSqlSuggestion('') }}><X className="h-2.5 w-2.5" /> Reject</Button>
              </div>
            </motion.div>
          )}
          <div className="flex-1 relative">
            <Textarea value={sqlQuery} onChange={(e) => { e.stopPropagation(); setSqlQuery(e.target.value); validateSql(e.target.value, setSqlValidationError); setShowSqlSuggestion(false) }} placeholder={"-- Write a comment like: Get all users older than 30\n-- Or type SQL directly:\nSELECT * FROM users LIMIT 10;"} className="min-h-[120px] max-h-[300px] font-mono text-xs flex-1 overflow-y-auto resize-none" aria-label="SQL query input" />
            {sqlValidationError && (<div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 text-[10px] text-red-600 bg-red-50 px-2 py-1 rounded"><AlertCircle className="h-3 w-3 shrink-0" />{sqlValidationError}</div>)}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white h-7 text-xs" onClick={runSqlPlayground} disabled={!sqlQuery.trim()}><Play className="h-3 w-3 mr-1" /> Run</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleSqlAskAI} disabled={sqlGenerating || !sqlQuery.trim()}>{sqlGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />} {sqlGenerating ? 'Generating...' : 'Ask AI'}</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) return; onSendMessage(`Explain this SQL query in plain English: ${sqlQuery.trim()}`) }} disabled={isLoading || !sqlQuery.trim()}><HelpCircle className="h-3 w-3" /> Explain</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) return; onSendMessage(`Analyze this SQL query and suggest optimizations: ${sqlQuery.trim()}. Available indexes and schema: ${JSON.stringify(schemaObj).slice(0, 1000)}`) }} disabled={isLoading || !sqlQuery.trim()}><Zap className="h-3 w-3" /> Optimize</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => { if (!sqlQuery.trim()) return; let formatted = sqlQuery.replace(/\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|ON|AND|OR|ORDER BY|GROUP BY|HAVING|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE|AS|IN|NOT|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|LIMIT|OFFSET|UNION|CASE|WHEN|THEN|ELSE|END)\b/gi, '\n$1').replace(/^\n/, '').replace(/\n\n+/g, '\n'); setSqlQuery(formatted) }}><AlignLeft className="h-3 w-3" /> Format</Button>
          </div>
          {sqlResult && (<ScrollArea className="max-h-64"><pre className="bg-slate-900 text-green-400 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap">{sqlResult}</pre></ScrollArea>)}
        </div>
      </TabsContent>
      <TabsContent value="explorer" className="flex-1 mt-0 overflow-hidden"><ExplorerTree schema={schemaObj} tables={allTables} graphAnalysis={graphAnalysis} /></TabsContent>
    </Tabs>
  )
})
