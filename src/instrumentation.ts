export async function register() {
  // Minimal instrumentation - only handle truly critical errors
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    process.on('unhandledRejection', (reason) => {
      // Log but don't crash
      console.error('[SynthForge] Suppressed unhandled rejection:', reason)
    })
  }
}
