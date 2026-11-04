/**
 * In-process registry of data-generation jobs.
 *
 * A job runs independently of any HTTP connection: the SSE response merely
 * *subscribes* to it. If the browser disconnects, refreshes or navigates away
 * the job keeps going and keeps persisting rows; the client can re-attach with
 * GET /api/generate-stream?jobId=… (same instance) or simply poll the database
 * status (any instance). Only an explicit cancel stops a job.
 */

export type GenerationEventType =
  | 'job_started'
  | 'database_created'
  | 'progress'
  | 'table_complete'
  | 'complete'
  | 'error'
  | 'cancelled'

export interface GenerationEvent {
  type: GenerationEventType
  jobId?: string
  databaseId?: string
  table?: string
  rowsInserted?: number
  totalInserted?: number
  targetRows?: number
  totalRows?: number
  tablesGenerated?: number
  durationMs?: number
  message?: string
  recoverable?: boolean
}

export type JobStatus = 'running' | 'complete' | 'error' | 'cancelled'

export interface GenerationJob {
  id: string
  userId: string
  databaseId: string
  status: JobStatus
  startedAt: number
  finishedAt?: number
  events: GenerationEvent[]
  /** set by cancel(); the worker checks it between chunks */
  cancelRequested: boolean
  abort: AbortController
  listeners: Set<(event: GenerationEvent) => void>
}

const MAX_EVENTS = 400
const FINISHED_TTL_MS = 30 * 60 * 1000

const g = globalThis as unknown as { __synthGenJobs?: Map<string, GenerationJob> }
const jobs: Map<string, GenerationJob> = g.__synthGenJobs ?? (g.__synthGenJobs = new Map())

function sweep() {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > FINISHED_TTL_MS) jobs.delete(id)
  }
}

export function createJob(userId: string, databaseId: string): GenerationJob {
  sweep()
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    userId,
    databaseId,
    status: 'running',
    startedAt: Date.now(),
    events: [],
    cancelRequested: false,
    abort: new AbortController(),
    listeners: new Set(),
  }
  jobs.set(job.id, job)
  return job
}

export function emit(job: GenerationJob, event: GenerationEvent): void {
  const full = { ...event, jobId: job.id }
  job.events.push(full)
  if (job.events.length > MAX_EVENTS) {
    // Drop the oldest plain progress events; keep milestones for replay.
    const idx = job.events.findIndex(e => e.type === 'progress')
    job.events.splice(idx === -1 ? 0 : idx, 1)
  }
  if (full.type === 'complete') { job.status = 'complete'; job.finishedAt = Date.now() }
  if (full.type === 'cancelled') { job.status = 'cancelled'; job.finishedAt = Date.now() }
  for (const listener of job.listeners) {
    try { listener(full) } catch { /* a broken listener must not stop the job */ }
  }
}

export function failJob(job: GenerationJob, message: string): void {
  job.status = 'error'
  job.finishedAt = Date.now()
  emit(job, { type: 'error', message, recoverable: false })
  job.status = 'error'
}

export function getJob(userId: string, jobId: string): GenerationJob | null {
  const job = jobs.get(jobId)
  return job && job.userId === userId ? job : null
}

export function getActiveJobForDatabase(userId: string, databaseId: string): GenerationJob | null {
  for (const job of jobs.values()) {
    if (job.userId === userId && job.databaseId === databaseId && job.status === 'running') return job
  }
  return null
}

export function cancelJob(job: GenerationJob): void {
  if (job.status !== 'running') return
  job.cancelRequested = true
  job.abort.abort()
}

/**
 * Build an SSE Response that replays the job's past events and then streams
 * live ones. Closing the response only detaches the listener.
 */
export function streamJob(job: GenerationJob): Response {
  const encoder = new TextEncoder()
  let listener: ((e: GenerationEvent) => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const cleanup = () => {
    if (listener) job.listeners.delete(listener)
    if (heartbeat) clearInterval(heartbeat)
    listener = null
    heartbeat = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (e: GenerationEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
        } catch {
          closed = true
          cleanup()
          return
        }
        if (e.type === 'complete' || e.type === 'cancelled' || (e.type === 'error' && !e.recoverable)) {
          closed = true
          cleanup()
          try { controller.close() } catch { /* already closed */ }
        }
      }
      for (const e of job.events) send(e)
      if (closed || job.status !== 'running') {
        if (!closed) { cleanup(); try { controller.close() } catch { /* ignore */ } }
        return
      }
      listener = send
      job.listeners.add(listener)
      // Comment frames keep proxies/load balancers from closing an idle stream.
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) } catch { cleanup() }
      }, 15_000)
    },
    cancel() {
      cleanup() // client went away — the job itself keeps running
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
