const fs = require("fs");
const path = require("path");

function formatLine(prefix, message, extra) {
  if (extra === undefined) {
    return `${prefix} ${message}`;
  }

  return `${prefix} ${message} ${JSON.stringify(extra, null, 2)}`;
}

function appendToLogFile(logFilePath, line) {
  if (!logFilePath) {
    return;
  }

  fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
  fs.appendFileSync(logFilePath, `${line}\n`, "utf8");
}

function createLogger(scope, options = {}) {
  const debugEnabled = options.debugEnabled !== false;
  const logFilePath = options.logFilePath || "";

  function emit(level, message, extra) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${scope}]`;
    const line = formatLine(prefix, message, extra);
    console.log(line);
    appendToLogFile(logFilePath, line);
  }

  return {
    debug(message, extra) {
      if (!debugEnabled) {
        return;
      }
      emit("DEBUG", message, extra);
    },
    info(message, extra) {
      emit("INFO", message, extra);
    },
    warn(message, extra) {
      emit("WARN", message, extra);
    },
    error(message, extra) {
      emit("ERROR", message, extra);
    },
    log(message, extra) {
      emit("INFO", message, extra);
    },
  };
}

module.exports = {
  createLogger,
};
