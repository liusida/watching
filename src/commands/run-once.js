#!/usr/bin/env node

const { createApp } = require("../app");
const { runTask } = require("../task-runner");
const { validateEnvForRun, validateRunnableTask } = require("../validate-task");
const { parseArgs } = require("../utils");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node src/commands/run-once.js [--task kimi-ipo-date] [--all]",
      "",
      "Examples:",
      "  node src/commands/run-once.js --task kimi-ipo-date",
      "  node src/commands/run-once.js --all",
    ].join("\n")
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const app = createApp();
  validateEnvForRun(app.config);

  try {
    let tasks = app.taskDocument.tasks || [];

    if (args.task) {
      tasks = tasks.filter((task) => task.name === args.task);
      if (tasks.length === 0) {
        throw new Error(`Task "${args.task}" was not found in ${app.config.tasksFilePath}.`);
      }
    } else if (!args.all && tasks.length > 1) {
      throw new Error("Multiple tasks exist. Pass --task <name> or --all.");
    }

    if (tasks.length === 0) {
      throw new Error("No tasks configured yet. Use add-task first.");
    }

    app.logger.info("run-once command started.", {
      taskCount: tasks.length,
      selectedTask: args.task || null,
    });

    for (const task of tasks) {
      validateRunnableTask(task);
      console.log(`Running task "${task.name}"...`);
      const result = await runTask({
        db: app.db,
        task,
        serpApiClient: app.serpApiClient,
        openAIClient: app.openAIClient,
        notifier: app.notifier,
        modelName: app.config.openaiModel,
        log: app.logger,
      });
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    try {
      await app.notifier.disconnect();
    } catch (err) {
      app.logger.warn("Notifier disconnect failed (non-fatal).", { error: err.message });
    }
    app.db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
