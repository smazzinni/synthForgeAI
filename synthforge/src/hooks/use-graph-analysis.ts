import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/app-store'

export function useGraphAnalysis(
  getTablesFromMessages: Record<string, Record<string, unknown>[]>,
  getSchemaFromDb: Record<string, { columns: Record<string, string>; relationships?: string[] }>
) {
  const setTopologicalSortResult = useAppStore((s) => s.setTopologicalSortResult)
  const setCutpoints = useAppStore((s) => s.setCutpoints)
  const setSelectedGraphNode = useAppStore((s) => s.setSelectedGraphNode)
  const setReachableTables = useAppStore((s) => s.setReachableTables)
  const setConstraintClosureResult = useAppStore((s) => s.setConstraintClosureResult)
  const setDfsResult = useAppStore((s) => s.setDfsResult)
  const setCycleDetectionResult = useAppStore((s) => s.setCycleDetectionResult)
  const setIsAnalysisRunning = useAppStore((s) => s.setIsAnalysisRunning)

  const buildDependencyGraph = useCallback(() => {
    const allTableNames = new Set([...Object.keys(getTablesFromMessages), ...Object.keys(getSchemaFromDb)])
    const edges: { from: string; to: string; via: string }[] = []
    const adj: Record<string, string[]> = {}
    const revAdj: Record<string, string[]> = {}

    for (const name of allTableNames) {
      adj[name] = []
      revAdj[name] = []
    }

    for (const tableName of allTableNames) {
      const tableSchema = getSchemaFromDb[tableName]
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
    const { allTableNames, adj, revAdj } = buildDependencyGraph()
    const sorted: string[] = []
    const queue: string[] = []
    const visited = new Set<string>()

    for (const name of allTableNames) {
      if (adj[name].length === 0) queue.push(name)
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      sorted.push(current)
      for (const dependent of revAdj[current] || []) {
        const allDepsVisited = adj[dependent].every((dep: string) => visited.has(dep))
        if (allDepsVisited && !visited.has(dependent)) queue.push(dependent)
      }
    }

    for (const name of allTableNames) {
      if (!visited.has(name)) sorted.push(name)
    }

    setTopologicalSortResult(sorted)
    return sorted
  }, [buildDependencyGraph, setTopologicalSortResult])

  const findCutpoints = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    if (allTableNames.size <= 2) {
      setCutpoints(Array.from(allTableNames))
      return Array.from(allTableNames)
    }

    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) {
      for (const dep of adj[name]) {
        undirectedAdj[name].add(dep)
        undirectedAdj[dep].add(name)
      }
    }

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
          if ((parent[u] === null && children > 1) || (parent[u] !== null && low[v] >= disc[u])) ap.add(u)
        } else if (v !== parent[u]) {
          low[u] = Math.min(low[u], disc[v])
        }
      }
    }

    for (const name of allTableNames) {
      if (disc[name] === undefined) { parent[name] = null; dfs(name) }
    }
    for (const name of allTableNames) {
      if (undirectedAdj[name].size === 0) ap.add(name)
    }

    const result = Array.from(ap)
    setCutpoints(result)
    return result
  }, [buildDependencyGraph, setCutpoints])

  const bfsReachable = useCallback((startNode: string) => {
    const { allTableNames, adj } = buildDependencyGraph()
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) {
      for (const dep of adj[name]) { undirectedAdj[name].add(dep); undirectedAdj[dep].add(name) }
    }

    const visited = new Set<string>()
    const queue = [startNode]
    visited.add(startNode)

    while (queue.length > 0) {
      const current = queue.shift()!
      for (const neighbor of undirectedAdj[current]) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor) }
      }
    }

    const result = Array.from(visited).filter(n => n !== startNode)
    setReachableTables(result)
    setSelectedGraphNode(startNode)
    return result
  }, [buildDependencyGraph, setReachableTables, setSelectedGraphNode])

  const dfsTraversal = useCallback((startNode?: string) => {
    const { allTableNames, adj } = buildDependencyGraph()
    const undirectedAdj: Record<string, Set<string>> = {}
    for (const name of allTableNames) undirectedAdj[name] = new Set()
    for (const name of allTableNames) {
      for (const dep of adj[name]) { undirectedAdj[name].add(dep); undirectedAdj[dep].add(name) }
    }

    const visited = new Set<string>()
    const result: string[] = []
    const nodes = startNode ? [startNode] : Array.from(allTableNames)

    const dfs = (node: string) => {
      if (visited.has(node)) return
      visited.add(node)
      result.push(node)
      for (const neighbor of undirectedAdj[node]) { if (!visited.has(neighbor)) dfs(neighbor) }
    }

    for (const node of nodes) dfs(node)
    setDfsResult(result)
    return result
  }, [buildDependencyGraph, setDfsResult])

  const detectCycles = useCallback(() => {
    const { allTableNames, adj } = buildDependencyGraph()
    const visited = new Set<string>()
    const recursionStack = new Set<string>()
    const cycles: string[] = []

    const dfs = (node: string, path: string[]) => {
      visited.add(node)
      recursionStack.add(node)
      path.push(node)
      for (const neighbor of adj[node]) {
        if (!visited.has(neighbor)) { dfs(neighbor, path) }
        else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor)
          if (cycleStart >= 0) { cycles.push(path.slice(cycleStart).concat([neighbor]).join(' → ')) }
        }
      }
      path.pop()
      recursionStack.delete(node)
    }

    for (const name of allTableNames) { if (!visited.has(name)) dfs(name, []) }
    setCycleDetectionResult(cycles)
    return cycles
  }, [buildDependencyGraph, setCycleDetectionResult])

  const computeConstraintClosure = useCallback(() => {
    const { edges, adj } = buildDependencyGraph()
    const result: { from: string; to: string; via: string; cascades: string[] }[] = []
    for (const edge of edges) {
      const cascades: string[] = []
      const visited = new Set<string>()
      const queue = [edge.to]
      visited.add(edge.to)
      while (queue.length > 0) {
        const current = queue.shift()!
        for (const dep of adj[current]) {
          if (!visited.has(dep)) { visited.add(dep); cascades.push(dep); queue.push(dep) }
        }
      }
      result.push({ from: edge.from, to: edge.to, via: edge.via, cascades })
    }
    setConstraintClosureResult(result)
    return result
  }, [buildDependencyGraph, setConstraintClosureResult])

  const runAllAnalysis = useCallback(() => {
    setIsAnalysisRunning(true)
    try {
      topologicalSort()
      findCutpoints()
      dfsTraversal()
      detectCycles()
      computeConstraintClosure()
    } finally {
      setIsAnalysisRunning(false)
    }
  }, [topologicalSort, findCutpoints, dfsTraversal, detectCycles, computeConstraintClosure, setIsAnalysisRunning])

  return {
    buildDependencyGraph, topologicalSort, findCutpoints,
    bfsReachable, dfsTraversal, detectCycles,
    computeConstraintClosure, runAllAnalysis
  }
}
