#!/usr/bin/env node

const { createApp } = require("../app");
const {
  getTaskByName,
  normalizeTask,
  saveTasksDocument,
  upsertTask,
} = require("../repositories/tasks");
const { parseArgs, slugifyTaskName } = require("../utils");

function printUsage() {
  console.log(
    [
      "Usage:",
      '  node src/commands/add-task.js --goal "Notify me about Kimi IPO timing" [--name kimi-ipo-date] [--schedule "every 12 hours"] [--criteria "..."] [--locale en-US] [--destination 1234567890]',
      "",
      "Notes:",
      "  - Generates a query plan with OpenAI and stores it in config/tasks.json.",
      "  - Use --replace to overwrite an existing task with the same name.",
    ].join("\n")
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.goal) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const app = createApp();

  try {
    const taskName = args.name || slugifyTaskName(args.goal);
    app.logger.info("add-task command started.", {
      taskName,
      replace: Boolean(args.replace),
    });

    if (!taskName) {
      throw new Error("Unable to derive a task name. Pass --name explicitly.");
    }

    const existing = getTaskByName(app.taskDocument, taskName);
    if (existing && !args.replace) {
      throw new Error(`Task "${taskName}" already exists. Re-run with --replace to overwrite it.`);
    }

    const criteria =
      args.criteria ||
      "Notify only when the result is credible and materially relevant to the task goal. Prefer official announcements, filings, exchange references, or strong reporting over weak speculation.";

    const taskDraft = normalizeTask(
      {
        name: taskName,
        goal: args.goal,
        schedule: args.schedule || "daily",
        criteria,
        locale: args.locale || app.config.defaultLocale,
        enabled: args.enabled !== "false",
        notify: {
          destination: args.destination || app.config.whatsappJid || "",
        },
      },
      app.config
    );

    console.log(`Generating query plan for task "${taskDraft.name}"...`);
    const generatedPlan = await app.openAIClient.generateQueryPlan(taskDraft);
    taskDraft.queryPlan = {
      engine: generatedPlan.engine,
      hl: generatedPlan.hl,
      gl: generatedPlan.gl,
      maxResultsPerQuery: generatedPlan.maxResultsPerQuery,
      summary: generatedPlan.summary,
      queries: generatedPlan.queries,
    };

    const nextTasks = (app.taskDocument.tasks || []).filter((task) => task.name !== taskDraft.name);
    nextTasks.push(taskDraft);
    nextTasks.sort((left, right) => left.name.localeCompare(right.name));

    saveTasksDocument(
      app.config.tasksFilePath,
      {
        tasks: nextTasks,
      },
      app.config
    );
    upsertTask(app.db, taskDraft);

    app.logger.info("Task saved.", {
      taskName: taskDraft.name,
      queryCount: taskDraft.queryPlan.queries.length,
      schedule: taskDraft.schedule,
    });
    console.log(`Task "${taskDraft.name}" saved to ${app.config.tasksFilePath}`);
    console.log(JSON.stringify(taskDraft, null, 2));
  } finally {
    app.db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
