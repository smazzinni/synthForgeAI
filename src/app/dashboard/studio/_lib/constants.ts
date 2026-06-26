// ─── Studio static constants ───
// Extracted from page.tsx. Pure data — no runtime state, no React deps.

/**
 * The default assistant greeting shown when the studio is opened fresh
 * (no connection, no existing database). Used as the initial `messages`
 * array entry inside the `StudioPageInner` component.
 */
export const INITIAL_GREETING =
  'Welcome to **SynthForge AI Studio**! I can help you generate synthetic data.\n\n' +
  'Describe the database you need, and I\'ll design the schema, generate realistic data, and ensure quality compliance.\n\n' +
  'For example: "Generate an e-commerce database with users, orders, and products"'

/**
 * Quick-prompt suggestion chips rendered in the empty state of the chat
 * column. Clicking a chip populates the chat input via `setInput(example)`.
 *
 * Kept as a top-level constant (rather than inline JSX) so it can be reused
 * across the studio + landing/onboarding surfaces without duplication.
 */
export const QUICK_PROMPTS: readonly string[] = [
  'E-commerce with users, orders, products',
  'Hospital management system',
  'Social media platform',
  'SaaS subscription billing',
] as const
