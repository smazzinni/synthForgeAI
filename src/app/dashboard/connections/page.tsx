'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Database,
  Plus,
  Loader2,
  Trash2,
  Plug,
  PlugZap,
  Server,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Pencil,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost, apiPatch, apiDelete, invalidateCache } from '@/lib/api-client'

interface SafeDbConnection {
  id: string
  name: string
  dialect: 'postgres' | 'mysql'
  host: string
  port: number
  username: string
  database: string
  schema?: string
  ssl: boolean
  status: 'untested' | 'connected' | 'failed'
  last_connected_at: string | null
  error_message: string | null
  password_masked: string
  created_at: string
  updated_at: string
}

const DEFAULT_PORTS: Record<'postgres' | 'mysql', number> = {
  postgres: 5432,
  mysql: 3306,
}

export default function DatabaseConnectionsPage() {
  const router = useRouter()
  const [connections, setConnections] = useState<SafeDbConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    dialect: 'postgres' as 'postgres' | 'mysql',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: '',
    schema: 'public',
    ssl: false,
  })

  const loadConnections = useCallback(async () => {
    try {
      const data = await apiGet<{ connections: SafeDbConnection[] }>('/api/connections', { cacheTtl: 0, force: true })
      setConnections(data.connections || [])
    } catch {
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  const openNewDialog = () => {
    setEditingId(null)
    setForm({
      name: '',
      dialect: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '',
      database: '',
      schema: 'public',
      ssl: false,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (conn: SafeDbConnection) => {
    setEditingId(conn.id)
    setForm({
      name: conn.name,
      dialect: conn.dialect,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      password: '', // Don't prefill — server only has the masked version
      database: conn.database,
      schema: conn.schema || (conn.dialect === 'postgres' ? 'public' : ''),
      ssl: conn.ssl,
    })
    setDialogOpen(true)
  }

  const handleDialectChange = (dialect: 'postgres' | 'mysql') => {
    setForm(prev => ({
      ...prev,
      dialect,
      port: DEFAULT_PORTS[dialect],
      schema: dialect === 'postgres' ? (prev.schema || 'public') : '',
    }))
  }

  const handleSave = async (test: boolean) => {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim() || !form.database.trim()) {
      toast.error('Please fill in name, host, username, and database')
      return
    }
    // BUGFIX (BUG-52): client-side port validation — previously the user
    // could enter 0 or 99999 and only get a generic server error.
    if (!Number.isInteger(form.port) || form.port < 1 || form.port > 65535) {
      toast.error('Port must be an integer between 1 and 65535')
      return
    }
    if (!editingId && !form.password) {
      toast.error('Password is required for new connections')
      return
    }
    setSaving(true)
    setTesting(test)
    try {
      const payload: Record<string, unknown> = { ...form, test }
      let result
      if (editingId) {
        // If password is empty on edit, don't send it (keep existing)
        if (!payload.password) delete payload.password
        result = await apiPatch<{ connection: SafeDbConnection; test?: { ok: boolean; error?: string; hint?: string; latencyMs?: number } }>('/api/connections', { id: editingId, ...payload })
      } else {
        result = await apiPost<{ connection: SafeDbConnection; test?: { ok: boolean; error?: string; hint?: string; latencyMs?: number } }>('/api/connections', payload)
      }
      invalidateCache('/api/connections')

      // BUGFIX (BUG-55): previously we showed BOTH a green "Saved — but
      // connection test failed" toast AND a red "Test failed: ..." toast
      // simultaneously. Now we show a single contextual toast:
      //   - test ok      → green success
      //   - test failed  → warning with the error + hint
      //   - no test      → green "Connection saved"
      if (test) {
        if (result.test?.ok) {
          toast.success(`Connection saved and verified (${result.test.latencyMs ?? 0}ms)`)
        } else {
          // Show the failure as a single warning toast with the hint if available
          const errMsg = result.test?.error || 'Unknown error'
          const hint = result.test?.hint
          // Use warning so the user knows the connection was saved but isn't usable yet
          if (hint) {
            toast.warning(`Connection saved, but test failed: ${errMsg}`, {
              description: hint,
              duration: 10000,
            })
          } else {
            toast.warning(`Connection saved, but test failed: ${errMsg}`)
          }
        }
      } else {
        toast.success('Connection saved')
      }

      setDialogOpen(false)
      await loadConnections()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save connection')
    } finally {
      setSaving(false)
      setTesting(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete connection "${name}"? This cannot be undone.`)) return
    setDeleting(id)
    try {
      await apiDelete(`/api/connections?id=${id}`)
      invalidateCache('/api/connections')
      setConnections(prev => prev.filter(c => c.id !== id))
      toast.success(`Connection "${name}" deleted`)
    } catch {
      toast.error('Failed to delete connection')
    } finally {
      setDeleting(null)
    }
  }

  const handleOpenInStudio = (conn: SafeDbConnection) => {
    // Route to studio with ?connectionId=... so it loads the external DB
    router.push(`/dashboard/studio?connectionId=${conn.id}`)
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <PlugZap className="h-7 w-7 text-amber-600" />
            Database Connections
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Connect to a live PostgreSQL or MySQL database, then ask the AI chat to perform CRUD operations on it.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog} className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              New Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Connection' : 'New Database Connection'}</DialogTitle>
              <DialogDescription>
                Enter your database credentials. We&apos;ll test the connection before saving. Passwords are stored encrypted-at-rest in Supabase (or in-memory locally).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto py-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name">Connection Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Production Postgres"
                />
              </div>

              {/* Dialect */}
              <div className="space-y-1.5">
                <Label>Database Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(['postgres', 'mysql'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => handleDialectChange(d)}
                      className={`flex items-center justify-center gap-2 py-2 rounded-md border text-sm transition-colors ${
                        form.dialect === d
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium'
                          : 'border-muted hover:bg-accent'
                      }`}
                    >
                      <Database className="h-3.5 w-3.5" />
                      {d === 'postgres' ? 'PostgreSQL' : 'MySQL'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Host & Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="host">Host</Label>
                  <Input
                    id="host"
                    value={form.host}
                    onChange={(e) => setForm(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="localhost or db.example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port">Port</Label>
                  <Input
                    id="port"
                    type="number"
                    value={form.port}
                    onChange={(e) => setForm(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    Password {editingId && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder={editingId ? '••••••••' : ''}
                  />
                </div>
              </div>

              {/* Database & Schema */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="database">Database Name</Label>
                  <Input
                    id="database"
                    value={form.database}
                    onChange={(e) => setForm(prev => ({ ...prev, database: e.target.value }))}
                    placeholder="mydb"
                  />
                </div>
                {form.dialect === 'postgres' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="schema">Schema (optional)</Label>
                    <Input
                      id="schema"
                      value={form.schema}
                      onChange={(e) => setForm(prev => ({ ...prev, schema: e.target.value }))}
                      placeholder="public"
                    />
                  </div>
                )}
              </div>

              {/* SSL */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={form.ssl}
                  onChange={(e) => setForm(prev => ({ ...prev, ssl: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                Use SSL (recommended for remote DBs)
              </label>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={saving}
              >
                {saving && !testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Without Test
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
              >
                {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                Test & Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Server className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{connections.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Connected</p>
                <p className="text-xl font-bold">{connections.filter(c => c.status === 'connected').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                <AlertCircle className="h-4 w-4 text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Failed</p>
                <p className="text-xl font-bold">{connections.filter(c => c.status === 'failed').length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connection list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
        </div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Plug className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No connections yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first database connection to start performing AI-driven CRUD operations against it.
            </p>
            <Button onClick={openNewDialog} className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Plus className="mr-2 h-4 w-4" />
              Add Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {connections.map((conn) => (
            <Card key={conn.id} className="hover:shadow-md transition-shadow group">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0 ${
                    conn.dialect === 'postgres'
                      ? 'bg-gradient-to-br from-sky-500 to-blue-600'
                      : 'bg-gradient-to-br from-orange-500 to-amber-600'
                  }`}>
                    <Database className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{conn.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {conn.dialect === 'postgres' ? 'PostgreSQL' : 'MySQL'} · {conn.host}:{conn.port}/{conn.database}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Badge
                        variant="outline"
                        className={
                          conn.status === 'connected'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px]'
                            : conn.status === 'failed'
                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-[9px]'
                            : 'text-[9px]'
                        }
                      >
                        {conn.status === 'connected' && <CheckCircle2 className="mr-0.5 h-2 w-2" />}
                        {conn.status === 'failed' && <AlertCircle className="mr-0.5 h-2 w-2" />}
                        {conn.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {conn.username} · {conn.password_masked}
                      </span>
                    </div>
                    {conn.error_message && conn.status === 'failed' && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 line-clamp-2">
                        {conn.error_message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-[10px] flex-1 bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
                    onClick={() => handleOpenInStudio(conn)}
                    disabled={conn.status === 'failed'}
                  >
                    <MessageSquare className="mr-1 h-3 w-3" />
                    Open in AI Chat
                    <ArrowRight className="ml-1 h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => openEditDialog(conn)}
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(conn.id, conn.name)}
                    disabled={deleting === conn.id}
                    title="Delete"
                  >
                    {deleting === conn.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Help footer */}
      <Card className="mt-6 bg-muted/30 border-dashed">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <MessageSquare className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-sm">
              <p className="font-medium mb-1">How AI chat CRUD works</p>
              <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
                <li>Add a connection above (click <strong>Test &amp; Save</strong> to verify connectivity).</li>
                <li>Click <strong>Open in AI Chat</strong> on a connected database.</li>
                <li>The studio loads the schema and sample rows from your live DB.</li>
                <li>Ask the AI to perform operations like <em>&quot;delete all users older than 1 year&quot;</em>, <em>&quot;rewrite the orders table to add a status column&quot;</em>, or <em>&quot;drop the legacy_logs table&quot;</em>.</li>
                <li>The AI returns SQL. The frontend executes it against your live DB. Destructive operations require explicit confirmation.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
