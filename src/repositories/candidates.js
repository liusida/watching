function insertCandidate(db, taskRunId, candidate) {
  const result = db
    .prepare(
      `INSERT INTO candidates (
         task_run_id,
         source_url,
         normalized_url,
         title,
         snippet,
         source,
         published_at,
         dedupe_key,
         raw_payload_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      taskRunId,
      candidate.url || "",
      candidate.normalizedUrl || "",
      candidate.title || "",
      candidate.snippet || "",
      candidate.source || "",
      candidate.publishedAt || "",
      candidate.dedupeKey,
      JSON.stringify(candidate.raw || {})
    );

  return db.prepare("SELECT * FROM candidates WHERE id = ?").get(result.lastInsertRowid);
}

function insertDecision(db, candidateId, decision, model) {
  const decidedAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO decisions (
         candidate_id,
         match,
         confidence,
         reason,
         model,
         raw_response_json,
         decided_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      candidateId,
      decision.match ? 1 : 0,
      decision.confidence,
      decision.reason,
      model,
      JSON.stringify(decision.raw || decision),
      decidedAt
    );

  return db.prepare("SELECT * FROM decisions WHERE id = ?").get(result.lastInsertRowid);
}

function hasSeenItem(db, taskId, dedupeKey) {
  const row = db
    .prepare("SELECT id FROM seen_items WHERE task_id = ? AND dedupe_key = ?")
    .get(taskId, dedupeKey);
  return Boolean(row);
}

function markSeenItem(db, taskId, dedupeKey) {
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO seen_items (task_id, dedupe_key, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(task_id, dedupe_key) DO UPDATE SET
       last_seen_at = excluded.last_seen_at`
  ).run(taskId, dedupeKey, timestamp, timestamp);
}

module.exports = {
  hasSeenItem,
  insertCandidate,
  insertDecision,
  markSeenItem,
};
