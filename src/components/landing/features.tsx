import { Card, CardContent } from '@/components/ui/card'
import {
  FlaskConical,
  Database,
  ShieldCheck,
  Workflow,
  Users,
  Lock,
} from 'lucide-react'

const features = [
  {
    icon: FlaskConical,
    title: 'AI Data Generation',
    description: 'Generate realistic synthetic data using advanced AI. Describe what you need in plain English and get production-ready datasets.',
  },
  {
    icon: Database,
    title: 'Schema Design',
    description: 'Intelligent schema design with proper relationships, constraints, and indexes. From simple to complex multi-table schemas.',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Assurance',
    description: 'Automated quality checks for referential integrity, data realism, distribution patterns, and constraint compliance.',
  },
  {
    icon: Workflow,
    title: 'Multi-Agent Pipeline',
    description: 'Discovery, schema, generation, validation, and quality agents work together in an orchestrated pipeline.',
  },
  {
    icon: Users,
    title: 'Real-time Collaboration',
    description: 'Work together with your team in shared workspaces. Manage organizations, projects, and databases with role-based access.',
  },
  {
    icon: Lock,
    title: 'Privacy-First',
    description: 'All generated data is synthetic and privacy-safe. PII masking, GDPR compliance, and secure data handling built in.',
  },
]

export function Features() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Everything you need for synthetic data
          </h2>
          <p className="text-lg text-muted-foreground">
            From schema design to quality validation, SynthForge AI provides a complete platform for generating test data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card key={index} className="border-0 shadow-sm hover:shadow-md transition-shadow bg-card">
                <CardContent className="p-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
