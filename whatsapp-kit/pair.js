const fs = require("fs");
const pino = require("pino");
const QRCode = require("qrcode");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { getWaWebVersion } = require("./version");
const { normalizeBaseJid } = require("./jid");
const { ensureDir } = require("./ensure-dir");
const { hasUsableAuthSession } = require("./auth-session");

const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 8;
/** Let Baileys `creds.update` / `saveCreds` finish before closing; avoids half-written auth if the user hits Ctrl+C too early. */
const POST_OPEN_FLUSH_MS = 2500;

function printQrToTerminal(qr) {
  return new Promise((resolve, reject) => {
    QRCode.toString(qr, { type: "terminal", small: true }, (err, str) => {
      if (err) {
        reject(err);
        return;
      }
      console.log("\nScan this QR with WhatsApp → Linked devices → Link a device\n");
      console.log(str);
      resolve();
    });
  });
}

function waitForOpenOrRestart(socket, { logger, timeoutMs, authPath, registeredAtStart, resetHint }) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.ev.off("connection.update", onUpdate);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WhatsApp to connect.`));
    }, timeoutMs);

    function onUpdate(update) {
      const { connection, lastDisconnect, qr, isNewLogin } = update;
      logger.debug("Baileys connection update received.", update);

      if (isNewLogin) {
        logger.info("Pairing completed on server; WhatsApp may disconnect once to restart the session.");
      }

      if (qr) {
        void printQrToTerminal(qr).catch((err) => {
          logger.warn("Could not render QR in terminal; raw payload follows.", { error: err.message });
          console.log("\nRaw QR data (if terminal rendering failed):\n", qr, "\n");
        });
      }

      if (connection === "open") {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          socket.ev.off("connection.update", onUpdate);
          resolve("open");
        }
        return;
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode;
        const boomMsg = lastDisconnect?.error?.message || "";

        clearTimeout(timeout);

        if (statusCode === DisconnectReason.loggedOut) {
          if (!settled) {
            settled = true;
            socket.ev.off("connection.update", onUpdate);
            const hint =
              resetHint ||
              "Clear that folder and run your pair command again (or use its --reset flag if it has one).";
            const message = !registeredAtStart
              ? [
                  "WhatsApp returned 401 before linking finished — usually stale or partial files in your auth folder",
                  `(e.g. after an interrupted pairing). Remove the folder: ${authPath}.`,
                  hint,
                ].join(" ")
              : [
                  "Saved session was rejected (401). It is no longer valid on WhatsApp.",
                  `Replace or remove: ${authPath}.`,
                  hint,
                ].join(" ");
            reject(new Error(message));
          }
          return;
        }

        logger.debug("Baileys connection closed before open; will retry with a new socket.", {
          statusCode,
          message: boomMsg,
        });
        if (!settled) {
          settled = true;
          socket.ev.off("connection.update", onUpdate);
          resolve("restart");
        }
      }
    }

    socket.ev.on("connection.update", onUpdate);
  });
}

/**
 * QR-link a Baileys session folder. Stops after the socket reports open and prints JID lines to stdout.
 *
 * @param {object} options
 * @param {string} options.authPath
 * @param {boolean} [options.reset] — delete authPath contents before pairing
 * @param {{ info: Function, warn: Function, debug: Function }} options.logger
 * @param {string} [options.resetHint] — appended to 401 errors (e.g. "Or run: npm run pair-whatsapp -- --reset")
 */
async function runPairWhatsApp(options) {
  const { authPath, reset, logger, resetHint } = options;

  if (!authPath) {
    throw new Error("authPath is required.");
  }

  if (reset) {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }
    logger.info("whatsapp-kit pair: auth directory cleared (--reset).", { authPath });
  }

  ensureDir(authPath);
  logger.info("whatsapp-kit pair started.", { authPath, reset: Boolean(reset) });

  const version = await getWaWebVersion(logger);
  const socketLogger = pino({ level: "silent" });

  let reconnectAttempt = 0;
  let socket;

  while (reconnectAttempt <= MAX_RECONNECT_ATTEMPTS) {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const hadSessionAtStart = hasUsableAuthSession(state.creds);

    if (reconnectAttempt === 0) {
      if (hadSessionAtStart) {
        logger.info("Existing linked session found on disk (opening without new QR).");
      } else {
        logger.info("No session yet — waiting for QR from WhatsApp.");
      }
    } else {
      logger.info("Reconnecting after WhatsApp restart signal.", { attempt: reconnectAttempt });
    }

    socket = makeWASocket({
      auth: state,
      version,
      logger: socketLogger,
      syncFullHistory: false,
      markOnlineOnConnect: true,
    });

    socket.ev.on("creds.update", saveCreds);

    const timeoutMs = hadSessionAtStart ? 120000 : 180000;

    const outcome = await waitForOpenOrRestart(socket, {
      logger,
      timeoutMs,
      authPath,
      registeredAtStart: hadSessionAtStart,
      resetHint,
    });

    if (outcome === "open") {
      const rawJid = socket.user?.id || "";
      const baseJid = normalizeBaseJid(rawJid);

      const pushName = (socket.user?.name || "").trim() || "(not reported yet — normal right after link)";

      logger.info("WhatsApp pairing/connection succeeded.", {
        rawJid,
        baseJid,
        name: socket.user?.name || "",
      });
      console.log(
        [
          "",
          "—— Linked session (read-only; nothing to type here) ——",
          `  Raw JID:   ${rawJid}`,
          `  Base JID:  ${baseJid}   ← optional reference; put group/user JIDs in each task’s notify.destination`,
          `  Push name: ${pushName}`,
          "",
        ].join("\n")
      );
      break;
    }

    if (typeof socket.end === "function") {
      socket.end(undefined);
    }

    reconnectAttempt += 1;
    if (reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
      throw new Error(
        `WhatsApp closed the connection too many times before opening (${MAX_RECONNECT_ATTEMPTS} attempts). Check network, stop other Baileys users of this auth folder, or clear the auth folder and retry.`
      );
    }

    await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
  }

  logger.info("Waiting for session files to finish writing before closing the socket.", {
    waitMs: POST_OPEN_FLUSH_MS,
  });
  console.log(
    `\nKeeping the connection open for ${POST_OPEN_FLUSH_MS / 1000}s so credentials can flush — avoid Ctrl+C until this finishes.\n`
  );
  await new Promise((r) => setTimeout(r, POST_OPEN_FLUSH_MS));

  console.log(
    [
      "Done. Session is saved in your auth folder.",
      "You do not need to run the pair command again unless you unlink this device in WhatsApp or delete that folder.",
      "Use the worker / list-groups next — not pair-whatsapp every time.",
      "",
    ].join("\n")
  );

  if (typeof socket.end === "function") {
    socket.end(undefined);
  }
}

module.exports = { runPairWhatsApp, RECONNECT_DELAY_MS, MAX_RECONNECT_ATTEMPTS };
