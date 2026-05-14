'use client'

// Organization features have been rolled back for single-user mode.
// This hook is kept as a no-op stub to prevent import errors.

interface OrganizationContextType {
  currentOrganization: null
  organizations: never[]
  setCurrentOrganization: (_org: never) => void
  loading: boolean
}

const stubContext: OrganizationContextType = {
  currentOrganization: null,
  organizations: [],
  setCurrentOrganization: () => {},
  loading: false,
}

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  // No-op provider for backwards compatibility
  return <>{children}</>
}

export function useOrganization() {
  return stubContext
}
