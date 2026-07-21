const crypto = require('crypto');

// In-memory sync job tracking.
//
// A full tournament sync pages through the start.gg API and writes several
// hundred rows, which can run past a minute on a large bracket. That is too long
// to hold an MCP tool call open, so sync_tournament starts a job and returns
// immediately; the caller polls get_sync_status.
//
// Jobs live in process memory and are lost on restart or redeploy. That is
// acceptable here: syncTournament is idempotent, so a lost job is re-run, not
// repaired. Nothing durable depends on this store.

const MAX_JOBS = 50;
const jobs = new Map(); // jobId -> job

function prune() {
    // Map preserves insertion order, so the oldest keys come out first.
    while (jobs.size > MAX_JOBS) {
        const oldest = jobs.keys().next().value;
        jobs.delete(oldest);
    }
}

function create(params) {
    const id = crypto.randomBytes(9).toString('base64url');
    jobs.set(id, {
        id,
        status: 'running',
        params,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        summary: null,
        error: null,
    });
    prune();
    return id;
}

function succeed(id, summary) {
    const job = jobs.get(id);
    if (!job) return;
    job.status = 'succeeded';
    job.summary = summary;
    job.finishedAt = new Date().toISOString();
}

function fail(id, err) {
    const job = jobs.get(id);
    if (!job) return;
    job.status = 'failed';
    // Message only — stack traces and driver internals stay in the server log.
    job.error = err && err.message ? err.message : String(err);
    job.finishedAt = new Date().toISOString();
}

function get(id) {
    return jobs.get(id) || null;
}

// Run `fn` detached from the request, recording the outcome against the job.
function run(id, fn) {
    Promise.resolve()
        .then(fn)
        .then(summary => succeed(id, summary))
        .catch(err => {
            console.error(`[mcp] sync job ${id} failed:`, err);
            fail(id, err);
        });
}

module.exports = { create, get, run, succeed, fail };
