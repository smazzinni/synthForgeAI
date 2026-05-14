'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import type { Organization } from '@/lib/supabase/types'
import { mockOrganizations } from '@/lib/mock-data'

interface OrganizationContextType {
  currentOrganization: Organization | null
  organizations: Organization[]
  setCurrentOrganization: (org: Organization) => void
  loading: boolean
}

const OrganizationContext = createContext<OrganizationContextType | null>(null)

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrganizations()
  }, [])

  async function loadOrganizations() {
    try {
      const res = await fetch('/api/organizations')
      if (res.ok) {
        const data = await res.json()
        if (data.organizations && data.organizations.length > 0) {
          setOrganizations(data.organizations)
          setCurrentOrganization(data.organizations[0])
        } else {
          // Use mock data
          setOrganizations(mockOrganizations)
          setCurrentOrganization(mockOrganizations[0])
        }
      } else {
        // Use mock data on error
        setOrganizations(mockOrganizations)
        setCurrentOrganization(mockOrganizations[0])
      }
    } catch {
      setOrganizations(mockOrganizations)
      setCurrentOrganization(mockOrganizations[0])
    } finally {
      setLoading(false)
    }
  }

  return (
    <OrganizationContext.Provider
      value={{ currentOrganization, organizations, setCurrentOrganization, loading }}
    >
      {children}
    </OrganizationContext.Provider>
  )
}

export function useOrganization() {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider')
  }
  return context
}
