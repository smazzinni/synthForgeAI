'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Mail,
  MessageSquare,
  ArrowRight,
  Clock,
  CheckCircle2,
  ChevronDown,
  Users,
  Building2,
  Zap,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface FormErrors {
  name?: string
  email?: string
  message?: string
}

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    if (!form.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (form.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }
    if (!form.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email address'
    }
    if (!form.message.trim()) {
      newErrors.message = 'Message is required'
    } else if (form.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    // Clear error for this field when user starts typing
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      toast.error('Please fix the errors in the form')
      return
    }
    setSubmitting(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1200))
    setSubmitting(false)
    setSubmitted(true)
    toast.success('Message sent! We will get back to you within 24 hours.')
    setForm({ name: '', email: '', subject: '', message: '' })
    // Reset success state after 5 seconds so the user can send another message
    setTimeout(() => setSubmitted(false), 5000)
  }

  const contactCards = [
    {
      icon: Mail,
      title: 'Email Us',
      description: 'For general inquiries and support',
      value: 'hello@synthforge.ai',
      color: 'from-amber-500 to-orange-600',
      bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    },
    {
      icon: MessageSquare,
      title: 'Community',
      description: 'Join our Discord for discussions',
      value: 'discord.gg/synthforge',
      color: 'from-emerald-500 to-teal-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
    },
    {
      icon: Building2,
      title: 'Enterprise',
      description: 'For custom plans and SLAs',
      value: 'enterprise@synthforge.ai',
      color: 'from-violet-500 to-purple-600',
      bgColor: 'bg-violet-50 dark:bg-violet-950/20',
    },
  ]

  const faqs = [
    {
      question: 'How does synthetic data generation work?',
      answer: 'SynthForge AI uses a multi-agent pipeline where specialized AI agents collaborate: the Schema Architect designs the database structure, the Data Generator creates realistic rows, the Quality Analyst validates integrity, and the Privacy Officer ensures compliance. Simply describe what you need in natural language and the agents handle the rest.',
    },
    {
      question: 'Is the generated data safe to use?',
      answer: 'Yes. All generated data is fully synthetic — it contains no real PII. The Privacy Officer agent ensures GDPR, HIPAA, and CCPA compliance by design. The data is safe for development, testing, and analytics workflows.',
    },
    {
      question: 'Can I connect to my own database?',
      answer: 'Absolutely. You can connect to any PostgreSQL or MySQL database (including Supabase, RDS, and self-hosted instances). Once connected, the AI chat can perform CRUD operations directly on your live data — SELECT queries auto-execute, while mutations require confirmation.',
    },
    {
      question: 'What export formats are supported?',
      answer: 'You can export generated data in JSON, CSV, and SQL dump formats. SQL dumps include CREATE TABLE statements with proper column types and INSERT statements with correctly escaped values. Exports work for both synthetic data and data fetched from live database connections.',
    },
    {
      question: 'Do you offer enterprise plans?',
      answer: 'Yes. Enterprise plans include unlimited databases, custom data generation patterns, dedicated AI agents, SLA guarantees, SSO/SAML authentication, and custom integrations. Contact us at enterprise@synthforge.ai for a tailored quote.',
    },
    {
      question: 'How fast is data generation?',
      answer: 'Generation speed depends on the complexity and row count. A typical 5-table database with 50 rows per table completes in under 30 seconds. The streaming pipeline inserts rows in batches as they are generated, so you see progress in real time.',
    },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-background to-red-50 dark:from-amber-950/20 dark:via-background dark:to-red-950/20" />
        <div className="absolute top-10 right-10 h-72 w-72 rounded-full bg-amber-400/10 dark:bg-amber-500/5 blur-3xl animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="relative container mx-auto px-4 md:px-6 max-w-5xl py-16 md:py-24">
          <div className="text-center max-w-2xl mx-auto">
            <Badge variant="outline" className="mb-4">
              <Mail className="h-3 w-3 mr-1.5" />
              Contact
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
              Get in{' '}
              <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                touch
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Have questions about SynthForge AI? Want to learn more about enterprise plans?
              We would love to hear from you.
            </p>
            {/* Response time badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <Clock className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Average response time: under 24 hours
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Contact cards */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
            {contactCards.map((card) => (
              <Card key={card.title} className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
                <div className={`h-1 bg-gradient-to-r ${card.color}`} />
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform`}>
                      <card.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold mb-1">{card.title}</h3>
                      <p className="text-xs text-muted-foreground mb-2">{card.description}</p>
                      <p className="text-sm font-mono text-foreground truncate">{card.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Form + sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Form */}
            <div className="lg:col-span-3">
              <Card className="shadow-lg">
                <CardContent className="pt-6">
                  {submitted ? (
                    <div className="flex flex-col items-center text-center py-12">
                      <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">Message sent!</h3>
                      <p className="text-muted-foreground max-w-sm">
                        Thank you for reaching out. Our team will get back to you within 24 hours.
                      </p>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold mb-1">Send us a message</h2>
                      <p className="text-sm text-muted-foreground mb-6">Fill out the form below and we will respond as soon as possible.</p>
                      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">
                              Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="name"
                              placeholder="Your name"
                              value={form.name}
                              onChange={(e) => handleChange('name', e.target.value)}
                              aria-invalid={!!errors.name}
                              className={errors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
                            />
                            {errors.name && (
                              <p className="text-xs text-destructive flex items-center gap-1">
                                <span className="h-3 w-3 rounded-full bg-destructive" />
                                {errors.name}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">
                              Email <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="you@example.com"
                              value={form.email}
                              onChange={(e) => handleChange('email', e.target.value)}
                              aria-invalid={!!errors.email}
                              className={errors.email ? 'border-destructive focus-visible:ring-destructive' : ''}
                            />
                            {errors.email && (
                              <p className="text-xs text-destructive flex items-center gap-1">
                                <span className="h-3 w-3 rounded-full bg-destructive" />
                                {errors.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="subject">Subject</Label>
                          <Input
                            id="subject"
                            placeholder="What is this about?"
                            value={form.subject}
                            onChange={(e) => handleChange('subject', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="message">
                            Message <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id="message"
                            placeholder="How can we help? (min 10 characters)"
                            rows={5}
                            value={form.message}
                            onChange={(e) => handleChange('message', e.target.value)}
                            aria-invalid={!!errors.message}
                            className={errors.message ? 'border-destructive focus-visible:ring-destructive' : ''}
                          />
                          <div className="flex items-center justify-between">
                            {errors.message ? (
                              <p className="text-xs text-destructive flex items-center gap-1">
                                <span className="h-3 w-3 rounded-full bg-destructive" />
                                {errors.message}
                              </p>
                            ) : (
                              <span />
                            )}
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {form.message.length} characters
                            </span>
                          </div>
                        </div>
                        <Button
                          type="submit"
                          disabled={submitting}
                          className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-11"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              Send Message
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </form>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar stats */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="bg-gradient-to-br from-amber-50/50 to-red-50/50 dark:from-amber-950/20 dark:to-red-950/20 border-amber-200/50 dark:border-amber-800/30">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="font-semibold">Trusted by developers</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">10K+</div>
                      <div className="text-xs text-muted-foreground">Active users</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">99.5%</div>
                      <div className="text-xs text-muted-foreground">Uptime</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">10M+</div>
                      <div className="text-xs text-muted-foreground">Rows generated</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">24h</div>
                      <div className="text-xs text-muted-foreground">Avg response</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <h3 className="font-semibold">Need instant help?</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Check out the AI Studio — our assistant can answer most questions in real time.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/dashboard/studio">
                      Open AI Studio
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4">FAQ</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground text-lg">
              Quick answers to the most common questions about SynthForge AI.
            </p>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, idx) => (
              <AccordionItem key={idx} value={`item-${idx}`} className="rounded-lg border bg-card px-4 shadow-sm">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-4">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Still have questions? */}
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-4">Still have questions?</p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href="/dashboard/studio">
                Ask the AI Assistant
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-auto"><Footer /></div>
    </div>
  )
}
