import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

const values = [
  { title: 'Privacy First', description: 'We believe in generating data that protects real people. Every dataset we create is fully synthetic and contains no real PII, ensuring compliance with global privacy regulations.' },
  { title: 'Quality Over Quantity', description: 'We measure success by the quality of our synthetic data, not just the volume. Our multi-agent pipeline ensures every generated dataset meets the highest standards.' },
  { title: 'Developer Experience', description: 'We build tools that developers love to use. From natural language conversations to one-click exports, every interaction is designed to be intuitive and efficient.' },
  { title: 'Open & Accessible', description: 'We democratize access to high-quality synthetic data. Whether you\'re a solo developer or a large enterprise, our platform scales to meet your needs.' },
]

const team = [
  { name: 'Alex Chen', role: 'CEO & Co-founder', bio: 'Former ML engineer at Google. Passionate about making AI accessible for data generation.' },
  { name: 'Sarah Johnson', role: 'CTO & Co-founder', bio: 'Built data platforms at Stripe. Expert in distributed systems and privacy-preserving technologies.' },
  { name: 'Michael Park', role: 'Head of AI', bio: 'PhD in NLP from Stanford. Leads our multi-agent research and development efforts.' },
  { name: 'Emma Wilson', role: 'Head of Product', bio: 'Previously product lead at Figma. Focused on creating delightful developer experiences.' },
]

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <span className="inline-block border rounded-md px-3 py-1 text-sm mb-4">About Us</span>
              <h1 className="text-3xl md:text-5xl font-bold mb-6">
                Building the Future of{' '}
                <span className="text-amber-600">Synthetic Data</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                SynthForge AI was founded with a clear mission: make high-quality synthetic data accessible to every developer and organization. We believe that privacy-safe data generation should be simple, intelligent, and production-ready.
              </p>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">Our Values</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
              {values.map((value) => (
                <div key={value.title} className="rounded-lg border p-6">
                  <h3 className="text-lg font-bold mb-2">{value.title}</h3>
                  <p className="text-muted-foreground">{value.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">Our Team</h2>
            <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
              A team of engineers, researchers, and designers passionate about AI and data privacy.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {team.map((member) => (
                <div key={member.name} className="rounded-lg border p-6 text-center">
                  <div className="h-12 w-12 rounded-full bg-amber-500 flex items-center justify-center mx-auto mb-3 text-white font-bold">
                    {member.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <h3 className="font-semibold">{member.name}</h3>
                  <p className="text-sm text-amber-600 mb-2">{member.role}</p>
                  <p className="text-sm text-muted-foreground">{member.bio}</p>
                </div>
              ))}
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
