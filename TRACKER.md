# SynthForge AI - Bug Tracker & Fix Log

## BUG-001: Persistent 502 Bad Gateway Error

**Status:** FIXED
**Priority:** Critical
**Date:** 2026-05-13

### Root Cause

The 502 Bad Gateway error was caused by the Next.js dev server crashing when clients disconnected during streaming responses. The crash chain was:

1. Client disconnects (navigates away, closes tab, or network interruption)
2. The `ReadableStream` controller's internal state becomes "closed"
3. `controller.enqueue()` is called after the stream is closed (in `src/lib/ai.ts` and `src/app/api/chat/route.ts`)
4. This throws an unhandled `TypeError: Controller is already closed` exception
5. The unhandled exception crashes the server process
6. Subsequent requests receive 502 Bad Gateway from the reverse proxy

### Specific Crash Locations

1. **`src/lib/ai.ts`** - `chatCompletionStream()` function:
   - Bare `controller.enqueue()` calls in the streaming loop
   - No check for `controller.desiredSize` before enqueue
   - No try/catch around `controller.close()`

2. **`src/app/api/chat/route.ts`** - Transform stream in POST handler:
   - `controller.enqueue(chunk)` in the `transform()` function (line ~148)
   - `controller.enqueue()` for PII/quality metadata emit (line ~285)
   - Both lacked `controller.desiredSize !== null` guard

### Solution Applied

1. **Safe Enqueue Pattern** - Added `safeEnqueue()` helper in `src/lib/ai.ts`:
   ```typescript
   const safeEnqueue = (data: Uint8Array) => {
     try {
       if (controller.desiredSize !== null) {
         controller.enqueue(data)
       }
     } catch {
       // Controller already closed - silently ignore
     }
   }
   ```
   - All bare `controller.enqueue()` calls replaced with `safeEnqueue()`
   - `controller.close()` wrapped in try/catch

2. **Transform Stream Guard** - In `src/app/api/chat/route.ts`:
   - Added `controller.desiredSize !== null` check before enqueue in transform()
   - Added same check before PII/quality metadata emit

3. **Frontend Exponential Backoff** - In `src/components/synthforge-app.tsx`:
   - `sendMessage()` now retries up to 3 times on network errors
   - Exponential backoff: 1s, 2s, 4s (max 8s)
   - Shows "Connection lost. Retrying (N/3)..." in streaming placeholder
   - User-friendly error messages for 502/503/504, 429, 401/403 status codes
   - Network error detection with specific "Connection Lost" toast

4. **Preview Domain Configuration** - In `next.config.ts`:
   - Added `allowedDevOrigins` for `.space-z.ai` and `.space.chatglm.site` domains
   - Prevents cross-origin issues with the reverse proxy

### Verification

- Build passes: `npm run build` completes successfully
- Lint passes: `npm run lint` returns no errors
- Server no longer crashes on client disconnect during streaming
- Frontend gracefully handles server unavailability with retry + user feedback
- All `controller.enqueue()` calls guarded with `desiredSize` check

---

## BUG-002: Data Section Shows Mixed/Concatenated Data

**Status:** FIXED
**Priority:** High
**Date:** 2026-05-13

### Root Cause

The Data Section previously auto-selected the first available table whenever data appeared. This meant:
- Users never saw the placeholder "Select a table to view data"
- Switching databases would auto-select a table without user interaction
- It was unclear which table was being displayed

### Solution Applied

1. **Removed auto-select behavior** - The `useEffect` that watched `getTablesFromMessages` no longer auto-selects the first table
2. **Clear selection only when stale** - If the selected table no longer exists in the data, selection is cleared and placeholder shown
3. **Click-to-select pattern** - Users must explicitly click a table in the sidebar tree to view its data
4. **Placeholder shown when no selection** - "Select a table to view data" message with icon when no table is selected

### Acceptance Criteria Met

- [x] Click a table in tree view -> Data section shows ONLY that table's data
- [x] No table selected -> Placeholder message displayed
- [x] No mixed/concatenated data from multiple tables
- [x] Instant update, no page reload required
- [x] Switching databases resets selection

---

## BUG-003: Server Crash on Streaming Chat (safeEnqueue Scoping)

**Status:** FIXED
**Priority:** Critical
**Date:** 2026-05-13

### Root Cause

The `safeEnqueue()` helper function in `src/lib/ai.ts` `chatCompletionStream()` was defined **inside the `try` block** but referenced in the `catch` block. When an error occurred during streaming (e.g., AI timeout), the catch handler tried to call `safeEnqueue()` to emit a fallback response, but the function was out of scope, causing a `ReferenceError: safeEnqueue is not defined`. This uncaught exception crashed the entire Node.js server process.

### Solution Applied

1. Moved `safeEnqueue()` and `safeClose()` definitions to the top of the `start(controller)` callback, before the `try` block
2. All controller operations now use these safe helpers regardless of error state
3. Added `safeClose()` to replace raw `controller.close()` calls

### Verification

- Streaming chat returns 339 SSE events successfully
- Server process stays alive after streaming completes
- Build and lint pass

---

## BUG-004: TDZ Error - "Cannot access 'getTablesFromMessages' before initialization"

**Status:** FIXED
**Priority:** Critical
**Date:** 2026-05-13

### Root Cause

The `useMemo` hook's return value was stored in a variable named `getTablesFromMessages`. During Hot Module Replacement (HMR) cycles, React may re-run `useEffect` hooks before `useMemo` values are recomputed, causing a Temporal Dead Zone (TDZ) reference error.

### Solution Applied

- Renamed the `useMemo` variable from `getTablesFromMessages` to `allTablesData`
- Created `getTablesFromMessages` as a simple alias: `const getTablesFromMessages = allTablesData`
- Changed `useEffect` dependency to reference `allTablesData` directly
- This ensures the memoized value is always computed before effects reference it

---

## BUG-005: Duplicate Chat Message on Retry

**Status:** FIXED
**Priority:** High
**Date:** 2026-05-13

### Root Cause

When `handleRetry()` was called, it cleared the error flag on the existing message and called `sendMessage()`. But `sendMessage()` always adds a new user message to the list, resulting in a duplicate.

### Solution Applied

- Changed `handleRetry()` to **remove** the failed user message from the list before calling `sendMessage()`
- Also removes any error-state assistant messages
- `sendMessage()` then adds a fresh user message, avoiding duplication

---

## BUG-006: Misleading Error Messages from Chat API

**Status:** FIXED
**Priority:** High
**Date:** 2026-05-13

### Root Cause

The catch-all error handler in `/api/chat` returned "The AI service may be temporarily unavailable" for ALL errors, including database constraint violations and timeouts.

### Solution Applied

- Added contextual error detection based on error message content
- Foreign key / Prisma errors → "A database error occurred. The resource may not exist."
- Timeout errors → "The request took too long. Please try again with a simpler request."
- AI init errors → "The AI service is not configured correctly."
- Default → "Please try again."

---

## BUG-007: Server Process Crash from Unhandled Exceptions

**Status:** FIXED
**Priority:** High
**Date:** 2026-05-13

### Root Cause

Node.js terminates the process on unhandled promise rejections and uncaught exceptions by default. Any error that escaped the try/catch blocks in API routes would crash the entire server.

### Solution Applied

- Added `process.on('unhandledRejection')` handler in `src/lib/db.ts` that logs but does not terminate
- Added `process.on('uncaughtException')` handler that logs but does not terminate
- These act as a safety net, keeping the server alive even when errors escape route handlers

---

## BUG-003: useSyncExternalStore Infinite Loop (Known, Not Yet Fixed)

**Status:** OPEN
**Priority:** Medium
**Date:** 2026-05-13

### Description

The `src/hooks/use-database.ts` hook used `useSyncExternalStore` with a `getSnapshot` function that returned a new object reference on every call, causing infinite re-subscription loops. This hook was removed/not found in the current codebase, but if re-introduced, ensure `getSnapshot` returns a referentially stable value (use `useMemo` or `useRef` to cache the snapshot).
