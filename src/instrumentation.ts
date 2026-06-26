export async function register() {
  // Instrumentation hook runs in Edge Runtime, so we can't use process.on here.
  // Process-level error handlers are set up in the Next.js server startup instead.
  // This hook is kept as a no-op for compatibility.
}
