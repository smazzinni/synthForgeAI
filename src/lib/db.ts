import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'file:./db/custom.db'
    }
  }
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Add error handler to prevent unhandled Prisma errors from crashing the process
db.$on('error', (e) => {
  console.error('[Prisma] Connection error:', e)
})

// Attempt connection with retry (non-blocking)
let connectionAttempts = 0
const connectWithRetry = async () => {
  try {
    await db.$connect()
    console.log('[Prisma] Database connected successfully')
  } catch (err) {
    connectionAttempts++
    console.error(`[Prisma] Connection attempt ${connectionAttempts} failed:`, err)
    if (connectionAttempts < 3) {
      setTimeout(connectWithRetry, 2000 * connectionAttempts)
    }
  }
}
connectWithRetry().catch(() => {})

// Graceful shutdown
process.on('beforeExit', async () => {
  try { await db.$disconnect() } catch { /* silent */ }
})
