'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Zap, Mail, Lock, UserPlus, AlertCircle, Loader2 } from 'lucide-react'

interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<void>
  onSwitchToRegister: () => void
  isLoading: boolean
  error: string | null
}

export function LoginForm({ onLogin, onSwitchToRegister, isLoading, error }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onLogin(email, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-red-50 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">SynthForge AI</span>
          </div>
          <p className="text-muted-foreground text-sm">AI-Powered Synthetic Data Generation</p>
        </div>

        <Card className="shadow-lg border-0 shadow-amber-100/50">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in to your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="text-amber-700 hover:text-amber-800 font-medium underline underline-offset-2"
                  disabled={isLoading}
                >
                  Create one
                </button>
              </div>

              {/* Demo credentials hint */}
              <div className="mt-4 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs">
                <p className="font-medium mb-1">Demo Credentials</p>
                <p>Email: demo@synthforge.ai</p>
                <p>Password: Demo@1234</p>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
