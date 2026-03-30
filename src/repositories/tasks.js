const { readJsonFile, writeJsonFile } = require("../utils");

function defaultTaskDocument() {
  return { tasks: [] };
}

function normalizeTask(task, defaults = {}) {
  return {
    name: task.name,
    goal: task.goal,
    schedule: task.schedule || "daily",
    criteria:
      task.criteria ||
      "Notify only when the result is clearly relevant and important enough to act on.",
    locale: task.locale || defaults.defaultLocale || "en-US",
    enabled: task.enabled !== false,
    queryPlan: task.queryPlan || {
      engine: defaults.defaultEngine || "google_news",
      locale: task.locale || defaults.defaultLocale || "en-US",
      country: defaults.defaultCountry || "us",
      maxResultsPerQuery: defaults.defaultMaxResults || 5,
      queries: [],
    },
    notify: task.notify || {},
  };
}

function loadTasksDocument(filePath, defaults = {}) {
  const doc = readJsonFile(filePath, defaultTaskDocument());
  if (Array.isArray(doc)) {
    return {
      tasks: doc.map((task) => normalizeTask(task, defaults)),
    };
  }

  return {
    tasks: (doc.tasks || []).map((task) => normalizeTask(task, defaults)),
  };
}

function saveTasksDocument(filePath, document, defaults = {}) {
  const payload = {
    tasks: (document.tasks || []).map((task) => normalizeTask(task, defaults)),
  };
  writeJsonFile(filePath, payload);
}

function getTaskByName(document, taskName) {
  return (document.tasks || []).find((task) => task.name === taskName) || null;
}

function upsertTask(db, task) {
  const statement = db.prepare(`
    INSERT INTO tasks (
      name,
      goal,
      enabled,
      schedule,
      criteria,
      locale,
      query_plan_json,
      updated_at
    )
    VALUES (
      @name,
      @goal,
      @enabled,
      @schedule,
      @criteria,
      @locale,
      @query_plan_json,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(name) DO UPDATE SET
      goal = excluded.goal,
      enabled = excluded.enabled,
      schedule = excluded.schedule,
      criteria = excluded.criteria,
      locale = excluded.locale,
      query_plan_json = excluded.query_plan_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  statement.run({
    name: task.name,
    goal: task.goal,
    enabled: task.enabled ? 1 : 0,
    schedule: task.schedule,
    criteria: task.criteria,
    locale: task.locale || "",
    query_plan_json: JSON.stringify(task.queryPlan || {}),
  });

  return db
    .prepare("SELECT * FROM tasks WHERE name = ?")
    .get(task.name);
}

function syncTasksFromDocument(db, document) {
  const synced = [];
  for (const task of document.tasks || []) {
    synced.push(upsertTask(db, task));
  }
  return synced;
}

function listTasks(db) {
  return db.prepare("SELECT * FROM tasks ORDER BY name ASC").all();
}

function getTaskRowByName(db, taskName) {
  return db.prepare("SELECT * FROM tasks WHERE name = ?").get(taskName);
}

function getLastRunForTask(db, taskId) {
  return db
    .prepare(
      `SELECT *
       FROM task_runs
       WHERE task_id = ?
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(taskId);
}

module.exports = {
  getLastRunForTask,
  getTaskByName,
  getTaskRowByName,
  listTasks,
  loadTasksDocument,
  normalizeTask,
  saveTasksDocument,
  syncTasksFromDocument,
  upsertTask,
};
