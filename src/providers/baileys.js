const fs = require("fs");
const pino = require("pino");
const {
  default: makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { ensureDir } = require("../utils");

function normalizeJid(rawValue) {
  if (!rawValue) {
    return "";
  }

  const trimmed = String(rawValue).trim();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  return digitsOnly ? `${digitsOnly}@s.whatsapp.net` : "";
}

class BaileysNotifier {
  constructor(options = {}) {
    this.authPath = options.authPath;
    this.defaultDestination = normalizeJid(options.defaultDestination);
    this.dryRun = Boolean(options.dryRun);
    this.logger = options.logger || console;
    this.socket = null;
    this.connected = false;
    this.connectPromise = null;
  }

  hasSessionFiles() {
    if (!this.authPath || !fs.existsSync(this.authPath)) {
      return false;
    }

    const fileNames = fs.readdirSync(this.authPath);
    return fileNames.some((fileName) => fileName.includes("creds"));
  }

  async ensureConnected() {
    if (this.dryRun) {
      this.logger.debug("Baileys dry-run mode enabled; skipping connection.");
      return null;
    }

    if (!this.authPath) {
      throw new Error("BAILEYS_AUTH_PATH is missing.");
    }

    if (this.connected && this.socket) {
      return this.socket;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    ensureDir(this.authPath);
    const logger = pino({ level: "silent" });
    this.logger.debug("Opening Baileys connection.", {
      authPath: this.authPath,
      hasSessionFiles: this.hasSessionFiles(),
    });

    this.connectPromise = (async () => {
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
      const { version } = await fetchLatestBaileysVersion();

      return new Promise((resolve, reject) => {
        const socket = makeWASocket({
          auth: state,
          version,
          logger,
          markOnlineOnConnect: false,
          syncFullHistory: false,
        });

        let resolved = false;
        this.socket = socket;

        socket.ev.on("creds.update", saveCreds);

        socket.ev.on("connection.update", (update) => {
          const { connection, lastDisconnect, qr } = update;

          if (qr) {
            this.logger.warn(
              "Baileys QR received. Reuse an existing auth directory or pair this session manually."
            );
          }

          if (connection === "open") {
            this.connected = true;
            this.connectPromise = null;
            this.logger.info("Baileys connection opened.");
            if (!resolved) {
              resolved = true;
              resolve(socket);
            }
            return;
          }

          if (connection === "close") {
            this.connected = false;
            this.connectPromise = null;

            const statusCode =
              lastDisconnect?.error?.output?.statusCode ||
              lastDisconnect?.error?.data?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            const baseMessage = isLoggedOut
              ? "Baileys session logged out. Re-pair or point BAILEYS_AUTH_PATH at a valid session."
              : "Baileys disconnected before a message could be sent.";
            this.logger.warn(baseMessage);

            if (!resolved) {
              resolved = true;
              reject(new Error(baseMessage));
            }
          }
        });
      });
    })();

    return this.connectPromise;
  }

  buildMessage(task, candidate, decision) {
    const lines = [
      `Watching task: ${task.name}`,
      `Confidence: ${decision.confidence}`,
      `Reason: ${decision.reason}`,
      `Title: ${candidate.title}`,
    ];

    if (candidate.source) {
      lines.push(`Source: ${candidate.source}`);
    }

    if (candidate.url) {
      lines.push(`URL: ${candidate.url}`);
    }

    return lines.join("\n");
  }

  async send(task, candidate, decision) {
    const destination = normalizeJid(task.notify?.destination || this.defaultDestination);
    if (!destination) {
      throw new Error("No WhatsApp destination configured. Set WHATSAPP_JID or task.notify.destination.");
    }

    const message = this.buildMessage(task, candidate, decision);
    this.logger.debug(`Preparing WhatsApp notification for task "${task.name}"`, {
      destination,
      dryRun: this.dryRun,
      candidateTitle: candidate.title,
    });

    if (this.dryRun) {
      return {
        destination,
        messageId: "dry-run",
        raw: { dryRun: true, preview: message },
      };
    }

    if (!this.hasSessionFiles()) {
      throw new Error(
        "No Baileys session files found. Set BAILEYS_AUTH_PATH to an authenticated session directory."
      );
    }

    const socket = await this.ensureConnected();
    const response = await socket.sendMessage(destination, { text: message });
    this.logger.info(`WhatsApp notification sent for task "${task.name}"`, {
      destination,
      messageId: response?.key?.id || "",
    });

    return {
      destination,
      messageId: response?.key?.id || "",
      raw: response,
    };
  }
}

module.exports = {
  BaileysNotifier,
  normalizeJid,
};
