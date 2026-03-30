const fs = require("fs");
const path = require("path");
const cronParser = require("cron-parser");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureParentDir(filePath) {
  ensureDir(path.dirname(filePath));
}

function readJsonFile(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return fallbackValue;
  }

  return JSON.parse(raw);
}

function writeJsonFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function slugifyTaskName(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      parsed._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
}

function safeJsonParse(rawValue, fallbackValue) {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    return fallbackValue;
  }
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) {
    return "";
  }

  try {
    const parsed = new URL(rawUrl);
    const removableParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ved",
      "ei",
    ];

    for (const paramName of removableParams) {
      parsed.searchParams.delete(paramName);
    }

    parsed.hash = "";
    return parsed.toString();
  } catch (error) {
    return String(rawUrl).trim();
  }
}

function makeDedupeKey(candidate) {
  const normalizedUrl = normalizeUrl(candidate.url);
  if (normalizedUrl) {
    return normalizedUrl;
  }

  const title = String(candidate.title || "").trim().toLowerCase();
  const source = String(candidate.source || "").trim().toLowerCase();
  const publishedAt = String(candidate.publishedAt || "").trim();
  return `${title}::${source}::${publishedAt}`;
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function parseIntervalSchedule(schedule) {
  const normalized = String(schedule || "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "daily") {
    return 24 * 60 * 60 * 1000;
  }

  if (normalized === "hourly") {
    return 60 * 60 * 1000;
  }

  const match = normalized.match(/^every\s+(\d+)\s*(m|minute|minutes|h|hour|hours|d|day|days)$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const minuteUnits = new Set(["m", "minute", "minutes"]);
  const hourUnits = new Set(["h", "hour", "hours"]);
  const dayUnits = new Set(["d", "day", "days"]);

  if (minuteUnits.has(unit)) {
    return amount * 60 * 1000;
  }

  if (hourUnits.has(unit)) {
    return amount * 60 * 60 * 1000;
  }

  if (dayUnits.has(unit)) {
    return amount * 24 * 60 * 60 * 1000;
  }

  return null;
}

function isCronSchedule(schedule) {
  return String(schedule || "")
    .trim()
    .split(/\s+/)
    .length === 5;
}

function isTaskDue(schedule, lastRunAt, now = new Date()) {
  if (!schedule) {
    return true;
  }

  if (!lastRunAt) {
    return true;
  }

  const lastRunDate = new Date(lastRunAt);
  if (Number.isNaN(lastRunDate.getTime())) {
    return true;
  }

  const intervalMs = parseIntervalSchedule(schedule);
  if (intervalMs) {
    return now.getTime() - lastRunDate.getTime() >= intervalMs;
  }

  if (isCronSchedule(schedule)) {
    try {
      const interval = cronParser.parseExpression(schedule, {
        currentDate: now,
      });
      const previousRun = interval.prev().toDate();
      return lastRunDate.getTime() < previousRun.getTime();
    } catch (error) {
      return false;
    }
  }

  return false;
}

function compactWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retryAsync(action, options = {}) {
  const retries = options.retries ?? 2;
  const delayMs = options.delayMs ?? 1000;
  const shouldRetry = options.shouldRetry || (() => true);
  const onRetry = options.onRetry || (() => {});

  let attempt = 0;
  while (true) {
    try {
      return await action(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) {
        throw error;
      }

      onRetry(error, attempt + 1);
      await sleep(delayMs * (attempt + 1));
      attempt += 1;
    }
  }
}

module.exports = {
  compactWhitespace,
  ensureDir,
  ensureParentDir,
  formatDateTime,
  isCronSchedule,
  isTaskDue,
  makeDedupeKey,
  normalizeUrl,
  parseArgs,
  parseIntervalSchedule,
  readJsonFile,
  retryAsync,
  safeJsonParse,
  sleep,
  slugifyTaskName,
  writeJsonFile,
};
