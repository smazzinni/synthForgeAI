'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  FolderKanban,
  Plus,
  Users,
  Database,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowRight,
  Loader2,
  Settings,
  X,
  Calendar,
  Activity,
  Crown,
  Eye,
  Edit2,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api-client'

// ─── Types ───
interface WorkspaceMember {
  email: string
  role: 'owner' | 'editor' | 'viewer'
}

type WorkspaceColor = 'amber' | 'red' | 'emerald' | 'violet' | 'pink'

interface Workspace {
  id: string
  name: string
  description: string
  color: WorkspaceColor
  members: WorkspaceMember[]
  databaseIds: string[]
  createdAt: string
  updatedAt: string
}

interface DatabaseItem {
  id: string
  name: string
  db_type: string
  status: string
  row_count: number
}

interface ActivityItem {
  id: string
  action: string
  detail: string
  timestamp: string
}

// ─── Constants ───
const STORAGE_KEY = 'synthforge_workspaces'

interface ColorOption {
  id: WorkspaceColor
  label: string
  gradient: string
  chip: string
  dot: string
  ring: string
}

const COLOR_OPTIONS: ColorOption[] = [
  {
    id: 'amber',
    label: 'Amber',
    gradient: 'from-amber-500 to-orange-600',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500',
  },
  {
    id: 'red',
    label: 'Red',
    gradient: 'from-red-500 to-rose-600',
    chip: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
    ring: 'ring-red-500',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    gradient: 'from-emerald-500 to-teal-600',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500',
  },
  {
    id: 'violet',
    label: 'Violet',
    gradient: 'from-violet-500 to-purple-600',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500',
  },
  {
    id: 'pink',
    label: 'Pink',
    gradient: 'from-pink-500 to-fuchsia-600',
    chip: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    dot: 'bg-pink-500',
    ring: 'ring-pink-500',
  },
]

function getColor(id: WorkspaceColor): ColorOption {
  return COLOR_OPTIONS.find(c => c.id === id) ?? COLOR_OPTIONS[0]
}

const AVATAR_COLORS = [
  'bg-amber-500',
  'bg-red-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-purple-500',
  'bg-fuchsia-500',
]

// ─── Helpers ───
function loadWorkspaces(): Workspace[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Workspace[]
    // Seed on first visit
    const seeded = seedWorkspaces()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded))
    return seeded
  } catch {
    return []
  }
}

function saveWorkspaces(workspaces: Workspace[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces))
  } catch {
    // localStorage might be unavailable (private mode)
  }
}

function seedWorkspaces(): Workspace[] {
  const now = Date.now()
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()
  return [
    {
      id: `ws_${now}_ecom`,
      name: 'E-Commerce Project',
      description: 'Databases for our online store MVP',
      color: 'amber',
      members: [
        { email: 'sarah@synthforge.ai', role: 'owner' },
        { email: 'marcus@synthforge.ai', role: 'editor' },
        { email: 'lena@synthforge.ai', role: 'viewer' },
      ],
      databaseIds: [],
      createdAt: daysAgo(12),
      updatedAt: daysAgo(1),
    },
    {
      id: `ws_${now}_health`,
      name: 'Healthcare Analytics',
      description: 'HIPAA-compliant test data for clinical analytics',
      color: 'emerald',
      members: [
        { email: 'aisha@synthforge.ai', role: 'owner' },
        { email: 'marcus@synthforge.ai', role: 'editor' },
      ],
      databaseIds: [],
      createdAt: daysAgo(8),
      updatedAt: daysAgo(2),
    },
  ]
}

function getInitials(email: string): string {
  const name = email.split('@')[0] ?? ''
  const parts = name.split(/[._\-+]/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '??'
}

function getAvatarColor(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    const weeks = Math.floor(days / 7)
    if (days < 30) return `${weeks} week${weeks > 1 ? 's' : ''} ago`
    return formatDate(iso)
  } catch {
    return ''
  }
}

function generateMockActivity(workspace: Workspace): ActivityItem[] {
  const created = new Date(workspace.createdAt).getTime()
  const dayMs = 86400000
  const now = Date.now()

  const activities: ActivityItem[] = [
    {
      id: `${workspace.id}-create`,
      action: 'Workspace created',
      detail: `"${workspace.name}" was created`,
      timestamp: workspace.createdAt,
    },
  ]

  if (workspace.members.length > 1) {
    activities.push({
      id: `${workspace.id}-members`,
      action: 'Members added',
      detail: `${workspace.members.length - 1} member(s) joined the workspace`,
      timestamp: new Date(created + dayMs).toISOString(),
    })
  }

  if (workspace.databaseIds.length > 0) {
    activities.push({
      id: `${workspace.id}-dbs`,
      action: 'Databases linked',
      detail: `${workspace.databaseIds.length} database(s) added to workspace`,
      timestamp: new Date(created + dayMs * 2).toISOString(),
    })
    activities.push({
      id: `${workspace.id}-query`,
      action: 'Query executed',
      detail: 'SELECT * FROM users LIMIT 100',
      timestamp: new Date(now - dayMs).toISOString(),
    })
  }

  activities.push({
    id: `${workspace.id}-update`,
    action: 'Workspace updated',
    detail: 'Workspace settings were updated',
    timestamp: workspace.updatedAt,
  })

  return activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

// ─── Main Component ───
export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => loadWorkspaces())
  const [databases, setDatabases] = useState<DatabaseItem[]>([])
  const [loadingDbs, setLoadingDbs] = useState(true)

  // Dialog state
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formColor, setFormColor] = useState<WorkspaceColor>('amber')
  const [memberEmails, setMemberEmails] = useState<WorkspaceMember[]>([])
  const [memberInput, setMemberInput] = useState('')
  const [memberRole, setMemberRole] = useState<'owner' | 'editor' | 'viewer'>('editor')
  const [selectedDbIds, setSelectedDbIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Persist on every change
  useEffect(() => {
    saveWorkspaces(workspaces)
  }, [workspaces])

  // Fetch databases
  const loadDatabases = useCallback(async () => {
    try {
      const data = await apiGet<{ databases: DatabaseItem[] }>('/api/databases', {
        cacheTtl: 5000,
        timeout: 10000,
      })
      setDatabases(data.databases || [])
    } catch {
      setDatabases([])
    } finally {
      setLoadingDbs(false)
    }
  }, [])

  useEffect(() => {
    loadDatabases()
  }, [loadDatabases])

  // Derived data
  const dbMap = new Map(databases.map(d => [d.id, d]))
  const totalMembers = workspaces.reduce((sum, ws) => sum + ws.members.length, 0)
  const totalDbs = workspaces.reduce((sum, ws) => sum + ws.databaseIds.length, 0)
  const activeWorkspaces = workspaces.filter(ws => {
    const updated = new Date(ws.updatedAt).getTime()
    return Date.now() - updated < 30 * 86400000
  }).length
  const detailWorkspace = workspaces.find(w => w.id === detailId) ?? null

  // ─── Handlers ───
  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormDescription('')
    setFormColor('amber')
    setMemberEmails([])
    setMemberInput('')
    setMemberRole('editor')
    setSelectedDbIds([])
    setEditorOpen(true)
  }

  const openEdit = (ws: Workspace) => {
    setEditingId(ws.id)
    setFormName(ws.name)
    setFormDescription(ws.description)
    setFormColor(ws.color)
    setMemberEmails(ws.members.map(m => ({ ...m })))
    setMemberInput('')
    setMemberRole('editor')
    setSelectedDbIds([...ws.databaseIds])
    setEditorOpen(true)
  }

  const addMember = () => {
    const email = memberInput.trim()
    if (!email) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address')
      return
    }
    if (memberEmails.some(m => m.email === email)) {
      toast.error('This member has already been added')
      return
    }
    setMemberEmails(prev => [...prev, { email, role: memberRole }])
    setMemberInput('')
  }

  const removeMember = (email: string) => {
    setMemberEmails(prev => prev.filter(m => m.email !== email))
  }

  const toggleDb = (id: string) => {
    setSelectedDbIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Please enter a workspace name')
      return
    }
    setSaving(true)
    await new Promise(r => setTimeout(r, 400))
    const now = new Date().toISOString()
    if (editingId) {
      setWorkspaces(prev =>
        prev.map(ws =>
          ws.id === editingId
            ? {
                ...ws,
                name: formName.trim(),
                description: formDescription.trim(),
                color: formColor,
                members: memberEmails,
                databaseIds: selectedDbIds,
                updatedAt: now,
              }
            : ws
        )
      )
      toast.success('Workspace updated')
    } else {
      const newWs: Workspace = {
        id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: formName.trim(),
        description: formDescription.trim(),
        color: formColor,
        members: memberEmails,
        databaseIds: selectedDbIds,
        createdAt: now,
        updatedAt: now,
      }
      setWorkspaces(prev => [newWs, ...prev])
      toast.success(`Workspace "${newWs.name}" created`)
    }
    setSaving(false)
    setEditorOpen(false)
  }

  const handleDelete = () => {
    if (!deleteId) return
    const ws = workspaces.find(w => w.id === deleteId)
    setWorkspaces(prev => prev.filter(w => w.id !== deleteId))
    setDeleteId(null)
    if (ws) toast.success(`Workspace "${ws.name}" deleted`)
  }

  const startRename = (ws: Workspace) => {
    setRenamingId(ws.id)
    setRenameValue(ws.name)
  }

  const commitRename = () => {
    if (!renamingId) return
    const name = renameValue.trim()
    if (!name) {
      toast.error('Workspace name cannot be empty')
      setRenamingId(null)
      return
    }
    setWorkspaces(prev =>
      prev.map(ws =>
        ws.id === renamingId
          ? { ...ws, name, updatedAt: new Date().toISOString() }
          : ws
      )
    )
    setRenamingId(null)
    toast.success('Workspace renamed')
  }

  // ─── Render ───
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-600 to-red-600 flex items-center justify-center shadow-md shrink-0">
            <FolderKanban className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Workspaces</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Organize your databases into collaborative workspaces
            </p>
          </div>
        </div>
        <Button
          onClick={openCreate}
          className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Workspace
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                <FolderKanban className="h-5 w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Total Workspaces</p>
                <p className="text-2xl font-bold tabular-nums">{workspaces.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Database className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Total Databases</p>
                <p className="text-2xl font-bold tabular-nums">{totalDbs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                <Activity className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Active Workspaces</p>
                <p className="text-2xl font-bold tabular-nums">{activeWorkspaces}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Members</p>
                <p className="text-2xl font-bold tabular-nums">{totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center mx-auto mb-4 shadow-md">
              <FolderKanban className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto text-sm">
              Create your first workspace to organize related databases, invite team members,
              and collaborate on synthetic data projects.
            </p>
            <Button
              onClick={openCreate}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Workspace
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workspaces.map(ws => {
            const color = getColor(ws.color)
            const wsDbs = ws.databaseIds
              .map(id => dbMap.get(id))
              .filter((d): d is DatabaseItem => Boolean(d))
            const firstDbs = wsDbs.slice(0, 3)
            const moreDbs = wsDbs.length - 3
            return (
              <Card
                key={ws.id}
                className="group hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
              >
                <div className={`h-1 bg-gradient-to-r ${color.gradient}`} />
                <CardContent className="pt-5">
                  {/* Header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${color.gradient} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {renamingId === ws.id ? (
                        <Input
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitRename()
                            }
                            if (e.key === 'Escape') {
                              setRenamingId(null)
                            }
                          }}
                          className="h-7 text-sm font-semibold px-1.5"
                          autoFocus
                        />
                      ) : (
                        <button
                          className="text-sm font-semibold truncate block w-full text-left hover:text-amber-600 dark:hover:text-amber-500 transition-colors"
                          onClick={() => startRename(ws)}
                          title="Click to rename"
                        >
                          {ws.name}
                        </button>
                      )}
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 min-h-[2rem]">
                        {ws.description || 'No description'}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <MoreVertical className="h-4 w-4" />
                          <span className="sr-only">Workspace actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailId(ws.id)}>
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(ws)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => startRename(ws)}>
                          <Edit2 className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteId(ws.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Members + DB count */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex -space-x-2 shrink-0">
                        {ws.members.slice(0, 4).map(m => (
                          <Avatar key={m.email} className="h-7 w-7 border-2 border-background">
                            <AvatarFallback className={`${getAvatarColor(m.email)} text-white text-[10px] font-medium`}>
                              {getInitials(m.email)}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {ws.members.length > 4 && (
                          <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-medium">
                            +{ws.members.length - 4}
                          </div>
                        )}
                        {ws.members.length === 0 && (
                          <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center">
                            <Users className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">
                        {ws.members.length} {ws.members.length === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] ${color.chip} shrink-0`}>
                      {ws.databaseIds.length} {ws.databaseIds.length === 1 ? 'database' : 'databases'}
                    </Badge>
                  </div>

                  {/* Databases mini list */}
                  {wsDbs.length > 0 ? (
                    <div className="space-y-0.5 mb-3">
                      {firstDbs.map(db => (
                        <Link
                          key={db.id}
                          href={`/dashboard/studio/${db.id}`}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-xs group/db"
                        >
                          <Database className="h-3 w-3 text-muted-foreground group-hover/db:text-amber-600" />
                          <span className="truncate flex-1">{db.name}</span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover/db:opacity-100 transition-opacity" />
                        </Link>
                      ))}
                      {moreDbs > 0 && (
                        <p className="text-[11px] text-muted-foreground pl-2 pt-0.5">+{moreDbs} more</p>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground italic mb-3 px-2 py-1.5">
                      No databases linked
                    </div>
                  )}

                  <Separator className="mb-3" />

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created {formatDate(ws.createdAt)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDetailId(ws.id)}
                    >
                      Open
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Create / Edit Dialog ─── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${getColor(formColor).gradient} flex items-center justify-center`}>
                <FolderKanban className="h-4 w-4 text-white" />
              </div>
              {editingId ? 'Edit Workspace' : 'New Workspace'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update workspace details, members, and linked databases.'
                : 'Create a workspace to organize databases and collaborate with your team.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ws-name"
                placeholder="e.g., E-Commerce Project"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">Description</Label>
              <Textarea
                id="ws-desc"
                placeholder="What is this workspace for?"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <Label>Color Tag</Label>
              <div className="flex items-center gap-2.5">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFormColor(c.id)}
                    className={`h-9 w-9 rounded-full bg-gradient-to-br ${c.gradient} transition-all ${
                      formColor === c.id
                        ? `ring-2 ring-offset-2 ring-offset-background ${c.ring} scale-110`
                        : 'hover:scale-105'
                    }`}
                    title={c.label}
                    aria-label={c.label}
                    aria-pressed={formColor === c.id}
                  />
                ))}
              </div>
            </div>

            {/* Members */}
            <div className="space-y-1.5">
              <Label>Members</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={memberInput}
                  onChange={e => setMemberInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addMember()
                    }
                  }}
                  className="flex-1"
                  aria-label="Member email"
                />
                <select
                  value={memberRole}
                  onChange={e => setMemberRole(e.target.value as 'owner' | 'editor' | 'viewer')}
                  aria-label="Member role"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button type="button" variant="outline" size="sm" onClick={addMember} className="shrink-0">
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Add member</span>
                </Button>
              </div>
              {memberEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {memberEmails.map(m => (
                    <Badge key={m.email} variant="secondary" className="gap-1.5 pl-1 pr-1.5 py-1">
                      <Avatar className="h-4 w-4">
                        <AvatarFallback className={`${getAvatarColor(m.email)} text-white text-[8px]`}>
                          {getInitials(m.email)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs">{m.email}</span>
                      <span className="text-[9px] uppercase opacity-70">{m.role}</span>
                      <button
                        type="button"
                        onClick={() => removeMember(m.email)}
                        className="ml-0.5 hover:bg-background rounded p-0.5"
                        aria-label={`Remove ${m.email}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Databases */}
            <div className="space-y-1.5">
              <Label>Databases</Label>
              {loadingDbs ? (
                <div className="flex items-center gap-2 h-20 justify-center text-sm text-muted-foreground border rounded-md">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading databases...
                </div>
              ) : databases.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-3 text-center">
                  No databases available. Generate databases in the Studio first.
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-md border p-1.5 space-y-0.5">
                  {databases.map(db => {
                    const checked = selectedDbIds.includes(db.id)
                    return (
                      <label
                        key={db.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleDb(db.id)}
                        />
                        <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 truncate">{db.name}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{db.db_type}</Badge>
                      </label>
                    )
                  })}
                </div>
              )}
              {selectedDbIds.length > 0 && (
                <p className="text-[11px] text-muted-foreground">{selectedDbIds.length} selected</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim()}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingId ? (
                'Save Changes'
              ) : (
                'Create Workspace'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Dialog ─── */}
      <Dialog open={!!detailId} onOpenChange={open => { if (!open) setDetailId(null) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailWorkspace && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${getColor(detailWorkspace.color).gradient} flex items-center justify-center shadow-sm shrink-0`}>
                    <FolderKanban className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{detailWorkspace.name}</div>
                    <p className="text-xs font-normal text-muted-foreground mt-0.5">
                      Created {formatDate(detailWorkspace.createdAt)} · Updated {formatRelative(detailWorkspace.updatedAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const ws = detailWorkspace
                      setDetailId(null)
                      openEdit(ws)
                    }}
                  >
                    <Settings className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                </DialogTitle>
                <DialogDescription className="pt-2">
                  {detailWorkspace.description || 'No description provided.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                {/* Members */}
                <section>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4" />
                    Members ({detailWorkspace.members.length})
                  </h4>
                  {detailWorkspace.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic px-2 py-3 border rounded-md text-center">
                      No members in this workspace yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {detailWorkspace.members.map(m => (
                        <div key={m.email} className="flex items-center gap-3 p-2 rounded-md border bg-card">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className={`${getAvatarColor(m.email)} text-white text-xs`}>
                              {getInitials(m.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{m.email}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              m.role === 'owner'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1 shrink-0'
                                : m.role === 'editor'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1 shrink-0'
                                : 'bg-muted text-muted-foreground gap-1 shrink-0'
                            }
                          >
                            {m.role === 'owner' && <Crown className="h-3 w-3" />}
                            {m.role === 'editor' && <Edit2 className="h-3 w-3" />}
                            {m.role === 'viewer' && <Eye className="h-3 w-3" />}
                            <span className="capitalize">{m.role}</span>
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Databases */}
                <section>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4" />
                    Databases ({detailWorkspace.databaseIds.length})
                  </h4>
                  {detailWorkspace.databaseIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic px-2 py-3 border rounded-md text-center">
                      No databases linked to this workspace yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {detailWorkspace.databaseIds.map(id => {
                        const db = dbMap.get(id)
                        return (
                          <Link
                            key={id}
                            href={`/dashboard/studio/${id}`}
                            onClick={() => setDetailId(null)}
                            className="flex items-center gap-3 p-2.5 rounded-md border bg-card hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all group/db"
                          >
                            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shrink-0">
                              <Database className="h-4 w-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {db?.name ?? 'Unknown database'}
                              </p>
                              {db ? (
                                <p className="text-xs text-muted-foreground">
                                  {db.db_type} · {(db.row_count || 0).toLocaleString()} rows
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">Database no longer exists</p>
                              )}
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover/db:text-amber-600 group-hover/db:translate-x-0.5 transition-all shrink-0" />
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Activity timeline */}
                <section>
                  <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                    <Activity className="h-4 w-4" />
                    Recent Activity
                  </h4>
                  <div className="relative pl-6">
                    <div className="absolute left-2 top-1 bottom-1 w-px bg-gradient-to-b from-amber-500 via-red-500 to-transparent" />
                    {generateMockActivity(detailWorkspace).map(a => (
                      <div key={a.id} className="relative pb-4 last:pb-0">
                        <div className={`absolute -left-[18px] top-0.5 h-3 w-3 rounded-full bg-gradient-to-br ${getColor(detailWorkspace.color).gradient} ring-2 ring-background`} />
                        <p className="text-sm font-medium">{a.action}</p>
                        <p className="text-xs text-muted-foreground">{a.detail}</p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatRelative(a.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-4 w-4 text-destructive" />
              </div>
              Delete Workspace?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the workspace and remove all member associations.
              Linked databases will not be deleted — they remain in your Databases page.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Delete Workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
