import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[Health] Database connection failed:', error)
    return NextResponse.json({ status: 'error', message: 'Database connection failed' }, { status: 503 })
  }
}
