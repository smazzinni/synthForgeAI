'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, MessageSquare, Zap, BookOpen, Database, Bell, Palette, HardDrive, AlertTriangle, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

const STORAGE_KEY = 'synthforge_preferences'

const defaultPreferences = {
  agentMode: 'interactive' as const,
  sqlDialect: 'postgresql' as const,
  defaultRowCount: '25' as const,
  includePIIDetection: true,
  autoValidateQuality: true,
  emailNotifications: false,
  generationCompleteAlerts: true,
  weeklyUsageSummary: false,
  compactMode: false,
  showLineNumbers: true,
  autoSaveDatabases: true,
}

type Preferences = typeof defaultPreferences

function loadPreferences(): Preferences {
  if (typeof window === 'undefined') return defaultPreferences
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return { ...defaultPreferences, ...JSON.parse(stored) }
  } catch {}
  return defaultPreferences
}

export default function SettingsPage() {
  const { user } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prefSaving, setPrefSaving] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)

  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
  }

  const handleSavePreferences = async () => {
    setPrefSaving(true)
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
      toast.success('Preferences saved successfully')
    } catch {
      toast.error('Failed to save preferences')
    } finally {
      setPrefSaving(false)
    }
  }

  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'
  const userEmail = user?.email || ''
  const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      // TODO: Update profile via Supabase
      await new Promise(resolve => setTimeout(resolve, 500))
      toast.success('Profile updated successfully')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your account profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-gradient-to-br from-amber-500 to-red-600 text-white text-lg">
                    {userInitials || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm">Change Avatar</Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG or GIF. Max 2MB.</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" defaultValue={userName} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" defaultValue={userEmail} disabled />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                </div>
              </div>

              <Button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPassword ? 'text' : 'password'}
                    className="pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input id="newPassword" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input id="confirmPassword" type="password" />
              </div>
              <Button className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
                Update Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preferences" className="space-y-6">
          {/* Default Agent Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-amber-600" />
                Default Agent Mode
              </CardTitle>
              <CardDescription>Choose how the AI agents interact with you</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={preferences.agentMode}
                onValueChange={(value) => updatePref('agentMode', value as Preferences['agentMode'])}
                className="grid gap-3"
              >
                <Label
                  htmlFor="mode-interactive"
                  className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/50 transition-colors has-[[data-state=checked]]:border-amber-500 has-[[data-state=checked]]:bg-amber-50 dark:has-[[data-state=checked]]:bg-amber-950/20"
                >
                  <RadioGroupItem value="interactive" id="mode-interactive" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-600" />
                      <span className="font-medium">Interactive</span>
                      <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">Default</span>
                    </div>
                    <p className="text-sm text-muted-foreground">AI asks for confirmation before executing changes</p>
                  </div>
                </Label>
                <Label
                  htmlFor="mode-auto-execute"
                  className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/50 transition-colors has-[[data-state=checked]]:border-amber-500 has-[[data-state=checked]]:bg-amber-50 dark:has-[[data-state=checked]]:bg-amber-950/20"
                >
                  <RadioGroupItem value="auto-execute" id="mode-auto-execute" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-red-500" />
                      <span className="font-medium">Auto-execute</span>
                    </div>
                    <p className="text-sm text-muted-foreground">AI executes changes automatically without confirmation</p>
                  </div>
                </Label>
                <Label
                  htmlFor="mode-guided"
                  className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/50 transition-colors has-[[data-state=checked]]:border-amber-500 has-[[data-state=checked]]:bg-amber-50 dark:has-[[data-state=checked]]:bg-amber-950/20"
                >
                  <RadioGroupItem value="guided" id="mode-guided" className="mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-emerald-600" />
                      <span className="font-medium">Guided</span>
                    </div>
                    <p className="text-sm text-muted-foreground">AI explains each step and waits for your approval</p>
                  </div>
                </Label>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Default SQL Dialect */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-amber-600" />
                Default SQL Dialect
              </CardTitle>
              <CardDescription>Choose the default SQL dialect for generated schemas</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={preferences.sqlDialect}
                onValueChange={(value) => updatePref('sqlDialect', value as Preferences['sqlDialect'])}
              >
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Select dialect" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postgresql">PostgreSQL</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="sqlite">SQLite</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Data Generation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-amber-600" />
                Data Generation
              </CardTitle>
              <CardDescription>Configure how synthetic data is generated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Default Row Count</Label>
                <Select
                  value={preferences.defaultRowCount}
                  onValueChange={(value) => updatePref('defaultRowCount', value as Preferences['defaultRowCount'])}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Select count" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 rows</SelectItem>
                    <SelectItem value="25">25 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                    <SelectItem value="500">500 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Include PII Detection</Label>
                  <p className="text-sm text-muted-foreground">Detect and flag personally identifiable information</p>
                </div>
                <Switch
                  checked={preferences.includePIIDetection}
                  onCheckedChange={(checked) => updatePref('includePIIDetection', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-validate Quality</Label>
                  <p className="text-sm text-muted-foreground">Automatically validate generated data quality</p>
                </div>
                <Switch
                  checked={preferences.autoValidateQuality}
                  onCheckedChange={(checked) => updatePref('autoValidateQuality', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-600" />
                Notifications
              </CardTitle>
              <CardDescription>Choose what notifications you receive</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive email updates about your account</p>
                </div>
                <Switch
                  checked={preferences.emailNotifications}
                  onCheckedChange={(checked) => updatePref('emailNotifications', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Generation complete alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified when data generation finishes</p>
                </div>
                <Switch
                  checked={preferences.generationCompleteAlerts}
                  onCheckedChange={(checked) => updatePref('generationCompleteAlerts', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly usage summary</Label>
                  <p className="text-sm text-muted-foreground">Receive a weekly summary of your usage</p>
                </div>
                <Switch
                  checked={preferences.weeklyUsageSummary}
                  onCheckedChange={(checked) => updatePref('weeklyUsageSummary', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-amber-600" />
                Appearance
              </CardTitle>
              <CardDescription>Customize the look and feel of the interface</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Compact mode</Label>
                  <p className="text-sm text-muted-foreground">Reduce padding and spacing throughout the UI</p>
                </div>
                <Switch
                  checked={preferences.compactMode}
                  onCheckedChange={(checked) => updatePref('compactMode', checked)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Show line numbers in SQL editor</Label>
                  <p className="text-sm text-muted-foreground">Display line numbers alongside SQL code</p>
                </div>
                <Switch
                  checked={preferences.showLineNumbers}
                  onCheckedChange={(checked) => updatePref('showLineNumbers', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Data Persistence */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-amber-600" />
                Data Persistence
              </CardTitle>
              <CardDescription>Manage how your data is saved</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-save databases</Label>
                  <p className="text-sm text-muted-foreground">Automatically save generated databases to your account</p>
                </div>
                <Switch
                  checked={preferences.autoSaveDatabases}
                  onCheckedChange={(checked) => updatePref('autoSaveDatabases', checked)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-300 dark:border-red-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>These actions are irreversible. Please be certain.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/20"
                  onClick={() => toast.error('This action is not available in demo mode')}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All Data
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      const data = JSON.stringify(preferences, null, 2)
                      const blob = new Blob([data], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'synthforge-preferences.json'
                      a.click()
                      URL.revokeObjectURL(url)
                      toast.success('Preferences exported successfully')
                    } catch {
                      toast.error('Failed to export data')
                    }
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export All Data
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSavePreferences}
              disabled={prefSaving}
              className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              {prefSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Preferences
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
