const { getTaskRowByName } = require("./repositories/tasks");
const { createTaskRun, finishTaskRun } = require("./repositories/runs");
const {
  hasSeenItem,
  insertCandidate,
  insertDecision,
  markSeenItem,
} = require("./repositories/candidates");
const { insertNotification } = require("./repositories/notifications");
const { retryAsync } = require("./utils");

async function runTask({
  db,
  task,
  serpApiClient,
  openAIClient,
  notifier,
  modelName,
  log = console,
}) {
  const taskRow = getTaskRowByName(db, task.name);
  if (!taskRow) {
    throw new Error(`Task "${task.name}" is not synced to SQLite.`);
  }

  const taskRun = createTaskRun(db, taskRow.id);
  let storedCandidates = 0;
  let skippedSeenCandidates = 0;
  let notificationsSent = 0;
  let notificationsFailed = 0;

  try {
    const queries = task.queryPlan?.queries || [];
    log.info(`Task "${task.name}" started.`, {
      runId: taskRun.id,
      queryCount: queries.length,
      schedule: task.schedule,
    });

    for (const queryDefinition of queries) {
      log.debug(`Searching for task "${task.name}"`, {
        query: queryDefinition.query,
        reason: queryDefinition.reason,
      });
      const serpCandidates = await retryAsync(
        () =>
          serpApiClient.search({
            query: queryDefinition.query,
            engine: task.queryPlan.engine,
            hl: task.queryPlan.hl,
            gl: task.queryPlan.gl,
            maxResults: task.queryPlan.maxResultsPerQuery,
          }),
        {
          retries: 2,
          delayMs: 1500,
          onRetry: (error, attempt) => {
            log.warn(`Retrying SerpApi query for task "${task.name}"`, {
              query: queryDefinition.query,
              attempt,
              error: error.message,
            });
          },
        }
      );

      log.debug(`Query completed for task "${task.name}"`, {
        query: queryDefinition.query,
        candidateCount: serpCandidates.length,
      });

      for (const candidate of serpCandidates) {
        if (hasSeenItem(db, taskRow.id, candidate.dedupeKey)) {
          skippedSeenCandidates += 1;
          log.debug(`Skipping already-seen candidate for task "${task.name}"`, {
            title: candidate.title,
            dedupeKey: candidate.dedupeKey,
          });
          continue;
        }

        const candidateRow = insertCandidate(db, taskRun.id, candidate);
        storedCandidates += 1;
        log.debug(`Stored new candidate for task "${task.name}"`, {
          candidateId: candidateRow.id,
          title: candidate.title,
          source: candidate.source,
        });

        const decision = await retryAsync(() => openAIClient.evaluateCandidate(task, candidate), {
          retries: 2,
          delayMs: 1500,
          onRetry: (error, attempt) => {
            log.warn(`Retrying OpenAI evaluation for task "${task.name}"`, {
              title: candidate.title,
              attempt,
              error: error.message,
            });
          },
        });
        insertDecision(db, candidateRow.id, decision, modelName);
        markSeenItem(db, taskRow.id, candidate.dedupeKey);
        log.debug(`Decision stored for task "${task.name}"`, {
          candidateId: candidateRow.id,
          title: candidate.title,
          match: decision.match,
          confidence: decision.confidence,
        });

        if (!(decision.match && decision.confidence === "high")) {
          log.debug(`Candidate did not qualify for notification for task "${task.name}"`, {
            title: candidate.title,
            match: decision.match,
            confidence: decision.confidence,
          });
          continue;
        }

        try {
          const notification = await notifier.send(task, candidate, decision);
          insertNotification(db, candidateRow.id, {
            channel: "whatsapp-baileys",
            destination: notification.destination,
            status: "sent",
            rawResponse: notification.raw,
          });
          notificationsSent += 1;
          log.info(`Alert sent for task "${task.name}"`, {
            title: candidate.title,
            destination: notification.destination,
          });
        } catch (error) {
          insertNotification(db, candidateRow.id, {
            channel: "whatsapp-baileys",
            destination: task.notify?.destination || "",
            status: "failed",
            errorMessage: error.message,
          });
          notificationsFailed += 1;
          log.error(`Notification failed for task "${task.name}"`, {
            title: candidate.title,
            error: error.message,
          });
        }
      }
    }

    finishTaskRun(db, taskRun.id, "completed", storedCandidates, null);
    log.info(`Task "${task.name}" completed.`, {
      runId: taskRun.id,
      storedCandidates,
      skippedSeenCandidates,
      notificationsSent,
      notificationsFailed,
    });
    return {
      taskName: task.name,
      status: "completed",
      storedCandidates,
      skippedSeenCandidates,
      notificationsSent,
      notificationsFailed,
    };
  } catch (error) {
    finishTaskRun(db, taskRun.id, "failed", storedCandidates, error.message);
    log.error(`Task "${task.name}" failed.`, {
      runId: taskRun.id,
      storedCandidates,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  runTask,
};
