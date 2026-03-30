#!/usr/bin/env node

const { createApp } = require("./app");
const { loadTasksDocument, syncTasksFromDocument } = require("./repositories/tasks");
const { runDueTasks } = require("./scheduler");
const { validateEnvForRun } = require("./validate-task");

async function tick() {
  const app = createApp();
  const refreshedDocument = loadTasksDocument(app.config.tasksFilePath, app.config);
  syncTasksFromDocument(app.db, refreshedDocument);
  app.logger.info("Worker tick started.", {
    taskCount: refreshedDocument.tasks?.length || 0,
  });

  try {
    const results = await runDueTasks({
      db: app.db,
      tasks: refreshedDocument.tasks || [],
      serpApiClient: app.serpApiClient,
      openAIClient: app.openAIClient,
      notifier: app.notifier,
      modelName: app.config.openaiModel,
      log: app.logger,
    });

    if (results.length === 0) {
      app.logger.info("No tasks were due on this tick.");
    }
  } finally {
    await app.notifier.disconnect();
  }
}

async function main() {
  const app = createApp();
  validateEnvForRun(app.config);

  let tickInProgress = false;
  app.logger.info("Watching worker started.", {
    pollIntervalMs: app.config.pollIntervalMs,
    tasksFilePath: app.config.tasksFilePath,
  });

  await tick();
  setInterval(async () => {
    if (tickInProgress) {
      app.logger.warn("Skipping worker tick because the previous tick is still running.");
      return;
    }

    tickInProgress = true;
    try {
      await tick();
    } catch (error) {
      app.logger.error("Worker tick failed.", { error: error.message });
    } finally {
      tickInProgress = false;
    }
  }, app.config.pollIntervalMs);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
