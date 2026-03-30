function createTaskRun(db, taskId) {
  const startedAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO task_runs (task_id, started_at, status, result_count)
       VALUES (?, ?, ?, ?)`
    )
    .run(taskId, startedAt, "running", 0);

  return db.prepare("SELECT * FROM task_runs WHERE id = ?").get(result.lastInsertRowid);
}

function finishTaskRun(db, runId, status, resultCount, errorMessage = null) {
  db.prepare(
    `UPDATE task_runs
     SET finished_at = ?,
         status = ?,
         result_count = ?,
         error_message = ?
     WHERE id = ?`
  ).run(new Date().toISOString(), status, resultCount, errorMessage, runId);
}

module.exports = {
  createTaskRun,
  finishTaskRun,
};
