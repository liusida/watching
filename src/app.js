const { getConfig } = require("./config");
const { getDb } = require("./db");
const { loadTasksDocument, syncTasksFromDocument } = require("./repositories/tasks");
const { SerpApiClient } = require("./providers/serpapi");
const { OpenAIClient } = require("./providers/openai");
const { BaileysNotifier } = require("../whatsapp-kit");
const { createLogger } = require("./logger");

function createApp() {
  const config = getConfig();
  const loggerOptions = {
    debugEnabled: config.debugEnabled,
    logFilePath: config.logFilePath,
  };
  const logger = createLogger("app", loggerOptions);
  const db = getDb(config.dbPath);
  const taskDocument = loadTasksDocument(config.tasksFilePath, config);
  syncTasksFromDocument(db, taskDocument);

  const serpApiClient = new SerpApiClient(config.serpapiApiKey, createLogger("serpapi", loggerOptions));
  const openAIClient = new OpenAIClient(
    config.openaiApiKey,
    config.openaiModel,
    config,
    createLogger("openai", loggerOptions)
  );
  const notifier = new BaileysNotifier({
    authPath: config.baileysAuthPath,
    defaultDestination: "",
    dryRun: config.dryRunNotify,
    logger: createLogger("baileys", loggerOptions),
  });

  logger.debug("Application context created.", {
    tasksFilePath: config.tasksFilePath,
    dbPath: config.dbPath,
    taskCount: taskDocument.tasks?.length || 0,
    defaultEngine: config.defaultEngine,
  });

  return {
    config,
    db,
    taskDocument,
    serpApiClient,
    openAIClient,
    notifier,
    logger,
  };
}

module.exports = {
  createApp,
};
