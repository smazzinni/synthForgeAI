// Database client - uses Supabase as primary
// Prisma is deprecated and will be removed in a future update
// For now, export null - all API routes use Supabase as primary data source

export const db = null as unknown as import('@prisma/client').PrismaClient | null
