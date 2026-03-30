#!/usr/bin/env node

const { createApp } = require("../app");
const { listTasks, getLastRunForTask } = require("../repositories/tasks");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node src/commands/list-tasks.js",
      "",
      "Examples:",
      "  npm run list-tasks",
      "  node src/commands/list-tasks.js",
    ].join("\n")
  );
}

async function main() {
  const app = createApp();

  try {
    const tasks = listTasks(app.db);
    app.logger.info("list-tasks command started.", {
      taskCount: tasks.length,
    });

    if (tasks.length === 0) {
      console.log("No tasks configured yet.");
      return;
    }

    const output = tasks.map((task) => {
      const lastRun = getLastRunForTask(app.db, task.id);
      return {
        id: task.id,
        name: task.name,
        enabled: Boolean(task.enabled),
        schedule: task.schedule,
        locale: task.locale,
        lastRunAt: lastRun?.started_at || null,
        lastRunStatus: lastRun?.status || null,
        updatedAt: task.updated_at,
      };
    });

    console.table(output);
  } finally {
    app.db.close();
  }
}

if (process.argv.includes("--help")) {
  printUsage();
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
