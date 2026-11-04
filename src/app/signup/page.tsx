'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuth, safeNext } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SignUpPage() {
  const { signUp, user, loading: authLoading } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // If user is already authenticated, redirect to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      window.location.href = safeNext(new URLSearchParams(window.location.search).get('next'))
    }
  }, [user, authLoading])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    try {
      const { error } = await signUp(email, password, fullName)
      if (error) {
        setError(error.message)
        setLoading(false)
      }
      // On success the user state updates and the effect above redirects.
    } catch {
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
  }

  // Don't render the form if already authenticated
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    )
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
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Start generating synthetic data in minutes</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name (optional)</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex-1 flex gap-1">
                    {[0, 1, 2].map((i) => {
                      const strength = password.length >= 12 ? 3 : password.length >= 10 ? 2 : password.length >= 8 ? 1 : 0
                      const colors = ['bg-muted', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500']
                      return <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < strength ? colors[strength] : 'bg-muted'}`} />
                    })}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {password.length < 8 ? 'Too short' : password.length >= 10 ? 'Strong' : password.length >= 8 ? 'Good' : 'Weak'}
                  </span>
                </div>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-11"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-amber-600 hover:text-amber-700 font-medium">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
