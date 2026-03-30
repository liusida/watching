const { getLastRunForTask } = require("./repositories/tasks");
const { isTaskDue } = require("./utils");
const { runTask } = require("./task-runner");

async function runDueTasks({ db, tasks, serpApiClient, openAIClient, notifier, modelName, log = console }) {
  const now = new Date();
  const results = [];
  let skippedCount = 0;

  for (const task of tasks) {
    if (task.enabled === false) {
      skippedCount += 1;
      log.debug(`Skipping disabled task "${task.name}"`);
      continue;
    }

    const taskRow = db.prepare("SELECT * FROM tasks WHERE name = ?").get(task.name);
    const lastRun = taskRow ? getLastRunForTask(db, taskRow.id) : null;
    const shouldRun = isTaskDue(task.schedule, lastRun?.started_at, now);

    if (!shouldRun) {
      skippedCount += 1;
      log.debug(`Task "${task.name}" is not due yet.`, {
        schedule: task.schedule,
        lastRunAt: lastRun?.started_at || null,
      });
      continue;
    }

    log.info(`Running scheduled task "${task.name}"`);
    const result = await runTask({
      db,
      task,
      serpApiClient,
      openAIClient,
      notifier,
      modelName,
      log,
    });
    results.push(result);
  }

  log.info("Scheduler tick finished.", {
    dueTaskCount: results.length,
    skippedCount,
  });

  return results;
}

module.exports = {
  runDueTasks,
};
