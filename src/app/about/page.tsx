import Link from 'next/link'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, Brain, Shield, Workflow, ArrowRight } from 'lucide-react'

const values = [
  { icon: Brain, title: 'AI-First', description: 'We believe synthetic data generation should be intelligent, automated, and accessible to everyone through natural language interfaces.' },
  { icon: Shield, title: 'Privacy by Design', description: 'Every feature we build starts with privacy in mind. Our synthetic data contains zero real PII, ensuring compliance by default.' },
  { icon: Workflow, title: 'Developer Experience', description: 'From API design to UI interactions, we obsess over making the developer experience smooth, intuitive, and productive.' },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          <Badge variant="outline" className="mb-4">About Us</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Building the future of{' '}
            <span className="bg-gradient-to-r from-amber-600 to-red-600 bg-clip-text text-transparent">
              synthetic data
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-12 leading-relaxed">
            SynthForge AI was born from a simple observation: developers and data teams spend too much time
            creating test data manually or wrestling with privacy concerns around real data. We built a platform
            where you describe what you need in plain English, and our multi-agent AI pipeline generates
            production-quality, privacy-safe synthetic data in minutes.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center bg-gradient-to-br from-amber-500/10 via-red-500/5 to-amber-500/10 dark:from-amber-500/5 dark:via-red-500/2 dark:to-amber-500/5 p-12 rounded-2xl border border-amber-200/50 dark:border-amber-800/30">
            <Zap className="h-10 w-10 text-amber-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-3">Ready to get started?</h2>
            <p className="text-muted-foreground mb-6">Start generating synthetic data for free today.</p>
            <Button asChild className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white">
              <Link href="/signup">Get Started Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>
      <div className="mt-auto"><Footer /></div>
    </div>
  )
}
