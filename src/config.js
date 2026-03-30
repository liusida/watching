const path = require("path");
const dotenv = require("dotenv");

const rootPath = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(rootPath, ".env"), quiet: true });

function numberFromEnv(name, fallbackValue) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallbackValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function getConfig() {
  return {
    rootPath,
    serpapiApiKey: process.env.SERPAPI_API_KEY || "",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    tasksFilePath: process.env.TASKS_FILE_PATH || path.join(rootPath, "config", "tasks.json"),
    dbPath: process.env.DB_PATH || path.join(rootPath, "data", "watching.db"),
    logFilePath: process.env.LOG_FILE_PATH || path.join(rootPath, "logs", "watching.log"),
    baileysAuthPath: process.env.BAILEYS_AUTH_PATH || path.join(rootPath, "auth", "baileys"),
    whatsappJid: process.env.WHATSAPP_JID || "",
    pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", 60_000),
    defaultEngine: process.env.SERPAPI_ENGINE || "google_news",
    defaultLocale: process.env.DEFAULT_LOCALE || "en-US",
    defaultCountry: process.env.DEFAULT_COUNTRY || "us",
    defaultMaxResults: numberFromEnv("DEFAULT_MAX_RESULTS", 5),
    dryRunNotify: process.env.DRY_RUN_NOTIFY === "1",
    debugEnabled: process.env.DEBUG !== "0",
  };
}

module.exports = {
  getConfig,
};
