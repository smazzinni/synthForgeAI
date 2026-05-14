'use client'

import { use } from 'react'
import StudioPage from './page'

export default function StudioDatabasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <StudioPage />
}
