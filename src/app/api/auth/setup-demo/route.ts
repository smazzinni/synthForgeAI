import { NextResponse } from 'next/server'

export async function POST() {
  // In production, this would create a user in Supabase Auth
  // and set up the organization and workspace.
  // For demo/dev mode, we return mock credentials.

  return NextResponse.json({
    success: true,
    message: 'Demo mode active. Use these credentials to sign in:',
    credentials: {
      email: 'demo@synthforge.ai',
      password: 'demo123456',
    },
    note: 'In production, run the SQL migration in supabase-schema.sql first, then this endpoint will create real users and organizations.',
  })
}
