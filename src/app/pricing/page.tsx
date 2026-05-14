import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'
import Link from 'next/link'

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    description: 'Perfect for exploring synthetic data generation',
    features: [
      '3 databases',
      '1,000 rows per database',
      'Basic schema generation',
      'JSON/CSV export',
      'Community support',
      '1 workspace',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$49',
    period: '/month',
    description: 'For teams building production applications',
    features: [
      'Unlimited databases',
      '100,000 rows per database',
      'Multi-agent AI pipeline',
      'All export formats',
      'Priority email support',
      'Team collaboration (up to 10)',
      'API access',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For organizations with advanced requirements',
    features: [
      'Unlimited everything',
      'Custom row limits',
      'Dedicated AI agents',
      'SLA guarantee (99.9%)',
      'SSO/SAML authentication',
      'Custom integrations',
      'Dedicated support engineer',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

const faqs = [
  { q: 'Can I switch plans anytime?', a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we\'ll prorate any charges.' },
  { q: 'Is there a free trial for Pro?', a: 'Yes! The Pro plan comes with a 14-day free trial. No credit card required to start.' },
  { q: 'What counts as a database?', a: 'A database is a collection of related tables with generated synthetic data. Each database can contain multiple tables and relationships.' },
  { q: 'Can I use the data commercially?', a: 'Yes. All generated synthetic data is fully yours to use for any purpose, including commercial applications, testing, and analytics.' },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="inline-block border rounded-md px-3 py-1 text-sm mb-4">Pricing</span>
              <h1 className="text-3xl md:text-5xl font-bold mb-4">
                Simple, Transparent Pricing
              </h1>
              <p className="text-muted-foreground text-lg">
                Start free, scale as you grow. No hidden fees, no surprises. Cancel anytime.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-lg border p-6 ${
                    plan.popular ? 'border-amber-500 border-2' : ''
                  }`}
                >
                  {plan.popular && (
                    <div className="text-center mb-2">
                      <span className="bg-amber-600 text-white text-xs font-medium px-2 py-1 rounded">
                        Most Popular
                      </span>
                    </div>
                  )}
                  <div className="text-center mb-4">
                    <h2 className="text-xl font-bold">{plan.name}</h2>
                    <div className="mt-3">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className="text-muted-foreground mt-2 text-sm">{plan.description}</p>
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <span className="text-emerald-500">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.name === 'Enterprise' ? '/contact' : '/signup'}
                    className={`block w-full text-center py-2 px-4 rounded-md text-sm font-medium ${
                      plan.popular
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'border hover:bg-accent'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>

            <div className="max-w-3xl mx-auto mt-20">
              <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
              <div className="space-y-6">
                {faqs.map((faq) => (
                  <div key={faq.q}>
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-muted-foreground">{faq.a}</p>
                  </div>
                ))}
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
