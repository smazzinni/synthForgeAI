import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') || '/dashboard'

  if (code) {
    // Redirect to the next URL - the client-side AuthProvider
    // will handle the code exchange via the Supabase browser client
    const redirectUrl = new URL(next + (next.includes('?') ? '&' : '?') + 'code=' + code, request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // No code in URL - redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}
