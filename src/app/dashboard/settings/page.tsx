'use client'

import { useState } from 'react'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const [showPassword, setShowPassword] = useState(false)

  const tabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'preferences', label: 'Preferences' },
  ]

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings and preferences</p>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-amber-600 text-amber-600'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="rounded-lg border p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Profile Information</h2>
            <p className="text-sm text-muted-foreground">Update your account profile details</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-amber-500 flex items-center justify-center text-white text-xl font-bold">
              DU
            </div>
            <div>
              <button className="py-1.5 px-3 rounded-md border text-sm">Change Avatar</button>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG or GIF. Max 2MB.</p>
            </div>
          </div>
          <hr />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium mb-1">Full Name</label>
              <input id="fullName" defaultValue="Demo User" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
              <input id="email" type="email" defaultValue="demo@synthforge.ai" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
            </div>
          </div>
          <button className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">
            Save Changes
          </button>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="rounded-lg border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Change Password</h2>
            <p className="text-sm text-muted-foreground">Update your password to keep your account secure</p>
          </div>
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">Current Password</label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showPassword ? 'text' : 'password'}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm pr-16"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium mb-1">New Password</label>
            <input id="newPassword" type="password" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">Confirm New Password</label>
            <input id="confirmPassword" type="password" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
          </div>
          <button className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">
            Update Password
          </button>
        </div>
      )}

      {activeTab === 'preferences' && (
        <div className="rounded-lg border p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Preferences</h2>
            <p className="text-sm text-muted-foreground">Customize your experience</p>
          </div>
          <div>
            <p className="text-sm font-medium">Default Agent Mode</p>
            <p className="text-sm text-muted-foreground">Choose how the AI agents interact with you</p>
          </div>
          <button className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">
            Save Preferences
          </button>
        </div>
      )}
    </div>
  )
}
