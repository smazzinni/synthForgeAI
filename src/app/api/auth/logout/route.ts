import { NextResponse } from 'next/server'

// Lightweight logout — just return success.
// The client-side AuthProvider handles the actual signOut via the browser Supabase client.
// This avoids creating heavy Supabase SSR server clients on every logout request.
export async function POST() {
  return NextResponse.json({ message: 'Logged out successfully' })
}
