'use client'

import { useState } from 'react'
import { mockWorkspaces, mockProjects } from '@/lib/mock-data'

export default function WorkspacesPage() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Workspaces</h1>
          <p className="text-muted-foreground mt-1">Manage your workspaces and projects</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="mt-4 md:mt-0 py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700"
        >
          + New Workspace
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1">Create Workspace</h2>
            <p className="text-sm text-muted-foreground mb-4">Organize your projects within a workspace</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">Workspace Name</label>
                <input id="name" placeholder="My Workspace" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
                <input id="description" placeholder="Optional description" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="py-2 px-4 rounded-md border text-sm">Cancel</button>
              <button onClick={() => setShowCreate(false)} className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">Create</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {mockWorkspaces.map((ws) => (
          <div key={ws.id} className="rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold">
                  {ws.name[0]}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{ws.name}</h2>
                  <p className="text-sm text-muted-foreground">{ws.description}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {mockProjects.map((project) => (
                <div key={project.id} className="rounded-lg border p-4 hover:shadow-sm transition-shadow cursor-pointer">
                  <h3 className="font-medium text-sm mb-1">{project.name}</h3>
                  <p className="text-xs text-muted-foreground mb-2">{project.description}</p>
                  <p className="text-xs text-muted-foreground">Updated recently</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
