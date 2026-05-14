'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Table2, Link2, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  FileDown, Network, FolderTree, GitBranch, ListOrdered,
  AlertTriangle, GitFork, Search, CheckCircle2, Zap, Loader2,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app-store'
import { useGraphAnalysis } from '@/hooks/use-graph-analysis'
import type { SchemaDef } from '@/lib/types'

// ─── SchemaVisualization (ER Diagram) ──────────────────
interface SchemaVisualizationProps {
  schema: Record<string, SchemaDef>
  tables: Record<string, Record<string, unknown>[]>
}

export const SchemaVisualization = React.memo(function SchemaVisualization({ schema, tables }: SchemaVisualizationProps) {
  const store = useAppStore()
  const erSvgRef = React.useRef<SVGSVGElement>(null)
  const allTableNames = Array.from(new Set([...Object.keys(tables), ...Object.keys(schema)]))

  const [erDragState, setErDragState] = useState<{ isDragging: boolean; target: string | null; startX: number; startY: number; offsetX: number; offsetY: number }>({ isDragging: false, target: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 })
  const [erTransform, setErTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [erIsPanning, setErIsPanning] = useState(false)
  const [erPanStart, setErPanStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
  const [erTablePositions, setErTablePositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const positions: Record<string, { x: number; y: number }> = {}
    const cols = Math.ceil(Math.sqrt(allTableNames.length))
    allTableNames.forEach((name, i) => { positions[name] = { x: (i % cols) * 280 + 40, y: Math.floor(i / cols) * 220 + 40 } })
    return positions
  })

  const relationships: { from: string; to: string; via: string; type: string }[] = []
  for (const tableName of allTableNames) {
    const tableSchema = schema[tableName]
    if (tableSchema?.columns) {
      for (const colName of Object.keys(tableSchema.columns)) {
        if (colName.endsWith('_id') && colName !== 'id') {
          const refTableName = colName.replace(/_id$/, '') + 's'
          if (allTableNames.includes(refTableName)) relationships.push({ from: tableName, to: refTableName, via: colName, type: '1:N' })
        }
      }
    }
  }
  for (const tableName of allTableNames) {
    const tableSchema = schema[tableName]
    if (tableSchema?.columns) {
      const fks = Object.keys(tableSchema.columns).filter(c => c.endsWith('_id') && c !== 'id')
      if (fks.length >= 2) { for (const rel of relationships) { if (rel.from === tableName) rel.type = 'M:N' } }
    }
  }

  const tableWidth = 200; const headerHeight = 28; const rowHeight = 18
  const getTableHeight = (name: string) => { const ts = schema[name]; return headerHeight + ((ts?.columns ? Object.keys(ts.columns).length : 1) * rowHeight) + 8 }
  const relationshipColor = (type: string) => { if (type === '1:1') return '#8b5cf6'; if (type === '1:N') return '#0ea5e9'; if (type === 'M:N') return '#f59e0b'; return '#6b7280' }

  if (allTableNames.length === 0) return (<div className="text-center py-20"><div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-red-50 flex items-center justify-center mx-auto mb-4"><Network className="h-8 w-8 text-amber-700/50" /></div><p className="text-sm font-medium text-muted-foreground mb-1">No schema to visualize</p><p className="text-xs text-muted-foreground mb-4">Ask the AI to generate data with related tables</p></div>)

  const maxX = Math.max(...allTableNames.map(n => (erTablePositions[n]?.x || 0) + tableWidth + 40), 800)
  const maxY = Math.max(...allTableNames.map(n => (erTablePositions[n]?.y || 0) + getTableHeight(n) + 40), 600)

  const handleErMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = (e.target as SVGElement).closest('[data-table]')
    if (target) { const tn = target.getAttribute('data-table')!; const pos = erTablePositions[tn]; if (pos) setErDragState({ isDragging: true, target: tn, startX: e.clientX, startY: e.clientY, offsetX: pos.x, offsetY: pos.y }) }
    else { setErIsPanning(true); setErPanStart({ x: e.clientX, y: e.clientY, tx: erTransform.x, ty: erTransform.y }) }
  }
  const handleErMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (erDragState.isDragging && erDragState.target) { const dx = (e.clientX - erDragState.startX) / erTransform.scale; const dy = (e.clientY - erDragState.startY) / erTransform.scale; setErTablePositions(prev => ({ ...prev, [erDragState.target!]: { x: erDragState.offsetX + dx, y: erDragState.offsetY + dy } })) }
    else if (erIsPanning) { setErTransform(prev => ({ ...prev, x: erPanStart.tx + (e.clientX - erPanStart.x), y: erPanStart.ty + (e.clientY - erPanStart.y) })) }
  }
  const handleErMouseUp = () => { setErDragState({ isDragging: false, target: null, startX: 0, startY: 0, offsetX: 0, offsetY: 0 }); setErIsPanning(false) }
  const handleErWheel = (e: React.WheelEvent<SVGSVGElement>) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; setErTransform(prev => ({ ...prev, scale: Math.max(0.2, Math.min(3, prev.scale * delta)) })) }

  const renderEdge = (rel: { from: string; to: string; via: string; type: string }, idx: number) => {
    const fromPos = erTablePositions[rel.from]; const toPos = erTablePositions[rel.to]
    if (!fromPos || !toPos) return null
    const fromH = getTableHeight(rel.from); const toH = getTableHeight(rel.to)
    const fromCX = fromPos.x + tableWidth / 2; const fromCY = fromPos.y + fromH / 2; const toCX = toPos.x + tableWidth / 2; const toCY = toPos.y + toH / 2
    let fromX: number, toX: number; if (fromCX < toCX) { fromX = fromPos.x + tableWidth; toX = toPos.x } else { fromX = fromPos.x; toX = toPos.x + tableWidth }
    const fromY = fromCY; const toY = toCY; const color = relationshipColor(rel.type); const midX = (fromX + toX) / 2
    const fromC = rel.type === '1:1' ? '1' : 'N'; const toC = '1'
    return (
      <g key={`edge-${idx}`}>
        <path d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.7} markerEnd={`url(#arrow-${rel.type})`} />
        <text x={fromX + (fromCX < toCX ? 8 : -12)} y={fromY - 6} fontSize="11" fontWeight="bold" fill={color}>{fromC}</text>
        <text x={toX + (fromCX < toCX ? -12 : 8)} y={toY - 6} fontSize="11" fontWeight="bold" fill={color}>{toC}</text>
        <text x={midX} y={(fromY + toY) / 2 - 8} fontSize="9" fill={color} textAnchor="middle" opacity={0.8}>{rel.via}</text>
      </g>
    )
  }

  const minimapW = 160; const minimapH = 100; const minimapScale = Math.min(minimapW / maxX, minimapH / maxY)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b bg-muted/30 shrink-0 flex-wrap">
        <Badge variant="outline" className="text-[10px] gap-1"><Table2 className="h-3 w-3" /> {allTableNames.length} tables</Badge>
        <Badge variant="outline" className="text-[10px] gap-1"><Link2 className="h-3 w-3" /> {relationships.length} relationships</Badge>
        <Input placeholder="Filter tables..." value={store.erSearchFilter} onChange={(e) => store.setErSearchFilter(e.target.value)} className="h-6 w-28 text-[10px] px-2" aria-label="Filter tables in ER diagram" />
        <Select value={store.erRelationshipFilter} onValueChange={store.setErRelationshipFilter}>
          <SelectTrigger className="h-6 w-20 text-[10px] px-1.5"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="1:N">1:N</SelectItem><SelectItem value="M:N">M:N</SelectItem><SelectItem value="1:1">1:1</SelectItem></SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-auto">
          <div className="flex items-center gap-1 text-[10px]"><span className="inline-block w-3 h-0.5 bg-sky-500" /> 1:N</div>
          <div className="flex items-center gap-1 text-[10px] ml-2"><span className="inline-block w-3 h-0.5 bg-amber-500" /> M:N</div>
          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { if (erTablePositions && allTableNames.length > 0) { const mnX = Math.min(...allTableNames.map(n => erTablePositions[n]?.x || 0)); const mnY = Math.min(...allTableNames.map(n => erTablePositions[n]?.y || 0)); const mxX = Math.max(...allTableNames.map(n => (erTablePositions[n]?.x || 0) + tableWidth)); const mxY = Math.max(...allTableNames.map(n => (erTablePositions[n]?.y || 0) + getTableHeight(n))); const sX = 800 / (mxX - mnX + 80); const sY = 500 / (mxY - mnY + 80); const fs = Math.min(sX, sY, 1.5); setErTransform({ x: -(mnX - 40) * fs, y: -(mnY - 40) * fs, scale: fs }) } }} aria-label="Fit to screen"><Maximize2 className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Fit to screen</TooltipContent></Tooltip></TooltipProvider>
          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { const svgEl = erSvgRef.current; if (!svgEl) return; const svgData = new XMLSerializer().serializeToString(svgEl); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); if (!ctx) return; const img = new Image(); img.onload = () => { canvas.width = img.width * 2; canvas.height = img.height * 2; ctx.scale(2, 2); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); canvas.toBlob(blob => { if (blob) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'er-diagram.png'; a.click(); URL.revokeObjectURL(url) } }) }; img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData))) }} aria-label="Export as PNG"><FileDown className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Export as PNG</TooltipContent></Tooltip></TooltipProvider>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform({ x: 0, y: 0, scale: 1 })} aria-label="Reset view"><RefreshCw className="h-3 w-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform(prev => ({ ...prev, scale: Math.min(3, prev.scale * 1.2) }))} aria-label="Zoom in"><ZoomIn className="h-3 w-3" /></Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setErTransform(prev => ({ ...prev, scale: Math.max(0.2, prev.scale * 0.8) }))} aria-label="Zoom out"><ZoomOut className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex-1 relative overflow-hidden">
        <svg ref={erSvgRef} className="w-full h-full" style={{ cursor: erDragState.isDragging ? 'grabbing' : erIsPanning ? 'grabbing' : 'grab' }} onMouseDown={handleErMouseDown} onMouseMove={handleErMouseMove} onMouseUp={handleErMouseUp} onMouseLeave={handleErMouseUp} onWheel={handleErWheel}>
          <defs>
            <marker id="arrow-1:N" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" /></marker>
            <marker id="arrow-M:N" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" /></marker>
            <marker id="arrow-1:1" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" /></marker>
            <pattern id="er-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" /></pattern>
          </defs>
          <g transform={`translate(${erTransform.x}, ${erTransform.y}) scale(${erTransform.scale})`}>
            <rect x="-1000" y="-1000" width={maxX + 2000} height={maxY + 2000} fill="url(#er-grid)" />
            {relationships.map((rel, i) => renderEdge(rel, i))}
            {allTableNames.map(tableName => {
              const tableSchema = schema[tableName]; const tableRows = tables[tableName]; const columns = tableSchema?.columns || {}; const colEntries = Object.entries(columns); const pos = erTablePositions[tableName] || { x: 0, y: 0 }; const height = getTableHeight(tableName)
              return (
                <g key={tableName} data-table={tableName} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: 'move' }}>
                  <rect x={2} y={2} width={tableWidth} height={height} rx={6} fill="rgba(0,0,0,0.08)" />
                  <rect width={tableWidth} height={height} rx={6} fill="white" stroke="#d4a054" strokeWidth={1.5} />
                  <rect width={tableWidth} height={headerHeight} rx={6} fill="#d4a054" />
                  <rect y={headerHeight - 6} width={tableWidth} height={6} fill="#d4a054" />
                  <text x={tableWidth / 2} y={18} textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">{tableName}</text>
                  {tableRows && <text x={tableWidth - 8} y={18} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.8)">{tableRows.length} rows</text>}
                  {colEntries.map(([colName, colType], i) => {
                    const isPK = colName === 'id'; const isFK = colName.endsWith('_id') && colName !== 'id'; const y = headerHeight + 14 + i * rowHeight
                    return (
                      <g key={colName}>
                        <line x1={0} y1={y - 12} x2={tableWidth} y2={y - 12} stroke="#f3f0e7" strokeWidth={0.5} />
                        {isPK && <text x={8} y={y} fontSize="9" fill="#d4a054">🔑</text>}
                        {isFK && <text x={8} y={y} fontSize="9" fill="#0ea5e9">🔗</text>}
                        {!isPK && !isFK && <text x={8} y={y} fontSize="9" fill="#9ca3af">●</text>}
                        <text x={isPK || isFK ? 22 : 16} y={y} fontSize="10" fontFamily="monospace" fill="#374151">{colName}</text>
                        <text x={tableWidth - 8} y={y} textAnchor="end" fontSize="9" fontFamily="monospace" fill="#9ca3af">{colType.split('(')[0]}</text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        </svg>
        <div className="absolute bottom-3 right-3 border rounded-lg bg-white/90 shadow-lg p-1.5">
          <svg width={minimapW} height={minimapH}>
            <rect width={minimapW} height={minimapH} fill="#fafaf9" rx={4} />
            {allTableNames.map(name => { const pos = erTablePositions[name] || { x: 0, y: 0 }; const h = getTableHeight(name); return <rect key={name} x={pos.x * minimapScale} y={pos.y * minimapScale} width={tableWidth * minimapScale} height={h * minimapScale} fill="#d4a054" stroke="#b8860b" strokeWidth={0.5} rx={1} opacity={0.7} /> })}
            <rect x={(-erTransform.x / erTransform.scale) * minimapScale} y={(-erTransform.y / erTransform.scale) * minimapScale} width={(800 / erTransform.scale) * minimapScale} height={(500 / erTransform.scale) * minimapScale} fill="none" stroke="#ef4444" strokeWidth={1} strokeDasharray="3 2" rx={2} />
          </svg>
        </div>
      </div>
    </div>
  )
})

// ─── ExplorerTree ──────────────────────────────────────
interface ExplorerTreeProps {
  schema: Record<string, SchemaDef>
  tables: Record<string, Record<string, unknown>[]>
  graphAnalysis: ReturnType<typeof useGraphAnalysis>
}

export const ExplorerTree = React.memo(function ExplorerTree({ schema, tables, graphAnalysis }: ExplorerTreeProps) {
  const store = useAppStore()
  const graphSvgRef = React.useRef<SVGSVGElement>(null)
  const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])
  const [graphTransform, setGraphTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [graphIsPanning, setGraphIsPanning] = useState(false)
  const [graphPanStart, setGraphPanStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const { edges } = graphAnalysis.buildDependencyGraph()

  const graphNodePositions = useMemo(() => {
    const names = Array.from(allTableNames); const positions: Record<string, { x: number; y: number }> = {}
    const cols = Math.ceil(Math.sqrt(names.length))
    names.forEach((name, i) => { positions[name] = { x: (i % cols) * 160 + 80, y: Math.floor(i / cols) * 120 + 60 } })
    return positions
  }, [allTableNames])

  const isCutpoint = store.cutpoints ? (name: string) => store.cutpoints!.includes(name) : () => false
  const isReachable = store.reachableTables ? (name: string) => store.reachableTables!.includes(name) : () => false

  const handleGraphMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = (e.target as SVGElement).closest('[data-node]')
    if (target) { const nodeName = target.getAttribute('data-node')!; graphAnalysis.bfsReachable(nodeName) }
    else { setGraphIsPanning(true); setGraphPanStart({ x: e.clientX, y: e.clientY, tx: graphTransform.x, ty: graphTransform.y }) }
  }
  const handleGraphMouseMove = (e: React.MouseEvent<SVGSVGElement>) => { if (graphIsPanning) { setGraphTransform(prev => ({ ...prev, x: graphPanStart.tx + (e.clientX - graphPanStart.x), y: graphPanStart.ty + (e.clientY - graphPanStart.y) })) } }
  const handleGraphMouseUp = () => { setGraphIsPanning(false) }
  const handleGraphWheel = (e: React.WheelEvent<SVGSVGElement>) => { e.preventDefault(); const delta = e.deltaY > 0 ? 0.9 : 1.1; setGraphTransform(prev => ({ ...prev, scale: Math.max(0.3, Math.min(3, prev.scale * delta)) })) }

  const graphW = Math.max(...Object.values(graphNodePositions).map(p => p.x + 80), 400)
  const graphH = Math.max(...Object.values(graphNodePositions).map(p => p.y + 60), 300)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 p-2 border-b bg-muted/30 shrink-0 flex-wrap">
        <div className="flex items-center bg-muted rounded-md p-0.5">
          <Button variant={store.explorerView === 'tree' ? 'default' : 'ghost'} size="sm" className={`h-6 text-[10px] px-2 ${store.explorerView === 'tree' ? 'bg-amber-700 text-white' : ''}`} onClick={() => store.setExplorerView('tree')} aria-label="Tree view"><FolderTree className="h-3 w-3 mr-1" /> Tree</Button>
          <Button variant={store.explorerView === 'graph' ? 'default' : 'ghost'} size="sm" className={`h-6 text-[10px] px-2 ${store.explorerView === 'graph' ? 'bg-amber-700 text-white' : ''}`} onClick={() => store.setExplorerView('graph')} aria-label="Graph view"><GitBranch className="h-3 w-3 mr-1" /> Graph</Button>
        </div>
        {store.explorerView === 'graph' && (
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={graphAnalysis.topologicalSort} aria-label="Sort dependencies"><ListOrdered className="h-3 w-3" /> Sort</Button></TooltipTrigger><TooltipContent>Topological sort</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={graphAnalysis.findCutpoints} aria-label="Find cutpoints"><AlertTriangle className="h-3 w-3" /> Cutpoints</Button></TooltipTrigger><TooltipContent>Find critical tables</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={graphAnalysis.computeConstraintClosure} aria-label="Show constraints"><Link2 className="h-3 w-3" /> Constraints</Button></TooltipTrigger><TooltipContent>Show cascading constraints</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => graphAnalysis.dfsTraversal()} aria-label="DFS traversal"><GitFork className="h-3 w-3" /> DFS</Button></TooltipTrigger><TooltipContent>DFS traversal order</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={graphAnalysis.detectCycles} aria-label="Detect cycles"><AlertTriangle className="h-3 w-3" /> Cycles</Button></TooltipTrigger><TooltipContent>Detect circular dependencies</TooltipContent></Tooltip></TooltipProvider>
            <Button variant="default" size="sm" className="h-6 text-[10px] px-2 gap-1 bg-amber-700 hover:bg-amber-800 text-white" onClick={graphAnalysis.runAllAnalysis} disabled={store.isAnalysisRunning} aria-label="Run all analysis">{store.isAnalysisRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Run All</Button>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setGraphTransform({ x: 0, y: 0, scale: 1 })} aria-label="Reset graph view"><Maximize2 className="h-3 w-3" /></Button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {store.explorerView === 'tree' ? (
          <div className="p-2 h-full overflow-y-auto">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2"><FolderTree className="h-3 w-3" /> DATABASE TABLES</div>
            {allTableNames.size === 0 ? (<div className="text-center py-12"><Table2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground">No tables yet. Chat with AI to generate data.</p></div>) : (
              <div className="space-y-1">
                {store.topologicalSortResult && (<div className="mb-3 p-2 border rounded-md bg-sky-50 border-sky-200"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-800 mb-1.5"><ListOrdered className="h-3 w-3" /> Dependency Order</div><div className="flex flex-wrap gap-1">{store.topologicalSortResult.map((name, i) => (<React.Fragment key={name}><Badge variant="outline" className="text-[9px] font-mono">{name}</Badge>{i < store.topologicalSortResult!.length - 1 && <span className="text-sky-400 text-[10px]">→</span>}</React.Fragment>))}</div></div>)}
                {Array.from(allTableNames).map(tableName => {
                  const rows = tables[tableName] || []; const schemaDef = schema[tableName]; const isCut = isCutpoint(tableName)
                  return (
                    <motion.button key={tableName} initial={{ opacity: 0, x: -5 }} animate={{ opacity: 1, x: 0 }} className={`w-full text-left p-2 rounded-md hover:bg-muted/50 transition-colors group ${isCut ? 'border-l-2 border-red-400 bg-red-50/50' : ''}`} onClick={() => store.setRightTab('preview')} aria-label={`View ${tableName} table`}>
                      <div className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground" /><Table2 className="h-3.5 w-3.5 text-amber-700" /><span className="text-sm font-medium">{tableName}</span>{isCut && <AlertTriangle className="h-3 w-3 text-red-500" />}</div>
                      <div className="ml-6 mt-0.5 text-[11px] text-muted-foreground">{rows.length > 0 && <span>{rows.length} rows</span>}{schemaDef?.columns && <span>{rows.length > 0 ? ' · ' : ''}{Object.keys(schemaDef.columns).length} columns</span>}</div>
                      {schemaDef?.columns && (<div className="ml-6 mt-1 flex flex-wrap gap-1">{Object.keys(schemaDef.columns).slice(0, 4).map(col => (<Badge key={col} variant="outline" className="text-[9px] px-1 py-0 font-mono">{col}</Badge>))}{Object.keys(schemaDef.columns).length > 4 && (<Badge variant="outline" className="text-[9px] px-1 py-0">+{Object.keys(schemaDef.columns).length - 4}</Badge>)}</div>)}
                    </motion.button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {allTableNames.size === 0 ? (<div className="text-center py-12"><Network className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground">No tables to graph.</p></div>) : (
              <>
                <div className="flex-1 relative overflow-hidden">
                  <svg ref={graphSvgRef} className="w-full h-full" style={{ cursor: graphIsPanning ? 'grabbing' : 'pointer' }} onMouseDown={handleGraphMouseDown} onMouseMove={handleGraphMouseMove} onMouseUp={handleGraphMouseUp} onMouseLeave={handleGraphMouseUp} onWheel={handleGraphWheel}>
                    <defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker><pattern id="graph-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f5f9" strokeWidth="0.5" /></pattern></defs>
                    <g transform={`translate(${graphTransform.x}, ${graphTransform.y}) scale(${graphTransform.scale})`}>
                      <rect x="-500" y="-500" width={graphW + 1000} height={graphH + 1000} fill="url(#graph-grid)" />
                      {edges.map((edge, i) => { const fromPos = graphNodePositions[edge.from]; const toPos = graphNodePositions[edge.to]; if (!fromPos || !toPos) return null; const midX = (fromPos.x + toPos.x) / 2; const midY = (fromPos.y + toPos.y) / 2; const isHl = store.selectedGraphNode === edge.from || store.selectedGraphNode === edge.to; return (<g key={`ge-${i}`}><path d={`M ${fromPos.x} ${fromPos.y} C ${midX} ${fromPos.y}, ${midX} ${toPos.y}, ${toPos.x} ${toPos.y}`} fill="none" stroke={isHl ? '#f59e0b' : '#94a3b8'} strokeWidth={isHl ? 2 : 1.5} strokeOpacity={isHl ? 1 : 0.5} markerEnd="url(#graph-arrow)" /><text x={midX} y={midY - 6} fontSize="8" fill="#64748b" textAnchor="middle" opacity={0.7}>{edge.via}</text></g>) })}
                      {Array.from(allTableNames).map(name => { const pos = graphNodePositions[name]; if (!pos) return null; const isCut = isCutpoint(name); const isReach = isReachable(name); const isSel = store.selectedGraphNode === name; const isHov = hoveredNode === name; const nW = 120; const nH = 36; let fill = '#ffffff'; let stroke = '#d4a054'; let textC = '#374151'; if (isCut) { fill = '#fef2f2'; stroke = '#ef4444' } if (isReach) { fill = '#ecfdf5'; stroke = '#10b981' } if (isSel) { fill = '#fffbeb'; stroke = '#f59e0b'; textC = '#92400e' } if (isHov && !isSel) { fill = '#fefce8' } return (<g key={name} data-node={name} transform={`translate(${pos.x - nW / 2}, ${pos.y - nH / 2})`} onMouseEnter={() => setHoveredNode(name)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: 'pointer' }}><rect width={nW} height={nH} rx={6} fill={fill} stroke={stroke} strokeWidth={isSel ? 2.5 : 1.5} /><text x={nW / 2} y={nH / 2 + 4} textAnchor="middle" fontSize="11" fontWeight={isSel ? 'bold' : '600'} fill={textC}>{name}</text>{isCut && <text x={nW - 6} y={12} fontSize="9" fill="#ef4444">⚠</text>}{tables[name] && <text x={nW / 2} y={nH - 4} textAnchor="middle" fontSize="7" fill="#9ca3af">{tables[name].length} rows</text>}</g>) })}
                    </g>
                  </svg>
                </div>
                <div className="border-t shrink-0 max-h-[40%] overflow-y-auto">
                  {store.selectedGraphNode && store.reachableTables !== null && (<div className="p-2 border-b bg-amber-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 mb-1"><Search className="h-3 w-3" /> Reachable from <span className="font-mono">{store.selectedGraphNode}</span></div>{store.reachableTables.length === 0 ? <p className="text-[10px] text-muted-foreground">No reachable tables</p> : <div className="flex flex-wrap gap-1">{store.reachableTables.map(name => (<Badge key={name} variant="outline" className="text-[9px] font-mono bg-green-50 border-green-300 text-green-800">{name}</Badge>))}</div>}</div>)}
                  {store.cutpoints && store.cutpoints.length > 0 && (<div className="p-2 border-b bg-red-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-800 mb-1"><AlertTriangle className="h-3 w-3" /> Critical Tables</div><div className="flex flex-wrap gap-1">{store.cutpoints.map(name => (<Badge key={name} variant="outline" className="text-[9px] font-mono bg-red-50 border-red-300 text-red-800">{name}</Badge>))}</div></div>)}
                  {store.dfsResult && store.dfsResult.length > 0 && (<div className="p-2 border-b bg-purple-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-purple-800 mb-1"><GitFork className="h-3 w-3" /> DFS Traversal</div><div className="flex flex-wrap gap-1">{store.dfsResult.map((name, i) => (<React.Fragment key={name}><Badge variant="outline" className="text-[9px] font-mono bg-purple-50 border-purple-300 text-purple-800">{name}</Badge>{i < store.dfsResult!.length - 1 && <span className="text-purple-400 text-[10px]">→</span>}</React.Fragment>))}</div></div>)}
                  {store.cycleDetectionResult && store.cycleDetectionResult.length > 0 && (<div className="p-2 border-b bg-orange-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-orange-800 mb-1"><AlertTriangle className="h-3 w-3" /> Circular Dependencies</div><div className="space-y-1">{store.cycleDetectionResult.map((cycle, i) => (<div key={i} className="text-[9px] bg-white/50 rounded p-1.5 border border-orange-200 font-mono text-orange-700">{cycle}</div>))}</div></div>)}
                  {store.cycleDetectionResult && store.cycleDetectionResult.length === 0 && (<div className="p-2 border-b bg-green-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-green-800"><CheckCircle2 className="h-3 w-3" /> No circular dependencies</div></div>)}
                  {store.constraintClosureResult && store.constraintClosureResult.length > 0 && (<div className="p-2 bg-sky-50/50"><div className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-800 mb-1"><Link2 className="h-3 w-3" /> Cascading Constraints</div><div className="space-y-1 max-h-32 overflow-y-auto">{store.constraintClosureResult.map((cc, i) => (<div key={i} className="text-[9px] bg-white/50 rounded p-1.5 border border-sky-100"><span className="font-mono text-sky-700">{cc.from}</span><span className="text-muted-foreground mx-1">→{cc.via}→</span><span className="font-mono text-sky-700">{cc.to}</span>{cc.cascades.length > 0 && <span className="text-muted-foreground ml-1">affects: {cc.cascades.join(', ')}</span>}</div>))}</div></div>)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
