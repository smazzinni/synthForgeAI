'use client'

import { useState } from 'react'
import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

export default function ContactPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="py-20">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="inline-block border rounded-md px-3 py-1 text-sm mb-4">Contact</span>
              <h1 className="text-3xl md:text-5xl font-bold mb-4">Get In Touch</h1>
              <p className="text-muted-foreground text-lg">
                Have questions about SynthForge AI? We&apos;d love to hear from you. Send us a message and we&apos;ll respond as soon as possible.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
              <div className="space-y-4">
                <div className="rounded-lg border p-5">
                  <h3 className="font-semibold mb-1">Email</h3>
                  <p className="text-muted-foreground text-sm">hello@synthforge.ai</p>
                  <p className="text-muted-foreground text-sm">support@synthforge.ai</p>
                </div>
                <div className="rounded-lg border p-5">
                  <h3 className="font-semibold mb-1">Office</h3>
                  <p className="text-muted-foreground text-sm">San Francisco, CA</p>
                  <p className="text-muted-foreground text-sm">United States</p>
                </div>
                <div className="rounded-lg border p-5">
                  <h3 className="font-semibold mb-1">Phone</h3>
                  <p className="text-muted-foreground text-sm">+1 (555) 123-4567</p>
                </div>
              </div>

              <div className="rounded-lg border p-6">
                {sent ? (
                  <div className="text-center py-8">
                    <p className="text-emerald-500 text-2xl mb-2">✓</p>
                    <h3 className="text-lg font-semibold mb-2">Message Sent!</h3>
                    <p className="text-muted-foreground">Thank you for reaching out. We&apos;ll get back to you within 24 hours.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="firstName" className="block text-sm font-medium mb-1">First Name</label>
                        <input id="firstName" placeholder="John" required className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
                      </div>
                      <div>
                        <label htmlFor="lastName" className="block text-sm font-medium mb-1">Last Name</label>
                        <input id="lastName" placeholder="Doe" required className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
                      <input id="email" type="email" placeholder="john@example.com" required className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium mb-1">Subject</label>
                      <input id="subject" placeholder="How can we help?" required className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
                      <textarea id="message" placeholder="Tell us more about your needs..." rows={5} required className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {loading ? 'Sending...' : 'Send Message'}
                    </button>
                  </form>
                )}
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
