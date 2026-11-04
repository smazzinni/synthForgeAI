/**
 * Minimal transactional email. Configure SMTP_URL (e.g.
 * smtps://user:pass@smtp.example.com:465) and MAIL_FROM. Without SMTP the
 * message is written to the server log so password resets still work for
 * self-hosted / development setups.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<'sent' | 'logged'> {
  const url = process.env.SMTP_URL
  if (!url) {
    console.warn(`[mail] SMTP_URL not set — email to ${to} not sent. Subject: ${subject}\n${text}`)
    return 'logged'
  }
  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport(url)
  await transport.sendMail({ from: process.env.MAIL_FROM || 'SynthForge AI <no-reply@synthforge.local>', to, subject, text })
  return 'sent'
}
