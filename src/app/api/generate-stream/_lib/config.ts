// ─── Streaming Database Generation API — configuration ───

/** Fallback user ID used when no authenticated user can be resolved. */
export const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

// ─── DeepSeek v4 API configuration ───
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
export const DEEPSEEK_BASE_URL =
  process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat'
export const DEEPSEEK_MAX_TOKENS = parseInt(
  process.env.DEEPSEEK_MAX_TOKENS || '32000',
  10,
)

/** Rows per batch insert into the database. */
export const BATCH_SIZE = 200

/** Flush batch at least every N milliseconds to keep SSE latency low. */
export const FLUSH_INTERVAL_MS = 300
