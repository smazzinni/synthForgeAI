'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Key,
  Plus,
  Copy,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  Eye,
  EyeOff,
  Calendar,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ApiKey {
  id: string
  name: string
  key: string
  createdAt: string
  lastUsed: string | null
}

// ─── In-memory store (persisted to localStorage for demo) ───
// In production, keys would be stored hashed in the database. For this demo
// we keep them in localStorage so they survive page reloads. The key is only
// shown in full ONCE at creation time — after that it's masked.
const STORAGE_KEY = 'synthforge_api_keys'

function loadKeys(): ApiKey[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveKeys(keys: ApiKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // localStorage might be unavailable (private mode)
  }
}

function generateApiKey(): string {
  const prefix = 'sf_'
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let key = prefix
  for (let i = 0; i < 48; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

function maskKey(key: string): string {
  if (key.length <= 12) return key
  return key.slice(0, 8) + '••••••••••••••••••••••••' + key.slice(-4)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKey | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set())
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setKeys(loadKeys())
    setLoading(false)
  }, [])

  const persistKeys = (updated: ApiKey[]) => {
    setKeys(updated)
    saveKeys(updated)
  }

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name for your API key')
      return
    }
    setCreating(true)
    await new Promise(resolve => setTimeout(resolve, 800))
    const newKey: ApiKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: newKeyName.trim(),
      key: generateApiKey(),
      createdAt: new Date().toISOString(),
      lastUsed: null,
    }
    persistKeys([newKey, ...keys])
    setNewlyCreatedKey(newKey)
    setCreating(false)
    setCreateOpen(false)
    setNewKeyName('')
    toast.success(`API key "${newKey.name}" created`)
  }

  const handleCopy = async (key: ApiKey, fullKey: boolean) => {
    const textToCopy = fullKey ? key.key : maskKey(key.key)
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopiedKeyId(key.id)
      setTimeout(() => setCopiedKeyId(null), 2000)
      toast.success(fullKey ? 'Full API key copied' : 'Masked key copied')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeyIds(prev => {
      const next = new Set(prev)
      if (next.has(keyId)) {
        next.delete(keyId)
      } else {
        next.add(keyId)
      }
      return next
    })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    const keyToDelete = keys.find(k => k.id === deleteId)
    persistKeys(keys.filter(k => k.id !== deleteId))
    setDeleting(false)
    setDeleteId(null)
    if (keyToDelete) {
      toast.success(`API key "${keyToDelete.name}" revoked`)
    }
  }

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Loading API keys...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
            <Key className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">API Keys</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Manage API keys for programmatic access</p>
          </div>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-medium text-amber-800 dark:text-amber-400">Keep your API keys secure.</span>{' '}
          <span className="text-amber-700 dark:text-amber-500">
            Never share your API keys in publicly accessible areas such as GitHub, client-side code, or public forums.
            Keys are shown in full only once at creation time — copy and store them securely.
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Key className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Total Keys</p>
                <p className="text-2xl font-bold tabular-nums">{keys.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Active</p>
                <p className="text-2xl font-bold tabular-nums">{keys.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Latest</p>
                <p className="text-2xl font-bold tabular-nums">
                  {keys.length > 0 ? formatDate(keys[0].createdAt).split(' ')[0] : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Keys list */}
      {keys.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Key className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create an API key to access SynthForge AI programmatically. Keys allow you to generate data, manage databases, and run queries via REST API.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Your API Keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {keys.map((apiKey) => {
              const isVisible = visibleKeyIds.has(apiKey.id)
              const isCopied = copiedKeyId === apiKey.id
              return (
                <div
                  key={apiKey.id}
                  className="group flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                >
                  {/* Key info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{apiKey.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium text-emerald-600 border-emerald-300 dark:border-emerald-800">
                        Active
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded select-all">
                        {isVisible ? apiKey.key : maskKey(apiKey.key)}
                      </code>
                      <button
                        onClick={() => toggleKeyVisibility(apiKey.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title={isVisible ? 'Hide key' : 'Reveal key'}
                      >
                        {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created {formatDate(apiKey.createdAt)}
                      </span>
                      {apiKey.lastUsed && (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          Last used {formatDate(apiKey.lastUsed)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleCopy(apiKey, isVisible)}
                      title="Copy key"
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(apiKey.id)}
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      {createOpen && (
        <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-white" />
                </div>
                Create New API Key
              </AlertDialogTitle>
              <AlertDialogDescription>
                Give your API key a descriptive name so you can identify it later. The key will be shown only once after creation.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <Label htmlFor="key-name" className="mb-2 block">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., Production Server, Development, CI/CD Pipeline"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreate()
                  }
                }}
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCreate}
                disabled={creating || !newKeyName.trim()}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Key'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Newly created key reveal dialog */}
      {newlyCreatedKey && (
        <AlertDialog open={!!newlyCreatedKey} onOpenChange={(open) => { if (!open) setNewlyCreatedKey(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
                API Key Created
              </AlertDialogTitle>
              <AlertDialogDescription>
                Copy your API key now. For security reasons, it will be masked after you close this dialog.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                <code className="text-xs font-mono flex-1 break-all select-all">
                  {newlyCreatedKey.key}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => handleCopy(newlyCreatedKey, true)}
                >
                  {copiedKeyId === newlyCreatedKey.id ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Store this key securely — you won&apos;t be able to see it in full again.
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction
                onClick={() => setNewlyCreatedKey(null)}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                I&apos;ve saved my key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              Revoke API Key?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Any applications using this key will immediately lose access. Type the key name to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Revoking...
                </>
              ) : (
                'Revoke Key'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
