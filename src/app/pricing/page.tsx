'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  CheckCircle2,
  ArrowRight,
  Zap,
  Rocket,
  Building2,
  Check,
  X,
  Minus,
  Shield,
  CreditCard,
  Clock,
} from 'lucide-react'

/* ────────────────────────────────────────────
   Plan data
   ──────────────────────────────────────────── */

interface Plan {
  name: string
  monthlyPrice: string
  annualPrice: string
  period: string
  annualPeriod: string
  description: string
  icon: React.ReactNode
  features: string[]
  cta: string
  popular: boolean
  href: string
}

const plans: Plan[] = [
  {
    name: 'Free',
    monthlyPrice: '$0',
    annualPrice: '$0',
    period: '/month',
    annualPeriod: '/month',
    description: 'Perfect for exploring synthetic data generation',
    icon: <Zap className="h-6 w-6 text-amber-500" />,
    features: ['3 databases', '1,000 rows per database', 'Basic schema generation', '1 AI Agent', 'JSON/CSV export', 'Community support'],
    cta: 'Get Started',
    popular: false,
    href: '/signup',
  },
  {
    name: 'Pro',
    monthlyPrice: '$19',
    annualPrice: '$15',
    period: '/month',
    annualPeriod: '/month (billed annually)',
    description: 'For teams building production applications',
    icon: <Rocket className="h-6 w-6 text-red-500" />,
    features: ['Unlimited databases', '100,000 rows per database', 'Advanced schema generation', '5 AI Agents', 'All export formats', '3 Live DB connections', 'Team collaboration', 'API access', 'Priority support'],
    cta: 'Start Free Trial',
    popular: true,
    href: '/signup',
  },
  {
    name: 'Enterprise',
    monthlyPrice: 'Custom',
    annualPrice: 'Custom',
    period: '',
    annualPeriod: '',
    description: 'For organizations with advanced needs',
    icon: <Building2 className="h-6 w-6 text-amber-700 dark:text-amber-400" />,
    features: ['Unlimited everything', 'Custom data generation', '5+ Custom AI Agents', 'Unlimited live connections', 'SSO/SAML', 'Custom integrations', 'Audit logs', 'Dedicated support', 'SLA guarantee'],
    cta: 'Contact Sales',
    popular: false,
    href: '/contact',
  },
]

/* ────────────────────────────────────────────
   Comparison table data
   ──────────────────────────────────────────── */

type CellValue = 'check' | 'cross' | 'dash' | string

interface ComparisonRow {
  feature: string
  free: CellValue
  pro: CellValue
  enterprise: CellValue
}

interface ComparisonCategory {
  category: string
  rows: ComparisonRow[]
}

const comparisonData: ComparisonCategory[] = [
  {
    category: 'Data Generation',
    rows: [
      { feature: 'Databases', free: '3', pro: 'Unlimited', enterprise: 'Unlimited' },
      { feature: 'Rows per DB', free: '1K', pro: '100K', enterprise: 'Unlimited' },
      { feature: 'Schema Generation', free: 'Basic', pro: 'Advanced', enterprise: 'Custom' },
      { feature: 'AI Agents', free: '1', pro: '5', enterprise: '5+ Custom' },
      { feature: 'Live DB Connections', free: '0', pro: '3', enterprise: 'Unlimited' },
    ],
  },
  {
    category: 'Export & Integration',
    rows: [
      { feature: 'JSON/CSV', free: 'check', pro: 'check', enterprise: 'check' },
      { feature: 'SQL Export', free: 'cross', pro: 'check', enterprise: 'check' },
      { feature: 'API Access', free: 'cross', pro: 'check', enterprise: 'check' },
      { feature: 'Webhooks', free: 'cross', pro: 'cross', enterprise: 'check' },
      { feature: 'Custom Integrations', free: 'cross', pro: 'cross', enterprise: 'check' },
    ],
  },
  {
    category: 'Collaboration',
    rows: [
      { feature: 'Team Members', free: '1', pro: '5', enterprise: 'Unlimited' },
      { feature: 'Workspaces', free: '1', pro: '3', enterprise: 'Unlimited' },
      { feature: 'Role-Based Access', free: 'cross', pro: 'check', enterprise: 'check' },
      { feature: 'Audit Logs', free: 'cross', pro: 'cross', enterprise: 'check' },
    ],
  },
  {
    category: 'Support',
    rows: [
      { feature: 'Community Forum', free: 'check', pro: 'check', enterprise: 'check' },
      { feature: 'Email Support', free: 'cross', pro: 'check', enterprise: 'check' },
      { feature: 'Priority Support', free: 'cross', pro: 'check', enterprise: 'check' },
      { feature: 'Dedicated Account Manager', free: 'cross', pro: 'cross', enterprise: 'check' },
      { feature: 'SLA', free: 'cross', pro: 'cross', enterprise: 'check' },
    ],
  },
]

/* ────────────────────────────────────────────
   FAQ data
   ──────────────────────────────────────────── */

const faqs = [
  {
    question: 'Can I switch plans anytime?',
    answer: 'Yes, you can upgrade or downgrade your plan at any time. When upgrading, you\'ll be prorated for the remainder of your billing cycle.',
  },
  {
    question: 'What happens if I exceed my row limit?',
    answer: 'You\'ll receive a notification when you reach 80% of your limit. You can upgrade your plan or wait for the next billing cycle.',
  },
  {
    question: 'Is there a free trial for Pro?',
    answer: 'Yes! Pro comes with a 14-day free trial. No credit card required.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Absolutely. You can cancel your subscription at any time. You\'ll retain access until the end of your billing period.',
  },
  {
    question: 'Do you offer discounts for startups?',
    answer: 'Yes! We offer 50% off Pro for the first year for eligible startups. Contact us to learn more.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards (Visa, Mastercard, Amex), PayPal, and wire transfer for Enterprise plans.',
  },
]

/* ────────────────────────────────────────────
   Cell renderer helper
   ──────────────────────────────────────────── */

function CellRenderer({ value }: { value: CellValue }) {
  if (value === 'check') {
    return <Check className="h-4 w-4 text-emerald-500 mx-auto" />
  }
  if (value === 'cross') {
    return <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
  }
  if (value === 'dash') {
    return <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />
  }
  return <span className="text-sm">{value}</span>
}

/* ────────────────────────────────────────────
   Main page
   ──────────────────────────────────────────── */

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero / Header ── */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <Badge variant="outline" className="mb-4">
                Pricing
              </Badge>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
                Simple,{' '}
                <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                  Transparent
                </span>{' '}
                Pricing
              </h1>
              <p className="text-muted-foreground text-lg">
                Start free, scale as you grow. No hidden fees, no surprises.
              </p>
            </div>

            {/* ── Billing toggle ── */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className={`text-sm font-medium transition-colors ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
                Monthly
              </span>
              <Switch
                checked={isAnnual}
                onCheckedChange={setIsAnnual}
                className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-amber-600 data-[state=checked]:to-red-600"
              />
              <span className={`text-sm font-medium transition-colors ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
                Annual
              </span>
              {isAnnual && (
                <Badge className="bg-gradient-to-r from-amber-600 to-red-600 text-white border-0 text-xs ml-1">
                  Save 20%
                </Badge>
              )}
            </div>

            {/* ── Trust badges ── */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                14-day free trial
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1.5">
                <CreditCard className="h-3.5 w-3.5 text-amber-600" />
                No credit card required
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-full px-3 py-1.5">
                <Shield className="h-3.5 w-3.5 text-amber-600" />
                Cancel anytime
              </div>
            </div>

            {/* ── Plan cards ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {plans.map((plan) => {
                const price = isAnnual ? plan.annualPrice : plan.monthlyPrice
                const period = isAnnual ? plan.annualPeriod : plan.period

                return (
                  <Card
                    key={plan.name}
                    className={`relative group transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
                      plan.popular
                        ? 'border-0 shadow-lg shadow-amber-500/10'
                        : 'border-border/50'
                    }`}
                  >
                    {/* Pro gradient top border */}
                    {plan.popular && (
                      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-to-r from-amber-600 to-red-600" />
                    )}

                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                        <Badge className="bg-gradient-to-r from-amber-600 to-red-600 text-white border-0">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <CardHeader className="text-center pb-2 pt-6">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/10 to-red-500/10 border border-amber-500/20">
                        {plan.icon}
                      </div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div className="mt-4 transition-all duration-300">
                        <span className="text-5xl font-bold tracking-tight">{price}</span>
                        {period && (
                          <span className="text-muted-foreground text-sm ml-1">{period}</span>
                        )}
                      </div>
                      <CardDescription className="mt-2">{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                        What&apos;s included:
                      </p>
                      <ul className="space-y-3 mb-6">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className={`w-full ${
                          plan.popular
                            ? 'bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white shadow-md'
                            : ''
                        }`}
                        variant={plan.popular ? 'default' : 'outline'}
                        asChild
                      >
                        <Link href={plan.href}>
                          {plan.cta}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </section>

        {/* ── Feature Comparison Table ── */}
        <section className="py-16 md:py-20 bg-muted/30">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Compare{' '}
                <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                  Features
                </span>
              </h2>
              <p className="text-muted-foreground">
                A detailed breakdown of what&apos;s included in each plan.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40%]">Feature</TableHead>
                    <TableHead className="text-center">Free</TableHead>
                    <TableHead className="text-center">
                      <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent font-bold">
                        Pro
                      </span>
                    </TableHead>
                    <TableHead className="text-center">Enterprise</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonData.map((category) => (
                    <CategoryRows key={category.category} category={category} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </section>

        {/* ── FAQ Section ── */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
                Frequently Asked{' '}
                <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                  Questions
                </span>
              </h2>
              <p className="text-muted-foreground">
                Everything you need to know about our pricing.
              </p>
            </div>

            <div className="max-w-2xl mx-auto">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        {/* ── CTA Banner ── */}
        <section className="py-16 md:py-20">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center rounded-2xl bg-gradient-to-r from-amber-600 to-red-600 p-10 md:p-14">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
                Ready to get started?
              </h2>
              <p className="text-white/80 mb-6 text-lg">
                Join thousands of developers generating synthetic data with SynthForge AI.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  className="bg-white text-amber-700 hover:bg-white/90 font-semibold"
                  asChild
                >
                  <Link href="/signup">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 bg-transparent"
                  asChild
                >
                  <Link href="/contact">Contact Sales</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   Category rows sub-component (separated to
   render the category header row cleanly)
   ──────────────────────────────────────────── */

function CategoryRows({ category }: { category: ComparisonCategory }) {
  return (
    <>
      {/* Category header row */}
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={4}
          className="bg-muted/60 font-bold text-sm uppercase tracking-wider text-foreground/80 pt-4 pb-2"
        >
          {category.category}
        </TableCell>
      </TableRow>
      {/* Feature rows */}
      {category.rows.map((row) => (
        <TableRow key={row.feature}>
          <TableCell className="font-medium text-sm">{row.feature}</TableCell>
          <TableCell className="text-center">
            <CellRenderer value={row.free} />
          </TableCell>
          <TableCell className="text-center">
            <CellRenderer value={row.pro} />
          </TableCell>
          <TableCell className="text-center">
            <CellRenderer value={row.enterprise} />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
