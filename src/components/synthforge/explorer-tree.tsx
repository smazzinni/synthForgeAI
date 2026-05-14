'use client'

import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  Database, Table2, ChevronRight, ChevronDown, FolderTree,
  Key, Link2, Circle, AlertTriangle, Search, Maximize2,
  ListOrdered, GitBranch, Network
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Database_ } from './types'
import { resolveFkReference } from './utils'

export const ExplorerTree = React.memo(function ExplorerTree({
  schema,
  tables,
  activeDb,
  selectedTableName,
  expandedTreeNodes,
  setExpandedTreeNodes,
  setSelectedTableName,
  setRightTab,
  cutpoints,
  reachableTables,
  selectedGraphNode,
  constraintClosureResult,
  topologicalSortResult,
  explorerView,
  setExplorerView,
  onTopologicalSort,
  onFindCutpoints,
  onBfsReachable,
  onComputeConstraintClosure,
  isLoading: _isLoading,
}: {
  schema: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  tables: Record<string, Record<string, unknown>[]>
  activeDb: Database_ | null
  selectedTableName: string | null
  expandedTreeNodes: Record<string, boolean>
  setExpandedTreeNodes: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setSelectedTableName: (name: string | null) => void
  setRightTab: (tab: string) => void
  cutpoints: string[] | null
  reachableTables: string[] | null
  selectedGraphNode: string | null
  constraintClosureResult: { from: string; to: string; via: string; cascades: string[] }[] | null
  topologicalSortResult: string[] | null
  explorerView: 'tree' | 'graph'
  setExplorerView: (view: 'tree' | 'graph') => void
  onTopologicalSort: () => string[]
  onFindCutpoints: () => string[]
  onBfsReachable: (node: string) => string[]
  onComputeConstraintClosure: () => { from: string; to: string; via: string; cascades: string[] }[]
  isLoading: boolean
}) {
  const allTableNames = new Set([...Object.keys(tables), ...Object.keys(schema)])

  const [graphTransform, setGraphTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [graphIsPanning, setGraphIsPanning] = useState(false)
  const [graphPanStart, setGraphPanStart] = useState({ x: 0, y: 0, tx: 0, ty: 0 })
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)

  const graphSvgRef = useRef<SVGSVGElement>(null)

  const buildDependencyGraph = useCallback(() => {
    const allNames = new Set([...Object.keys(tables), ...Object.keys(schema)])
    const edges: { from: string; to: string; via: string }[] = []
    const adj: Record<string, string[]> = {}
    const revAdj: Record<string, string[]> = {}

    for (const name of allNames) {
      adj[name] = []
      revAdj[name] = []
    }

    for (const tableName of allNames) {
      const tableSchema = schema[tableName]
      if (tableSchema?.columns) {
        for (const colName of Object.keys(tableSchema.columns)) {
          if (colName.endsWith('_id') && colName !== 'id') {
            const refTableName = resolveFkReference(colName, allNames)
            if (refTableName) {
              edges.push({ from: tableName, to: refTableName, via: colName })
              adj[tableName].push(refTableName)
              revAdj[refTableName].push(tableName)
            }
          }
        }
      }
    }

    return { allTableNames: allNames, edges, adj, revAdj }
  }, [schema, tables])

  const { edges } = buildDependencyGraph()

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

  const toggleTreeNode = (nodeId: string) => {
    setExpandedTreeNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }))
  }

  const handleTableClick = (tableName: string) => {
    setSelectedTableName(tableName)
    setRightTab('preview')
    requestAnimationFrame(() => {
      const el = document.getElementById(`table-${tableName}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const handleGraphMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = (e.target as SVGElement).closest('[data-node]')
    if (target) {
      const nodeName = target.getAttribute('data-node')!
      onBfsReachable(nodeName)
    } else {
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

  const handleGraphWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setGraphTransform(prev => ({
      ...prev,
      scale: Math.max(0.3, Math.min(3, prev.scale * delta))
    }))
  }, [])

  const graphW = Math.max(...Object.values(graphNodePositions).map(p => p.x + 80), 400)
  const graphH = Math.max(...Object.values(graphNodePositions).map(p => p.y + 60), 300)

  // ─── Hierarchical Tree-View ──────────────────────────────
  const renderTreeView = () => {
    if (allTableNames.size === 0) {
      return (
        <div className="text-center py-12">
          <Table2 className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">No tables yet. Chat with AI to generate data.</p>
        </div>
      )
    }

    const dbExpanded = expandedTreeNodes['db-root'] ?? true
    const tablesExpanded = expandedTreeNodes['tables-group'] ?? true

    return (
      <div className="space-y-0.5 select-none">
        {topologicalSortResult && (
          <div className="mb-2 p-2 border rounded-md bg-sky-50 border-sky-200">
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

        <div className="rounded-md">
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-amber-50/80 transition-colors text-sm font-semibold text-foreground"
            onClick={() => toggleTreeNode('db-root')}
            aria-label={dbExpanded ? 'Collapse database' : 'Expand database'}
            aria-expanded={dbExpanded}
          >
            {dbExpanded ? <ChevronDown className="h-3.5 w-3.5 text-amber-600 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
            <Database className="h-4 w-4 text-amber-700 shrink-0" />
            <span className="truncate">{activeDb?.name || 'Database'}</span>
            <Badge variant="secondary" className="text-[9px] ml-auto">{allTableNames.size} tables</Badge>
          </button>

          {dbExpanded && (
            <div className="ml-2 mt-0.5">
              <button
                className="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors text-xs font-medium text-muted-foreground"
                onClick={() => toggleTreeNode('tables-group')}
                aria-label={tablesExpanded ? 'Collapse tables' : 'Expand tables'}
                aria-expanded={tablesExpanded}
              >
                {tablesExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <FolderTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>Tables</span>
              </button>

              {tablesExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {Array.from(allTableNames).map(tableName => {
                    const rows = tables[tableName] || []
                    const schemaDef = schema[tableName]
                    const isCut = isCutpoint(tableName)
                    const isSelected = selectedTableName === tableName
                    const isTableExpanded = expandedTreeNodes[`table-${tableName}`] ?? false
                    const colEntries = schemaDef?.columns ? Object.entries(schemaDef.columns) : []

                    return (
                      <div key={tableName}>
                        <button
                          className={`w-full text-left group rounded-md transition-all ${
                            isSelected
                              ? 'bg-amber-100/80 border border-amber-300 shadow-sm'
                              : 'hover:bg-muted/50 border border-transparent'
                          } ${isCut ? 'border-l-2 !border-l-red-400 bg-red-50/30' : ''}`}
                          onClick={() => handleTableClick(tableName)}
                          aria-label={`View ${tableName} table`}
                          aria-expanded={colEntries.length > 0 ? isTableExpanded : undefined}
                        >
                          <div className="flex items-center gap-1.5 px-2 py-1.5">
                            {colEntries.length > 0 ? (
                              <span
                                className="shrink-0 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleTreeNode(`table-${tableName}`)
                                }}
                              >
                                {isTableExpanded
                                  ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                }
                              </span>
                            ) : (
                              <span className="w-3 shrink-0" />
                            )}
                            <Table2 className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-amber-700' : 'text-amber-600/70'}`} />
                            <span className={`text-xs font-medium truncate ${isSelected ? 'text-amber-900' : ''}`}>{tableName}</span>
                            {isCut && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                              {rows.length > 0 ? `${rows.length} rows` : ''}
                            </span>
                          </div>
                        </button>

                        {isTableExpanded && colEntries.length > 0 && (
                          <div className="ml-9 mr-2 mt-0.5 mb-1 border-l-2 border-amber-200 pl-2 space-y-0.5">
                            {colEntries.map(([colName, colType]) => {
                              const isPK = colName === 'id'
                              const isFK = colName.endsWith('_id') && colName !== 'id'
                              return (
                                <div
                                  key={colName}
                                  className="flex items-center gap-1.5 text-[11px] py-0.5 px-1 rounded hover:bg-amber-50/60 transition-colors"
                                >
                                  {isPK && <Key className="h-2.5 w-2.5 text-amber-600 shrink-0" />}
                                  {isFK && <Link2 className="h-2.5 w-2.5 text-sky-500 shrink-0" />}
                                  {!isPK && !isFK && <Circle className="h-1.5 w-1.5 text-muted-foreground/50 shrink-0" />}
                                  <span className={`font-mono truncate ${isPK ? 'font-semibold text-amber-800' : isFK ? 'text-sky-700' : 'text-muted-foreground'}`}>
                                    {colName}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[8px] px-1 py-0 h-3.5 font-mono ml-auto shrink-0 ${
                                      colType.includes('SERIAL') || colType.includes('PRIMARY') ? 'border-amber-300 text-amber-700'
                                      : colType.includes('INTEGER') || colType.includes('REFERENCES') ? 'border-sky-300 text-sky-700'
                                      : colType.includes('VARCHAR') || colType.includes('TEXT') ? 'border-emerald-300 text-emerald-700'
                                      : colType.includes('DECIMAL') || colType.includes('FLOAT') ? 'border-purple-300 text-purple-700'
                                      : colType.includes('TIMESTAMP') || colType.includes('DATE') ? 'border-orange-300 text-orange-700'
                                      : 'border-gray-300 text-gray-600'
                                    }`}
                                  >
                                    {colType.split('(')[0]}
                                  </Badge>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
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
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={onTopologicalSort} aria-label="Sort dependencies">
                    <ListOrdered className="h-3 w-3" /> Sort
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Topological sort (dependency order)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={onFindCutpoints} aria-label="Find cutpoints">
                    <AlertTriangle className="h-3 w-3" /> Cutpoints
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Find critical tables (cutpoints)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={onComputeConstraintClosure} aria-label="Show constraints">
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

      <div className="flex-1 overflow-hidden">
        {explorerView === 'tree' ? (
          <div className="p-2 h-full overflow-y-auto">
            {renderTreeView()}
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
                            {tables[name] && (
                              <text x={nodeW / 2} y={nodeH - 4} textAnchor="middle" fontSize="7" fill="#9ca3af">{tables[name].length} rows</text>
                            )}
                          </g>
                        )
                      })}
                    </g>
                  </svg>
                </div>

                <div className="border-t shrink-0 max-h-[40%] overflow-y-auto">
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
})
