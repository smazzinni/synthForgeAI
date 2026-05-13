'use client'

import React, { useState, useMemo } from 'react'
import { Table2, Link2, Network, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface ERDiagramProps {
  schema: Record<string, { columns: Record<string, string>; relationships?: string[] }>
  tables: Record<string, Record<string, unknown>[]>
  erSvgRef: React.RefObject<SVGSVGElement | null>
}

export function ERDiagram({ schema, tables, erSvgRef }: ERDiagramProps) {
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
    if (type === '1:1') return '#8b5cf6'
    if (type === '1:N') return '#0ea5e9'
    if (type === 'M:N') return '#f59e0b'
    return '#6b7280'
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

    const fromCenterX = fromPos.x + tableWidth / 2
    const fromCenterY = fromPos.y + fromH / 2
    const toCenterX = toPos.x + tableWidth / 2
    const toCenterY = toPos.y + toH / 2

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
        <text x={fromX + (fromCenterX < toCenterX ? 8 : -12)} y={fromY - 6} fontSize="11" fontWeight="bold" fill={color}>{fromCardinality}</text>
        <text x={toX + (fromCenterX < toCenterX ? -12 : 8)} y={toY - 6} fontSize="11" fontWeight="bold" fill={color}>{toCardinality}</text>
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
            <pattern id="er-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
            </pattern>
          </defs>

          <g transform={`translate(${erTransform.x}, ${erTransform.y}) scale(${erTransform.scale})`}>
            <rect x="-1000" y="-1000" width={maxX + 2000} height={maxY + 2000} fill="url(#er-grid)" />
            {relationships.map((rel, i) => renderEdge(rel, i))}
            {allTableNames.map(tableName => {
              const tableSchema = schema[tableName]
              const tableRows = tables[tableName]
              const columns = tableSchema?.columns || {}
              const colEntries = Object.entries(columns)
              const pos = erTablePositions[tableName] || { x: 0, y: 0 }
              const height = getTableHeight(tableName)

              return (
                <g key={tableName} data-table={tableName} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: 'move' }}>
                  <rect x={2} y={2} width={tableWidth} height={height} rx={6} fill="rgba(0,0,0,0.08)" />
                  <rect width={tableWidth} height={height} rx={6} fill="white" stroke="#d4a054" strokeWidth={1.5} />
                  <rect width={tableWidth} height={headerHeight} rx={6} fill="#d4a054" />
                  <rect y={headerHeight - 6} width={tableWidth} height={6} fill="#d4a054" />
                  <text x={tableWidth / 2} y={18} textAnchor="middle" fontSize="11" fontWeight="bold" fill="white">
                    {tableName}
                  </text>
                  {tableRows && (
                    <text x={tableWidth - 8} y={18} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.8)">
                      {tableRows.length} rows
                    </text>
                  )}
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
