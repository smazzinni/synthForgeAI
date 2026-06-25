const DEFAULT_TIMEOUT_MS = 4_000

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Fetch wrapper that aborts slow Supabase auth calls instead of retrying
 * indefinitely when the project URL is unreachable.
 */
export function createFetchWithTimeout(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onAuthNetworkFailure?: () => void,
): typeof fetch {
  let failureHandled = false

  return async (input, init) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      })
    } catch (error) {
      const url = requestUrl(input)
      if (
        !failureHandled &&
        onAuthNetworkFailure &&
        url.includes('/auth/v1/')
      ) {
        failureHandled = true
        onAuthNetworkFailure()
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export function isAuthNetworkError(error: unknown): boolean {
  if (!error) return false
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof (error as { message?: string }).message === 'string'
          ? (error as { message: string }).message
          : String(error)

  const normalized = message.toLowerCase()
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('aborterror') ||
    normalized.includes('aborted') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('auth timeout')
  )
}

export const AUTH_UNAVAILABLE_MESSAGE =
  'Cannot reach the authentication service. Check your internet connection and Supabase URL in .env, then restart the dev server.'
