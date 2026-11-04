'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const btn = 'bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white'

async function api(method: string, path: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return null
    const data = await res.json().catch(() => ({}))
    return typeof data.error === 'string' ? data.error : 'Request failed'
  } catch {
    return 'Network error'
  }
}

function DemoNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Demo mode: authentication is disabled on this server, so account actions are unavailable.
    </p>
  )
}

export function ProfileCard() {
  const { user, authRequired, refresh } = useAuth()
  const demo = !authRequired && !user
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)
  const display = user?.name || user?.email?.split('@')[0] || 'User'
  const initials = display.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  const save = async () => {
    setSaving(true)
    const err = await api('PATCH', '/api/auth/user', { name })
    setSaving(false)
    if (err) return toast.error(err)
    await refresh()
    toast.success('Profile updated')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>Update your account profile details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-gradient-to-br from-amber-500 to-red-600 text-white text-lg">
              {demo ? 'D' : initials || 'U'}
            </AvatarFallback>
          </Avatar>
          <p className="font-medium">{demo ? 'Demo mode' : display}</p>
        </div>
        <Separator />
        {demo ? <DemoNote /> : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Display name</Label>
                <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={user?.email ?? ''} disabled readOnly />
                <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
              </div>
            </div>
            <Button onClick={save} disabled={saving} className={btn}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function SecurityCards() {
  const { user, authRequired, signOut } = useAuth()
  const demo = !authRequired && !user
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [delPassword, setDelPassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (demo) {
    return (
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent><DemoNote /></CardContent>
      </Card>
    )
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return toast.error('New password must be at least 8 characters')
    if (next !== confirm) return toast.error('Passwords do not match')
    setBusy(true)
    const err = await api('PATCH', '/api/auth/user', { currentPassword: current, newPassword: next })
    setBusy(false)
    if (err) return toast.error(err)
    setCurrent(''); setNext(''); setConfirm('')
    toast.success('Password updated. Other devices were signed out.')
  }

  const signOutAll = async () => {
    const err = await api('POST', '/api/auth/logout?all=1')
    if (err) return toast.error(err)
    window.location.href = '/login'
  }

  const deleteAccount = async () => {
    setDeleting(true)
    const err = await api('DELETE', '/api/auth/user', { password: delPassword })
    if (err) {
      setDeleting(false)
      return toast.error(err)
    }
    window.location.href = '/signup'
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password to keep your account secure</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input id="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input id="confirmPassword" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy} className={btn}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Sign out everywhere you are currently signed in</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={signOut}>Sign out</Button>
          <Button variant="outline" onClick={signOutAll}>Sign out of all devices</Button>
        </CardContent>
      </Card>

      <Card className="border-red-300 dark:border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-600 dark:text-red-400">Delete account</CardTitle>
          <CardDescription>Permanently deletes your account and all your data.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog onOpenChange={(o) => !o && setDelPassword('')}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete account</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone. Enter your password to confirm.</AlertDialogDescription>
              </AlertDialogHeader>
              <Input type="password" placeholder="Password" autoComplete="current-password" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} />
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={!delPassword || deleting}
                  onClick={(e) => { e.preventDefault(); void deleteAccount() }}
                >
                  {deleting ? 'Deleting...' : 'Delete account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
