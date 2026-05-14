'use client'

import { useState } from 'react'
import { mockOrgMembers } from '@/lib/mock-data'

const roleColors: Record<string, string> = {
  owner: 'bg-amber-100 text-amber-700',
  admin: 'bg-sky-100 text-sky-700',
  member: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-gray-100 text-gray-700',
}

export default function OrganizationPage() {
  const [showInvite, setShowInvite] = useState(false)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Organization</h1>
          <p className="text-muted-foreground mt-1">Manage your organization and team members</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="mt-4 md:mt-0 py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700"
        >
          + Invite Member
        </button>
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1">Invite Team Member</h2>
            <p className="text-sm text-muted-foreground mb-4">Send an invitation to join your organization</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="inviteEmail" className="block text-sm font-medium mb-1">Email Address</label>
                <input id="inviteEmail" type="email" placeholder="colleague@example.com" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="inviteRole" className="block text-sm font-medium mb-1">Role</label>
                <select id="inviteRole" className="w-full h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowInvite(false)} className="py-2 px-4 rounded-md border text-sm">Cancel</button>
              <button onClick={() => setShowInvite(false)} className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">Send Invitation</button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold text-lg">
            O
          </div>
          <div>
            <h2 className="text-lg font-semibold">Demo Organization</h2>
            <p className="text-sm text-muted-foreground">Pro Plan · 3 members</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border">
        <div className="p-6 pb-0">
          <h2 className="text-lg font-semibold">Team Members</h2>
          <p className="text-sm text-muted-foreground">Manage who has access to your organization</p>
        </div>
        <div className="p-6">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-muted-foreground">
                <th className="pb-3 font-medium">Member</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium hidden md:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {mockOrgMembers.map((member) => (
                <tr key={member.id} className="border-b last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-amber-400 flex items-center justify-center text-white text-xs font-bold">
                        {member.full_name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{member.full_name}</p>
                        <p className="text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <span className={`text-xs px-2 py-1 rounded ${roleColors[member.role]}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-muted-foreground hidden md:table-cell">Jan 2026</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
