import { describe, expect, it } from 'vitest'
import { cancelJob, createJob, emit, getActiveJobForDatabase, getJob, streamJob } from '../generation-jobs'

describe('generation jobs', () => {
  it('is owner-scoped', () => {
    const job = createJob('alice', 'db1')
    expect(getJob('alice', job.id)).toBe(job)
    expect(getJob('mallory', job.id)).toBeNull()
    expect(getActiveJobForDatabase('alice', 'db1')).toBe(job)
  })

  it('replays past events to late subscribers and keeps running after a client detaches', async () => {
    const job = createJob('bob', 'db2')
    emit(job, { type: 'job_started', databaseId: 'db2' })
    const res = streamJob(job)
    const reader = res.body!.getReader()
    const first = new TextDecoder().decode((await reader.read()).value)
    expect(first).toContain('job_started')
    await reader.cancel() // client disconnects
    expect(job.listeners.size).toBe(0)
    expect(job.status).toBe('running')
    emit(job, { type: 'complete', totalRows: 5 })
    expect(job.status).toBe('complete')
  })

  it('cancel aborts the job signal', () => {
    const job = createJob('carol', 'db3')
    cancelJob(job)
    expect(job.cancelRequested).toBe(true)
    expect(job.abort.signal.aborted).toBe(true)
  })
})
