'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Zap,
  Database,
  Shield,
  Brain,
  Users,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Layers,
  Lock,
  Workflow,
  ChevronRight,
} from 'lucide-react'

const features = [
  {
    icon: Brain,
    title: 'AI Data Generation',
    description:
      'Leverage multi-agent AI to generate realistic synthetic data. Describe your needs in natural language and watch as specialized agents collaboratively build your dataset.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: Layers,
    title: 'Schema Design',
    description:
      'Automatically generate and refine database schemas with AI assistance. Support for complex relationships, constraints, and multiple database dialects out of the box.',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    icon: Shield,
    title: 'Quality Assurance',
    description:
      'Built-in quality scoring, PII detection, and data validation ensure your synthetic data meets the highest standards of realism and compliance.',
    color: 'from-sky-500 to-cyan-600',
  },
  {
    icon: Workflow,
    title: 'Multi-Agent Pipeline',
    description:
      'Specialized AI agents work in concert: Discovery agents understand requirements, Schema agents design structures, and Generation agents create data — all autonomously.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: Users,
    title: 'Team Collaboration',
    description:
      'Multi-tenant workspaces with role-based access control. Share projects, review generated data, and collaborate on schema design across your organization.',
    color: 'from-rose-500 to-pink-600',
  },
  {
    icon: Lock,
    title: 'Privacy-First',
    description:
      'Generate fully synthetic data that contains no real PII. Compliant with GDPR, HIPAA, and CCPA regulations by design. Safe for development, testing, and analytics.',
    color: 'from-red-500 to-rose-600',
  },
]

const steps = [
  {
    step: '01',
    title: 'Describe Your Data',
    description:
      'Tell our AI agents what data you need in plain English. Specify tables, relationships, constraints, and data characteristics through a natural conversation.',
  },
  {
    step: '02',
    title: 'AI Generates Schema & Data',
    description:
      'Our multi-agent pipeline designs the optimal schema, generates realistic data, validates quality, and ensures privacy compliance — all in real time.',
  },
  {
    step: '03',
    title: 'Export & Integrate',
    description:
      'Download your synthetic data in JSON, CSV, SQL, or connect directly via API. Integrate seamlessly into your development, testing, or analytics workflows.',
  },
]

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Perfect for exploring synthetic data generation',
    features: ['3 databases', '1,000 rows per database', 'Basic schema generation', 'JSON/CSV export', 'Community support'],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For teams building production applications',
    features: ['Unlimited databases', '100,000 rows per database', 'Multi-agent pipeline', 'All export formats', 'Priority support', 'Team collaboration', 'API access'],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with advanced needs',
    features: ['Unlimited everything', 'Custom data generation', 'Dedicated AI agents', 'SLA guarantee', 'SSO/SAML', 'Custom integrations', 'Dedicated support'],
    cta: 'Contact Sales',
    popular: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-background to-red-50 dark:from-amber-950/20 dark:via-background dark:to-red-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-200/20 via-transparent to-transparent dark:from-amber-900/10" />
        <div className="relative container mx-auto px-4 md:px-6 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm font-medium">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              AI-Powered Synthetic Data Generation
            </Badge>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Generate Realistic{' '}
              <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                Synthetic Data
              </span>{' '}
              from Scratch
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Describe what you need in natural language. Our multi-agent AI pipeline designs schemas,
              generates data, validates quality, and ensures privacy compliance — automatically.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-12 px-8 text-base"
              >
                <Link href="/signup">
                  Start Generating Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8 text-base">
                <Link href="/about">Learn More</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
              {[
                { value: '10M+', label: 'Rows Generated' },
                { value: '99.5%', label: 'Quality Score' },
                { value: '<30s', label: 'Generation Time' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl md:text-3xl font-bold">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">Features</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Everything You Need for Synthetic Data
            </h2>
            <p className="text-muted-foreground text-lg">
              A comprehensive platform that handles every aspect of synthetic data generation, from schema design to quality assurance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="group hover:shadow-lg transition-all duration-300 border-border/50">
                <CardHeader>
                  <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">How It Works</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              From Description to Data in Minutes
            </h2>
            <p className="text-muted-foreground text-lg">
              Three simple steps to generate production-quality synthetic data for any use case.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {steps.map((step) => (
              <div key={step.step} className="relative text-center">
                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center mx-auto mb-6 text-white font-bold text-xl">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                {step.step !== '03' && (
                  <div className="hidden md:block absolute top-8 -right-4 w-8">
                    <ChevronRight className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">Pricing</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-muted-foreground text-lg">
              Start free, scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative ${
                  plan.popular
                    ? 'border-amber-500 border-2 shadow-lg shadow-amber-500/10'
                    : 'border-border/50'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-amber-600 to-red-600 text-white border-0">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <CardDescription className="mt-2">{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
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
                        ? 'bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white'
                        : ''
                    }`}
                    variant={plan.popular ? 'default' : 'outline'}
                    asChild
                  >
                    <Link href="/signup">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center rounded-2xl bg-gradient-to-br from-amber-500/10 via-red-500/5 to-amber-500/10 dark:from-amber-500/5 dark:via-red-500/2 dark:to-amber-500/5 p-12 border border-amber-200/50 dark:border-amber-800/30">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Ready to Generate Synthetic Data?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Join thousands of developers who use SynthForge AI to generate privacy-safe, production-quality data in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                asChild
                className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-12 px-8"
              >
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-12 px-8">
                <Link href="/contact">Talk to Sales</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-auto">
        <Footer />
      </div>
    </div>
  )
}
