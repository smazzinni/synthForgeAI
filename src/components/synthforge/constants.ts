// ─── Constants ──────────────────────────────────────────

export const IRREGULAR_PLURALS: Record<string, string> = {
  person: 'people', man: 'men', woman: 'women', child: 'children',
  category: 'categories', city: 'cities', country: 'countries',
  story: 'stories', diary: 'diaries', query: 'queries',
  baby: 'babies', lady: 'ladies', party: 'parties',
  university: 'universities', address: 'addresses',
  index: 'indices', matrix: 'matrices',
}

export const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
}

export const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.08 }
  }
}

export const staggerItem = {
  initial: { opacity: 0, y: 15 },
  animate: { opacity: 1, y: 0 }
}

export const messageSlideIn = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
}

export const gradientStyle = `
@keyframes gradientShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
`
