'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await resetPassword(email)
      if (error) {
        setError(error.message)
      } else {
        setSuccess(true)
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-amber-50 via-background to-red-50 dark:from-amber-950/20 dark:via-background dark:to-red-950/20 p-4">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <span className="text-2xl font-bold">SynthForge<span className="text-amber-600">AI</span></span>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {success
              ? 'Check your email for the reset link'
              : 'Enter your email and we\'ll send you a reset link'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <p className="text-muted-foreground">
                If an account exists with {email}, you&apos;ll receive a password reset link shortly.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sign In
                </Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
