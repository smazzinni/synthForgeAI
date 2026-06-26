'use client'

import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Zap,
  Brain,
  Shield,
  Workflow,
  ArrowRight,
  Code2,
  Users,
  BarChart3,
  Clock,
  Heart,
  Rocket,
  GitBranch,
  Paintbrush,
  Sparkles,
  Globe,
  Scale,
  Terminal,
  Database,
  Layers,
  FileCode2,
  Cpu,
  Milestone,
} from 'lucide-react'

const stats = [
  { value: '10M+', label: 'Rows Generated', icon: Database, color: 'from-amber-500 to-orange-600' },
  { value: '5,000+', label: 'Active Users', icon: Users, color: 'from-orange-500 to-red-600' },
  { value: '99.5%', label: 'Quality Score', icon: BarChart3, color: 'from-red-500 to-rose-600' },
  { value: '<30s', label: 'Avg Generation Time', icon: Clock, color: 'from-rose-500 to-amber-600' },
]

const values = [
  {
    icon: Brain,
    title: 'AI-First',
    description: 'We believe synthetic data generation should be intelligent, automated, and accessible to everyone through natural language interfaces.',
    color: 'from-amber-500 to-orange-600',
  },
  {
    icon: Shield,
    title: 'Privacy by Design',
    description: 'Every feature we build starts with privacy in mind. Our synthetic data contains zero real PII, ensuring compliance by default.',
    color: 'from-orange-500 to-red-600',
  },
  {
    icon: Workflow,
    title: 'Developer Experience',
    description: 'From API design to UI interactions, we obsess over making the developer experience smooth, intuitive, and productive.',
    color: 'from-red-500 to-rose-600',
  },
  {
    icon: Code2,
    title: 'Open Source Advocate',
    description: 'We believe in transparency. Our core pipeline is open for inspection, so you always know how your data is generated.',
    color: 'from-rose-500 to-pink-600',
  },
  {
    icon: Scale,
    title: 'Scalability',
    description: 'From a single developer to enterprise teams, SynthForge scales seamlessly with your needs.',
    color: 'from-amber-600 to-red-600',
  },
  {
    icon: Heart,
    title: 'Community Driven',
    description: 'Our roadmap is shaped by the developers who use SynthForge every day. We build what you need, not what we assume.',
    color: 'from-orange-600 to-rose-600',
  },
]

const team = [
  {
    name: 'Sarah Chen',
    title: 'CEO & Co-Founder',
    initials: 'SC',
    bio: 'Former ML engineer at Google. Passionate about making AI accessible to every developer.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    name: 'Marcus Rivera',
    title: 'CTO & Co-Founder',
    initials: 'MR',
    bio: 'Built data infrastructure at Stripe. Believes great tools multiply developer potential.',
    gradient: 'from-orange-500 to-red-600',
  },
  {
    name: 'Aisha Patel',
    title: 'Head of AI',
    initials: 'AP',
    bio: 'PhD in NLP from Stanford. Architected the multi-agent pipeline that powers SynthForge.',
    gradient: 'from-red-500 to-rose-600',
  },
  {
    name: 'Lena Kowalski',
    title: 'Head of Design',
    initials: 'LK',
    bio: 'Previously design lead at Figma. Obsessed with making complex tools feel effortless.',
    gradient: 'from-rose-500 to-pink-600',
  },
]

const techStack = [
  { name: 'Next.js', icon: Globe },
  { name: 'TypeScript', icon: FileCode2 },
  { name: 'Prisma', icon: Database },
  { name: 'PostgreSQL', icon: Layers },
  { name: 'DeepSeek AI', icon: Cpu },
  { name: 'Tailwind CSS', icon: Paintbrush },
]

const milestones = [
  {
    quarter: 'Q1 2025',
    title: 'Project Founded',
    description: 'Started with a vision to democratize synthetic data',
    icon: Rocket,
  },
  {
    quarter: 'Q2 2025',
    title: 'Alpha Launch',
    description: 'First users generating data with AI agents',
    icon: Sparkles,
  },
  {
    quarter: 'Q3 2025',
    title: 'Multi-Agent Pipeline',
    description: 'Introduced 5 specialized AI agents',
    icon: GitBranch,
  },
  {
    quarter: 'Q4 2025',
    title: 'Public Beta',
    description: 'Opened to the public with 10K+ users',
    icon: Users,
  },
  {
    quarter: 'Q1 2026',
    title: 'Enterprise Ready',
    description: 'SOC 2 compliance, SSO, and team workspaces',
    icon: Shield,
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* ─── Hero Section ─── */}
      <section className="relative overflow-hidden py-20 md:py-28">
        {/* Animated gradient mesh background */}
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-background to-red-50 dark:from-amber-950/20 dark:via-background dark:to-red-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-200/20 via-transparent to-transparent dark:from-amber-900/10" />
        {/* Floating gradient orbs */}
        <div
          className="absolute top-20 -left-20 h-72 w-72 rounded-full bg-amber-400/10 dark:bg-amber-500/5 blur-3xl animate-pulse"
          style={{ animationDuration: '8s' }}
        />
        <div
          className="absolute top-40 right-10 h-96 w-96 rounded-full bg-red-400/10 dark:bg-red-500/5 blur-3xl animate-pulse"
          style={{ animationDuration: '12s', animationDelay: '2s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-orange-400/8 dark:bg-orange-500/5 blur-3xl animate-pulse"
          style={{ animationDuration: '10s', animationDelay: '4s' }}
        />
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative container mx-auto px-4 md:px-6 max-w-4xl text-center">
          <Badge variant="outline" className="mb-4">
            About Us
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 leading-[1.1]">
            Building the future of{' '}
            <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
              synthetic data
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Empowering developers and data teams to create production-quality, privacy-safe data — with nothing more
            than a natural language description.
          </p>
        </div>
      </section>

      {/* ─── Stats Section ─── */}
      <section className="py-16 md:py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 max-w-5xl mx-auto">
            {stats.map((stat) => (
              <Card
                key={stat.label}
                className="group relative overflow-hidden border-border/50 hover:shadow-xl transition-all duration-300"
              >
                <div
                  className={`absolute -inset-px bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-xl`}
                />
                <CardContent className="relative flex flex-col items-center text-center p-6">
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Our Story Section ─── */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <Badge variant="outline" className="mb-4">
                Our Story
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
                Born from a frustration with{' '}
                <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
                  manual data work
                </span>
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  SynthForge AI was born from a simple observation: developers and data teams spend too much time
                  creating test data manually or wrestling with privacy concerns around real data. We built a platform
                  where you describe what you need in plain English, and our multi-agent AI pipeline generates
                  production-quality, privacy-safe synthetic data in minutes.
                </p>
                <p>
                  Our founding team experienced this pain firsthand — spending countless hours fabricating data for
                  testing, anonymizing production snapshots, and building fragile scripts to seed databases. We knew
                  there had to be a better way. That conviction became SynthForge.
                </p>
                <p>
                  Today, thousands of developers trust SynthForge to power their development, testing, and analytics
                  workflows with realistic synthetic data that never compromises on privacy. Our mission is to make
                  every developer&apos;s data journey faster, safer, and more delightful.
                </p>
              </div>
            </div>

            {/* Side illustration — gradient card with code snippet visual */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-amber-500/20 via-red-500/10 to-amber-500/20 dark:from-amber-500/10 dark:via-red-500/5 dark:to-amber-500/10 rounded-3xl blur-2xl" />
              <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-2xl overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/40">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-rose-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-400" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Terminal className="h-3 w-3" />
                    <span className="font-mono">synthforge — pipeline.log</span>
                  </div>
                </div>
                {/* Code snippet */}
                <div className="p-5 font-mono text-xs md:text-sm leading-6 text-muted-foreground space-y-1">
                  <div>
                    <span className="text-amber-600 dark:text-amber-400">const</span>{' '}
                    <span className="text-red-600 dark:text-red-400">pipeline</span> ={' '}
                    <span className="text-amber-600 dark:text-amber-400">await</span> SynthForge.
                    <span className="text-emerald-600 dark:text-emerald-400">run</span>({'{'}
                  </div>
                  <div className="pl-4">
                    prompt: <span className="text-emerald-600 dark:text-emerald-400">&quot;E-commerce DB with users, orders, products&quot;</span>,
                  </div>
                  <div className="pl-4">
                    agents: [<span className="text-amber-600 dark:text-amber-400">&quot;schema&quot;</span>,{' '}
                    <span className="text-amber-600 dark:text-amber-400">&quot;generator&quot;</span>,{' '}
                    <span className="text-amber-600 dark:text-amber-400">&quot;quality&quot;</span>],
                  </div>
                  <div className="pl-4">
                    rows: <span className="text-red-600 dark:text-red-400">500</span>,
                  </div>
                  <div className="pl-4">
                    privacy: <span className="text-amber-600 dark:text-amber-400">true</span>
                  </div>
                  <div>{"}');"}</div>
                  <div className="pt-2">
                    <span className="text-muted-foreground/50">{'// ✓ 3 tables · 1,500 rows · 99.7% quality'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground/50">{'// ✓ Zero PII detected · Exported in 12s'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Core Values Section ─── */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              Core Values
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">What Drives Us</h2>
            <p className="text-muted-foreground text-lg">
              The principles that guide every decision we make, from product design to engineering.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {values.map((value) => (
              <Card
                key={value.title}
                className="group relative overflow-hidden border-border/50 hover:shadow-xl transition-all duration-300"
              >
                <div
                  className={`absolute -inset-px bg-gradient-to-br ${value.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-xl`}
                />
                <CardContent className="relative p-6">
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${value.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}
                  >
                    <value.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Team Section ─── */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              Our Team
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">The People Behind SynthForge</h2>
            <p className="text-muted-foreground text-lg">
              A small, dedicated team with deep expertise in AI, data infrastructure, and developer tools.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {team.map((member) => (
              <Card
                key={member.name}
                className="group relative overflow-hidden border-border/50 hover:shadow-xl transition-all duration-300 text-center"
              >
                <div
                  className={`absolute -inset-px bg-gradient-to-br ${member.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 rounded-xl`}
                />
                <CardContent className="relative p-6">
                  <div
                    className={`h-16 w-16 rounded-full bg-gradient-to-br ${member.gradient} flex items-center justify-center mx-auto mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                  >
                    <span className="text-xl font-bold text-white">{member.initials}</span>
                  </div>
                  <h3 className="text-lg font-semibold">{member.name}</h3>
                  <p className="text-sm font-medium bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent mb-3">
                    {member.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{member.bio}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Tech Stack Section ─── */}
      <section className="py-20 md:py-28 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="outline" className="mb-4">
              Built With
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Our Tech Stack</h2>
            <p className="text-muted-foreground text-lg">
              Modern tools and frameworks that power every layer of the SynthForge platform.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
            {techStack.map((tech) => (
              <div
                key={tech.name}
                className="group flex items-center gap-2 px-4 py-2.5 rounded-full border border-border/60 bg-card hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-md transition-all duration-300"
              >
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500/20 to-red-500/20 flex items-center justify-center group-hover:from-amber-500/30 group-hover:to-red-500/30 transition-colors">
                  <tech.icon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-sm font-medium">{tech.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Timeline / Milestones Section ─── */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-4">
              <Milestone className="h-3 w-3 mr-1" />
              Milestones
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Our Journey</h2>
            <p className="text-muted-foreground text-lg">
              From a bold idea to a platform trusted by thousands — here are the moments that shaped us.
            </p>
          </div>

          {/* Vertical timeline */}
          <div className="relative max-w-3xl mx-auto">
            {/* Timeline line */}
            <div className="absolute left-4 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-500 via-red-500 to-amber-500 opacity-30" />

            <div className="space-y-8 md:space-y-12">
              {milestones.map((milestone, idx) => {
                const isLeft = idx % 2 === 0
                return (
                  <div key={milestone.quarter} className="relative flex items-start">
                    {/* Dot on the line */}
                    <div className="absolute left-4 md:left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-gradient-to-br from-amber-500 to-red-600 border-4 border-background shadow-md z-10" />

                    {/* Card — alternating sides on md+, always right on mobile */}
                    <div
                      className={`ml-10 md:ml-0 md:w-[calc(50%-2rem)] ${
                        isLeft ? 'md:mr-auto md:pr-0' : 'md:ml-auto md:pl-0'
                      }`}
                    >
                      <Card className="group relative overflow-hidden border-border/50 hover:shadow-xl transition-all duration-300">
                        <div className="absolute -inset-px bg-gradient-to-br from-amber-500/10 to-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                        <CardContent className="relative p-5">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
                              <milestone.icon className="h-4 w-4 text-white" />
                            </div>
                            <Badge variant="outline" className="text-xs font-mono">
                              {milestone.quarter}
                            </Badge>
                          </div>
                          <h3 className="text-base font-semibold mb-1">{milestone.title}</h3>
                          <p className="text-sm text-muted-foreground">{milestone.description}</p>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA Section ─── */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6">
          <div className="relative max-w-3xl mx-auto text-center rounded-2xl overflow-hidden">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-600/90 via-red-600/90 to-amber-700/90" />
            {/* Decorative orbs */}
            <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            {/* Content */}
            <div className="relative p-10 md:p-16">
              <Zap className="h-12 w-12 text-white mx-auto mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
                Ready to Get Started?
              </h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                Start generating privacy-safe, production-quality synthetic data for free today.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  size="lg"
                  asChild
                  className="bg-white text-amber-700 hover:bg-white/90 h-12 px-8 text-base font-semibold shadow-lg"
                >
                  <Link href="/signup">
                    Get Started Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="border-white/30 text-white hover:bg-white/10 h-12 px-8 text-base"
                >
                  <Link href="/contact">Talk to Sales</Link>
                </Button>
              </div>
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
