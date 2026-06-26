'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table2,
  GitBranch,
  Star,
  StarOff,
  ZoomIn,
  ZoomOut,
  Move,
} from 'lucide-react'
import type { SchemaTable } from '../_lib/types'
import type { ERNode, EREdge } from '../_lib/utils'

// ─── ExplorerTab ───
// "Explorer" tab in the studio's right panel. Renders a schema tree sidebar
// (table cards with PK/FK column badges, row counts, favourite star toggle,
// "preview first 5 rows" link) and a pannable/zoomable SVG ER diagram with
// crow's-foot relationship lines, FK column labels, and 1:N cardinality
// markers.
//
// Pure presentational component: all state (selectedTable, favoriteTables,
// explorerZoom, explorerPan, isPanning, panStart) and the pre-computed ER
// layout live in the parent studio page. The parent passes current values,
// React setters, plus an `onSelectTable` callback that selects the table and
// switches the right panel back to the Data tab.

// React's setState dispatch type (matches the type of `setExplorerZoom` etc).
type SetState<T> = (value: T | ((prev: T) => T)) => void

export interface ExplorerTabProps {
  // ─── Schema + data ───
  schema: SchemaTable[]
  data: Record<string, unknown[]>
  selectedTable: string

  // ─── ER layout (pre-computed by parent via computeERLayout) ───
  erLayout: { nodes: ERNode[]; edges: EREdge[] }

  // ─── Favourites ───
  favoriteTables: Set<string>
  setFavoriteTables: SetState<Set<string>>

  // ─── Zoom / pan state ───
  explorerZoom: number
  setExplorerZoom: SetState<number>
  explorerPan: { x: number; y: number }
  setExplorerPan: SetState<{ x: number; y: number }>
  isPanning: boolean
  setIsPanning: SetState<boolean>
  panStart: { x: number; y: number }
  setPanStart: SetState<{ x: number; y: number }>

  // ─── Action callbacks ───
  /**
   * Select the given table and switch to the Data tab.
   * Called when the user clicks a table node in the ER diagram, a table card
   * in the sidebar, or a "preview" link.
   */
  onSelectTable: (name: string) => void
}

export function ExplorerTab({
  schema,
  data,
  selectedTable,
  erLayout,
  favoriteTables,
  setFavoriteTables,
  explorerZoom,
  setExplorerZoom,
  explorerPan,
  setExplorerPan,
  isPanning,
  setIsPanning,
  panStart,
  setPanStart,
  onSelectTable,
}: ExplorerTabProps) {
  // SVG dimensions based on layout (kept inside the component so the parent
  // doesn't have to compute them — they're purely a presentation detail).
  const svgWidth = Math.max(
    600,
    erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.x)) + 280 : 600,
  )
  const svgHeight = Math.max(
    400,
    erLayout.nodes.length > 0 ? Math.max(...erLayout.nodes.map(n => n.y)) + 250 : 400,
  )

  return (
    <div className="flex h-full">
      {/* Schema tree sidebar */}
      <div className="w-56 border-r bg-muted/30 flex flex-col shrink-0 overflow-hidden">
        <div className="px-2 py-1.5 border-b shrink-0">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Schema Tree</p>
        </div>
        <ScrollArea className="flex-1 min-h-0 p-1.5">
          <div className="space-y-1.5">
            {schema.map((table) => {
              const tableData = data[table.name] as Record<string, unknown>[] | undefined
              const isFav = favoriteTables.has(table.name)
              return (
                <div key={table.name} className="rounded border bg-card overflow-hidden">
                  <div className="px-2 py-1 bg-muted/50 flex items-center gap-1.5 border-b">
                    <Table2 className="h-2.5 w-2.5 text-amber-600" />
                    <span className="text-[10px] font-semibold">{table.name}</span>
                    <Badge variant="outline" className="text-[7px] ml-auto px-0.5 py-0">
                      {tableData?.length || 0} rows
                    </Badge>
                    <button
                      onClick={() => {
                        setFavoriteTables(prev => {
                          const next = new Set(prev)
                          if (next.has(table.name)) next.delete(table.name)
                          else next.add(table.name)
                          return next
                        })
                      }}
                      className="ml-0.5"
                    >
                      {isFav ? (
                        <Star className="h-2.5 w-2.5 text-amber-500 fill-amber-500" />
                      ) : (
                        <StarOff className="h-2.5 w-2.5 text-muted-foreground/50" />
                      )}
                    </button>
                  </div>
                  <div className="p-1 space-y-px">
                    {table.columns.map((col) => (
                      <div key={col.name} className="flex items-center justify-between px-1 py-px rounded text-[9px] hover:bg-muted/50">
                        <div className="flex items-center gap-0.5">
                          {col.name === 'id' && (
                            <Badge variant="secondary" className="text-[6px] px-0.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">PK</Badge>
                          )}
                          {col.name.endsWith('_id') && col.name !== 'id' && (
                            <Badge variant="secondary" className="text-[6px] px-0.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">FK</Badge>
                          )}
                          <span className="font-mono">{col.name}</span>
                        </div>
                        <span className="text-muted-foreground font-mono text-[8px]">{col.type}</span>
                      </div>
                    ))}
                  </div>
                  {/* Quick preview */}
                  {tableData && tableData.length > 0 && (
                    <button
                      onClick={() => onSelectTable(table.name)}
                      className="w-full px-2 py-1 text-[9px] text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 border-t transition-colors"
                    >
                      Preview first 5 rows →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* ER Diagram visualization */}
      <div className="flex-1 relative overflow-hidden bg-muted/10">
        {/* Zoom controls */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-card border rounded-lg px-1.5 py-1 shadow-sm">
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExplorerZoom(z => Math.max(0.3, z - 0.2))}>
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-[9px] font-mono min-w-[32px] text-center">{Math.round(explorerZoom * 100)}%</span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setExplorerZoom(z => Math.min(2, z + 0.2))}>
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => { setExplorerZoom(1); setExplorerPan({ x: 0, y: 0 }) }}>
            <Move className="h-3 w-3" />
          </Button>
        </div>

        <div
          className="w-full h-full overflow-auto cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => {
            setIsPanning(true)
            setPanStart({ x: e.clientX - explorerPan.x, y: e.clientY - explorerPan.y })
          }}
          onMouseMove={(e) => {
            if (isPanning) {
              setExplorerPan({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
              })
            }
          }}
          onMouseUp={() => setIsPanning(false)}
          onMouseLeave={() => setIsPanning(false)}
        >
          <svg
            width={svgWidth}
            height={svgHeight}
            style={{
              transform: `translate(${explorerPan.x}px, ${explorerPan.y}px) scale(${explorerZoom})`,
              transformOrigin: '0 0',
            }}
          >
            {/* SVG defs for arrowheads */}
            <defs>
              {/* Arrow pointing to the "many" side (filled triangle) */}
              <marker id="arrowhead-many" markerWidth="12" markerHeight="8" refX="12" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L12,4 L0,8 L3,4 Z" fill="#8b5cf6" />
              </marker>
              {/* "One" indicator — single perpendicular line */}
              <marker id="arrowhead-one" markerWidth="8" markerHeight="12" refX="4" refY="6" orient="auto" markerUnits="strokeWidth">
                <line x1="4" y1="0" x2="4" y2="12" stroke="#8b5cf6" strokeWidth="2" />
              </marker>
              {/* Crow's foot for "many" side */}
              <marker id="crowfoot-many" markerWidth="14" markerHeight="14" refX="14" refY="7" orient="auto" markerUnits="strokeWidth">
                <line x1="0" y1="0" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
                <line x1="0" y1="14" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
                <line x1="0" y1="7" x2="14" y2="7" stroke="#8b5cf6" strokeWidth="1.5" />
              </marker>
              {/* Simple filled arrow for the "to" end */}
              <marker id="arrow-filled" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
                <polygon points="0,0 10,3.5 0,7" fill="#7c3aed" />
              </marker>
            </defs>

            {/* Render relationship lines with arrows and labels */}
            {erLayout.edges.map((edge, i) => {
              const fromNode = erLayout.nodes.find(n => n.name === edge.from)
              const toNode = erLayout.nodes.find(n => n.name === edge.to)
              if (!fromNode || !toNode) return null

              // Calculate edge endpoints at node borders
              const fromNodeWidth = 200
              const fromHeaderHeight = 24
              const fromColHeight = 14
              const fromNodeHeight = fromHeaderHeight + Math.min(fromNode.schema.columns.length, 8) * fromColHeight + 8

              const toNodeWidth = 200
              const toHeaderHeight = 24
              const toColHeight = 14
              const toNodeHeight = toHeaderHeight + Math.min(toNode.schema.columns.length, 8) * toColHeight + 8

              const fromCenterX = fromNode.x + fromNodeWidth / 2
              const fromCenterY = fromNode.y + fromNodeHeight / 2
              const toCenterX = toNode.x + toNodeWidth / 2
              const toCenterY = toNode.y + toNodeHeight / 2

              // Calculate intersection points with node rectangles
              const dx = toCenterX - fromCenterX
              const dy = toCenterY - fromCenterY

              // Determine from edge point
              let fromX: number, fromY: number
              if (Math.abs(dx) * fromNodeHeight > Math.abs(dy) * fromNodeWidth) {
                // Exit from left or right side
                fromX = dx > 0 ? fromNode.x + fromNodeWidth : fromNode.x
                fromY = fromCenterY + (fromX - fromCenterX) * (dy / dx)
              } else {
                // Exit from top or bottom
                fromY = dy > 0 ? fromNode.y + fromNodeHeight : fromNode.y
                fromX = fromCenterX + (fromY - fromCenterY) * (dx / dy)
              }

              // Determine to edge point
              let toX: number, toY: number
              if (Math.abs(dx) * toNodeHeight > Math.abs(dy) * toNodeWidth) {
                toX = dx > 0 ? toNode.x : toNode.x + toNodeWidth
                toY = toCenterY + (toX - toCenterX) * (dy / dx)
              } else {
                toY = dy > 0 ? toNode.y : toNode.y + toNodeHeight
                toX = toCenterX + (toY - toCenterY) * (dx / dy)
              }

              // Check if the FK column is optional (nullable) — for line style
              const fkColumn = fromNode.schema.columns.find(c => c.name === edge.fromCol)
              const isOptional = fkColumn?.type?.toLowerCase().includes('null') || false

              // Midpoint for label
              const midX = (fromX + toX) / 2
              const midY = (fromY + toY) / 2

              // Edge label background rect
              const labelText = edge.fromCol
              const labelWidth = labelText.length * 5.5 + 8
              const labelHeight = 12

              return (
                <g key={`edge-${i}`}>
                  {/* Background line (wider, semi-transparent for glow effect) */}
                  <line
                    x1={fromX}
                    y1={fromY}
                    x2={toX}
                    y2={toY}
                    stroke="#8b5cf6"
                    strokeWidth={4}
                    strokeDasharray={isOptional ? '8 4' : 'none'}
                    opacity={0.15}
                  />
                  {/* Main connection line */}
                  <line
                    x1={fromX}
                    y1={fromY}
                    x2={toX}
                    y2={toY}
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray={isOptional ? '8 4' : 'none'}
                    markerEnd="url(#arrow-filled)"
                  />

                  {/* FK column label at midpoint */}
                  <rect
                    x={midX - labelWidth / 2}
                    y={midY - labelHeight / 2 - 9}
                    width={labelWidth}
                    height={labelHeight}
                    rx={3}
                    fill="#ffffff"
                    stroke="#8b5cf6"
                    strokeWidth={0.8}
                  />
                  <text
                    x={midX}
                    y={midY - 3}
                    textAnchor="middle"
                    fill="#6d28d9"
                    fontSize={7}
                    fontWeight={500}
                    fontFamily="monospace"
                  >
                    {labelText}
                  </text>

                  {/* "1" label at the "one" end (near toNode/target) */}
                  <text
                    x={toX + (fromX - toX) * 0.1}
                    y={toY + (fromY - toY) * 0.1 - 5}
                    textAnchor="middle"
                    fill="#7c3aed"
                    fontSize={10}
                    fontWeight={700}
                  >
                    1
                  </text>

                  {/* "N" label at the "many" end (near fromNode/source) */}
                  <text
                    x={fromX + (toX - fromX) * 0.1}
                    y={fromY + (toY - fromY) * 0.1 - 5}
                    textAnchor="middle"
                    fill="#7c3aed"
                    fontSize={10}
                    fontWeight={700}
                  >
                    N
                  </text>
                </g>
              )
            })}

            {/* Render table nodes */}
            {erLayout.nodes.map((node) => {
              const isFav = favoriteTables.has(node.name)
              const headerHeight = 24
              const colHeight = 14
              const nodeWidth = 200
              const nodeHeight = headerHeight + Math.min(node.schema.columns.length, 8) * colHeight + 8

              return (
                <g
                  key={node.name}
                  onClick={() => onSelectTable(node.name)}
                  className="cursor-pointer"
                >
                  {/* Shadow */}
                  <rect
                    x={node.x + 2}
                    y={node.y + 2}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={6}
                    fill="rgba(0,0,0,0.08)"
                  />
                  {/* Main box */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={nodeWidth}
                    height={nodeHeight}
                    rx={6}
                    fill="#ffffff"
                    stroke={selectedTable === node.name ? '#d97706' : '#f59e0b'}
                    strokeWidth={selectedTable === node.name ? 2.5 : 1}
                  />
                  {/* Header */}
                  <rect
                    x={node.x}
                    y={node.y}
                    width={nodeWidth}
                    height={headerHeight}
                    rx={6}
                    fill="#fef3c7"
                  />
                  <rect
                    x={node.x}
                    y={node.y + headerHeight - 6}
                    width={nodeWidth}
                    height={6}
                    fill="#fef3c7"
                  />
                  {/* Table name */}
                  <text
                    x={node.x + 10}
                    y={node.y + 16}
                    fill="#92400e"
                    fontSize={10}
                    fontWeight={700}
                  >
                    {isFav && '★ '}{node.name}
                  </text>
                  {/* Row count badge */}
                  <text
                    x={node.x + nodeWidth - 10}
                    y={node.y + 16}
                    textAnchor="end"
                    fill="#6b7280"
                    fontSize={8}
                  >
                    {node.rows} rows
                  </text>
                  {/* Columns */}
                  {node.schema.columns.slice(0, 8).map((col, ci) => (
                    <g key={col.name}>
                      <text
                        x={node.x + 10}
                        y={node.y + headerHeight + 10 + ci * colHeight}
                        fill={col.name === 'id' || col.name.endsWith('_id') ? '#b45309' : '#374151'}
                        fontSize={8}
                        fontFamily="monospace"
                      >
                        {col.name === 'id' ? '🔑 ' : col.name.endsWith('_id') ? '🔗 ' : ''}{col.name}
                      </text>
                      <text
                        x={node.x + nodeWidth - 10}
                        y={node.y + headerHeight + 10 + ci * colHeight}
                        textAnchor="end"
                        fill="#9ca3af"
                        fontSize={7}
                        fontFamily="monospace"
                      >
                        {col.type}
                      </text>
                    </g>
                  ))}
                  {node.schema.columns.length > 8 && (
                    <text
                      x={node.x + 10}
                      y={node.y + headerHeight + 10 + 8 * colHeight}
                      fill="#9ca3af"
                      fontSize={7}
                    >
                      +{node.schema.columns.length - 8} more columns...
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>

        {Object.keys(data).length <= 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-muted-foreground">
              <GitBranch className="h-6 w-6 mx-auto mb-1.5 opacity-20" />
              <p className="text-[10px]">ER diagram appears with</p>
              <p className="text-[10px]">multiple connected tables</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
