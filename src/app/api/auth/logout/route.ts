import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient()
    await supabase.auth.signOut()
  } catch {
    // Continue even if server signOut fails
  }
  return NextResponse.json({ message: 'Logged out successfully' })
}
