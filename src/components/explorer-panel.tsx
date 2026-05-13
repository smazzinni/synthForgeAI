'use client'

import React, { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  FolderTree, Table2, Network, GitBranch, ListOrdered,
  AlertTriangle, Link2, Search, Maximize2, ChevronRight
} from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface ExplorerPanelProps {
  tables: Record<string, Record<string, unknown>[]>
  schema: Record<string, { columns: Record<string, string>; relationships?: string[] }>
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
  onNavigateToData: () => void
  graphSvgRef: React.RefObject<SVGSVGElement | null>
}

export function ExplorerPanel({
  tables,
  schema,
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
  onNavigateToData,
  graphSvgRef
}: ExplorerPanelProps) {
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
      bfsReachable(nodeName)
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
                      onClick={onNavigateToData}
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
