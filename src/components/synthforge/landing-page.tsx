'use client'

import React from 'react'
import { motion } from 'framer-motion'
import {
  Database, MessageSquare, Plus, ArrowRight, Zap, Sparkles, Shield,
  Download, Eye, Wand2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { gradientStyle, staggerContainer, staggerItem } from './constants'
import type { View } from './types'

interface LandingPageProps {
  onNavigate: (view: View) => void
}

export const LandingPage = React.memo(function LandingPage({ onNavigate }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white overflow-x-hidden">
      <style>{gradientStyle}</style>
      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">SynthForge AI</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm text-muted-foreground">
            <button className="hover:text-foreground transition-colors">Features</button>
            <button className="hover:text-foreground transition-colors">Pricing</button>
            <button className="hover:text-foreground transition-colors">Docs</button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => onNavigate('dashboard')}>
              Dashboard
            </Button>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button size="sm" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white" onClick={() => onNavigate('dashboard')}>
                Get Started Free
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.nav>

      {/* Hero */}
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: 'linear-gradient(135deg, #f59e0b15, #ef444415, #f59e0b15, #8b5cf615)',
              backgroundSize: '400% 400%',
              animation: 'gradientShift 15s ease infinite'
            }}
          />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-32">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Badge className="mb-4 bg-amber-100 text-amber-800 border-amber-200">
                  <Sparkles className="h-3 w-3 mr-1" /> AI-Powered Synthetic Data
                </Badge>
                <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
                  Generate <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-red-700">Realistic Data</span> in Seconds
                </h1>
                <p className="text-base sm:text-lg text-muted-foreground mb-8 leading-relaxed max-w-xl">
                  Create privacy-safe, relationally intact synthetic data from scratch.
                  Just describe what you need and our multi-agent AI generates statistically accurate datasets instantly.
                </p>
                <div className="flex flex-wrap gap-3 mb-8">
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" className="bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white text-base px-8" onClick={() => onNavigate('dashboard')}>
                      Start Generating <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </motion.div>
                  <Button size="lg" variant="outline" className="text-base" onClick={() => onNavigate('dashboard')}>
                    Try Demo
                  </Button>
                </div>
                <div className="flex gap-6 sm:gap-8">
                  {[
                    { value: '10M+', label: 'Rows Generated' },
                    { value: '99.2%', label: 'FK Integrity' },
                    { value: '<3s', label: 'Avg Gen Time' }
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <p className="text-2xl font-bold text-amber-700">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 30, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="relative hidden sm:block"
              >
                <Card className="shadow-2xl border-0 bg-white">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-red-400" />
                      <div className="h-3 w-3 rounded-full bg-amber-400" />
                      <div className="h-3 w-3 rounded-full bg-green-400" />
                      <span className="ml-2 text-xs text-muted-foreground font-mono">SynthForge AI Studio</span>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-sm">
                      <span className="text-amber-700 font-medium">You:</span> Generate 25 rows of sample data with relationships
                    </div>
                    <div className="bg-primary/5 rounded-lg p-3 text-sm space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-primary font-medium">SynthForge:</span>
                        <Badge className="text-[10px] bg-amber-100 text-amber-800 border-amber-200"><Wand2 className="h-2.5 w-2.5 mr-0.5" /> auto-agent</Badge>
                      </div>
                      <p className="text-muted-foreground">I&apos;ll design a schema and generate realistic synthetic data based on your request.</p>
                      <div className="bg-white rounded border p-2 font-mono text-xs overflow-hidden">
                        <p className="text-green-700">-- Tables generated dynamically</p>
                        <p className="text-muted-foreground">table_1 (25 rows) | table_2 (25 rows)</p>
                        <p className="text-amber-700 mt-1">-- Referential integrity: OK</p>
                        <p className="text-amber-700">-- PII check: All synthetic</p>
                        <p className="text-sky-700">-- Quality score: 94/100</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 bg-slate-50/50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <Badge variant="outline" className="mb-4">Core Features</Badge>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Everything You Need for Synthetic Data</h2>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">From schema definition to export, SynthForge AI handles the entire synthetic data lifecycle.</p>
          </motion.div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {[
              { icon: Sparkles, title: 'AI-Powered Generation', desc: 'Describe data in natural language. Multi-agent AI generates realistic, domain-specific synthetic data instantly.', color: 'from-amber-100 to-amber-50' },
              { icon: Shield, title: 'Privacy-First', desc: 'Automatic PII detection and masking. All generated data is privacy-safe by design with quality scoring.', color: 'from-emerald-100 to-emerald-50' },
              { icon: Download, title: 'Multi-Format Export', desc: 'Export as JSON, CSV, SQL INSERT, or full SQL dump with CREATE TABLE statements. Copy to clipboard.', color: 'from-sky-100 to-sky-50' },
              { icon: Eye, title: 'Real-time Preview', desc: 'Instantly preview generated data with column type highlighting, FK indicators, and pagination.', color: 'from-purple-100 to-purple-50' }
            ].map((feature, i) => (
              <motion.div key={i} variants={staggerItem} whileHover={{ y: -4, transition: { duration: 0.2 } }}>
                <Card className="hover:shadow-lg transition-shadow h-full group">
                  <CardContent className="pt-6">
                    <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                      <feature.icon className="h-5 w-5 text-foreground" />
                    </div>
                    <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* How it works */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground text-base sm:text-lg">Three steps from idea to data</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Describe', desc: 'Tell the AI what data you need in natural language, or upload a schema file.', icon: MessageSquare },
              { step: '2', title: 'Generate', desc: 'Our multi-agent AI plans the schema, generates realistic data, and validates integrity.', icon: Wand2 },
              { step: '3', title: 'Export', desc: 'Preview the data, refine it with chat, and export in your preferred format.', icon: Download }
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="text-center"
              >
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg mb-2 flex items-center justify-center gap-2">
                  <item.icon className="h-5 w-5 text-amber-700" />
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-amber-600 to-red-700 py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Ready to Generate Synthetic Data?</h2>
            <p className="text-white/80 text-base sm:text-lg mb-8 max-w-xl mx-auto">Start creating privacy-safe, realistic synthetic data in seconds. No credit card required.</p>
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                size="lg"
                className="bg-white text-amber-700 hover:bg-white/90 text-base px-8 font-semibold"
                onClick={() => onNavigate('dashboard')}
              >
                Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-medium">SynthForge AI</span>
          </div>
          <p className="text-xs text-muted-foreground">Privacy-safe synthetic data generation</p>
        </div>
      </footer>
    </div>
  )
})
