# Task: Fix Runtime Errors and Improve Robustness

## Summary of Changes

### 1. Fixed "e.trim is not a function" TypeError
- **`src/lib/ai.ts`**: Added `safeTrim` utility function exported from the AI module. Applied defensive type checking in:
  - `chatCompletion()`: Validate `rawContent` from API is a string before using
  - `chatCompletionStream()`: Same defensive content type checking
  - `parseAgentResponse()`: Added `typeof` checks for all parsed JSON fields to prevent non-string values from causing `.trim()` errors
  - `extractSchemaFromCSV()`: Added defensive string checks for csvText and all cell values
- **`src/hooks/use-realtime-events.ts`**: Changed `line.slice(6).trim()` to safe two-step pattern with `typeof` check
- **`src/components/synthforge-app.tsx`**: Same fix for SSE line parsing

### 2. Fixed Duplicate "Thinking" Display in chat-message-bubble.tsx
- When streaming with content AND parsedSteps exist, now shows ReasoningTimeline with autoOpen=true (previously hidden during this phase)
- "Generating" indicator only shows when there are no reasoning steps visible (avoids duplicate with timeline)
- This ensures reasoning steps remain visible throughout the streaming lifecycle without disappearing and reappearing

### 3. Added Server Crash Protection (try-catch) to All API Routes
- **`src/app/api/events/route.ts`**: Wrapped entire GET handler in try-catch
- **`src/app/api/chat/route.ts`**: Added JSON parse error handling with proper 400 response
- **`src/app/api/generate/route.ts`**: Added body size check and JSON parse error handling
- **`src/app/api/databases/route.ts`**: Added JSON parse error handling for POST and PATCH
- **`src/app/api/workspaces/route.ts`**: Added JSON parse error handling for POST
- **`src/app/api/projects/route.ts`**: Added JSON parse error handling for POST
- **`src/app/api/datasets/route.ts`**: Added JSON parse error handling for POST
- **`src/app/api/quality/route.ts`**: Added JSON parse error handling for POST
- **`src/app/api/agents/route.ts`**: Added JSON parse error handling and action validation for POST

### 4. SSE Connection Resilience
- **`src/app/api/events/route.ts`**:
  - Added target format validation (prevents injection)
  - Increased MAX_CONNECTIONS_PER_TARGET from 2 to 3
  - Increased MAX_GLOBAL_CONNECTIONS from 10 to 20
  - Increased max SSE connection timeout from 30s to 60s
  - Properly track all intervals/timeouts/unsubscribe functions for cleanup
  - Send reconnect hint event before timeout close
  - Wrapped eventBroadcaster.getRecentEvents in try-catch
  - Centralized cleanup function clears all timers and subscriptions

### 5. Chat API Robustness
- **`src/app/api/chat/route.ts`**:
  - Added `safeTrim` import for message validation
  - JSON parse errors now return proper 400 response (was unhandled)
  - Message validation checks for non-empty after trim
  - Added agentMode validation (whitelist of valid modes)
  - Added rowCount validation (must be positive number, max 1000)
  - Use safeAgentMode when creating conversations

- **`src/app/api/generate/route.ts`**:
  - Added body size limit check
  - Added JSON parse error handling
  - Validate databaseId and prompt types
  - Validate rowCount (clamp between 1 and 1000)

- All other API routes: Added proper JSON parse error handling and type validation

### 6. Next.js Font 403 Workaround
- **`next.config.ts`**: Added `/_next/image(.*)` CORS header rule (used by font proxy). Existing rules for `/__nextjs(.*)` and `/_next/static/:path*` were already correct.

## Files Modified
1. `src/lib/ai.ts` - safeTrim, defensive type checks, parseAgentResponse validation
2. `src/hooks/use-realtime-events.ts` - safe trim in SSE parsing
3. `src/components/synthforge-app.tsx` - safe trim in SSE parsing
4. `src/components/synthforge/chat-message-bubble.tsx` - fix duplicate thinking display
5. `src/app/api/events/route.ts` - SSE resilience, try-catch, validation
6. `src/app/api/chat/route.ts` - input validation, error handling, safeTrim
7. `src/app/api/generate/route.ts` - input validation, error handling
8. `src/app/api/databases/route.ts` - error handling, type validation
9. `src/app/api/workspaces/route.ts` - error handling, type validation
10. `src/app/api/projects/route.ts` - error handling, type validation
11. `src/app/api/datasets/route.ts` - error handling, type validation
12. `src/app/api/quality/route.ts` - error handling, type validation
13. `src/app/api/agents/route.ts` - error handling, action validation
14. `next.config.ts` - added `/_next/image` CORS rule
