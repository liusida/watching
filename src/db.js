const Database = require("better-sqlite3");
const { ensureParentDir } = require("./utils");

let singletonDb = null;

function initializeDb(dbPath) {
  ensureParentDir(dbPath);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      goal TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      schedule TEXT NOT NULL,
      criteria TEXT NOT NULL,
      locale TEXT,
      query_plan_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE TABLE IF NOT EXISTS candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_run_id INTEGER NOT NULL,
      source_url TEXT,
      normalized_url TEXT,
      title TEXT,
      snippet TEXT,
      source TEXT,
      published_at TEXT,
      dedupe_key TEXT NOT NULL,
      raw_payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_run_id) REFERENCES task_runs(id)
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      match INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      reason TEXT NOT NULL,
      model TEXT NOT NULL,
      raw_response_json TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      candidate_id INTEGER NOT NULL,
      channel TEXT NOT NULL,
      destination TEXT,
      status TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      error_message TEXT,
      raw_response_json TEXT,
      FOREIGN KEY (candidate_id) REFERENCES candidates(id)
    );

    CREATE TABLE IF NOT EXISTS seen_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      dedupe_key TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE (task_id, dedupe_key),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_runs_task_id ON task_runs(task_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_task_run_id ON candidates(task_run_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_dedupe_key ON candidates(dedupe_key);
    CREATE INDEX IF NOT EXISTS idx_decisions_candidate_id ON decisions(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_candidate_id ON notifications(candidate_id);
    CREATE INDEX IF NOT EXISTS idx_seen_items_task_id ON seen_items(task_id);
  `);

  return db;
}

function getDb(dbPath) {
  if (!singletonDb) {
    singletonDb = initializeDb(dbPath);
  }

  return singletonDb;
}

module.exports = {
  getDb,
};
