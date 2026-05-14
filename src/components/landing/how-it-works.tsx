import { MessageSquare, Database, ShieldCheck } from 'lucide-react'

const steps = [
  {
    icon: MessageSquare,
    step: '01',
    title: 'Describe Your Data',
    description: 'Chat with our AI agent and describe the database you need. Answer a few targeted questions about volume, domain, and constraints.',
  },
  {
    icon: Database,
    step: '02',
    title: 'Generate & Preview',
    description: 'Our multi-agent pipeline designs the schema, generates realistic data, and shows you a preview before creating the full dataset.',
  },
  {
    icon: ShieldCheck,
    step: '03',
    title: 'Validate & Export',
    description: 'Quality agents validate referential integrity, data realism, and compliance. Export in JSON, CSV, SQL, or via API.',
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground">
            Three simple steps to generate production-quality synthetic data.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={index} className="relative text-center">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px bg-border" />
                )}

                <div className="relative z-10 mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-background border shadow-sm">
                  <Icon className="h-10 w-10 text-primary" />
                </div>

                <div className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-4">
                  Step {step.step}
                </div>

                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
