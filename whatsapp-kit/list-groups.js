const pino = require("pino");
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const { getWaWebVersion } = require("./version");
const { ensureDir } = require("./ensure-dir");
const { hasUsableAuthSession } = require("./auth-session");

/**
 * Connect with saved creds and return participating groups (sorted by subject).
 *
 * @param {object} options
 * @param {string} options.authPath
 * @param {{ info: Function, warn: Function, debug: Function }} options.logger
 * @param {string} [options.notPairedMessage] — error when !registered
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ groups: Array<{ subject: string, jid: string, owner: string, participants: number, announce: boolean }> }>}
 */
async function runListWhatsAppGroups(options) {
  const { authPath, logger, notPairedMessage, timeoutMs = 120000 } = options;

  if (!authPath) {
    throw new Error("authPath is required.");
  }

  ensureDir(authPath);
  logger.info("whatsapp-kit list-groups started.", { authPath });

  const { state, saveCreds } = await useMultiFileAuthState(authPath);
  if (!hasUsableAuthSession(state.creds)) {
    throw new Error(notPairedMessage || "This auth path is not paired yet. Run pair first.");
  }

  const version = await getWaWebVersion(logger);
  const socketLogger = pino({ level: "silent" });

  const socket = makeWASocket({
    auth: state,
    version,
    logger: socketLogger,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  socket.ev.on("creds.update", saveCreds);

  await new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.ev.off("connection.update", onConnectionUpdate);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WhatsApp to connect.`));
    }, timeoutMs);

    function onConnectionUpdate(update) {
      const { connection, lastDisconnect } = update;
      logger.debug("Baileys connection update received.", update);

      if (connection === "open") {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          socket.ev.off("connection.update", onConnectionUpdate);
          resolve();
        }
        return;
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.data?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const message = isLoggedOut
          ? "WhatsApp session is logged out. Pair this auth folder again."
          : "WhatsApp connection closed before group listing completed.";

        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          socket.ev.off("connection.update", onConnectionUpdate);
          reject(new Error(message));
        }
      }
    }

    socket.ev.on("connection.update", onConnectionUpdate);
  });

  const groupsMap = await socket.groupFetchAllParticipating();
  const groups = Object.values(groupsMap)
    .map((group) => ({
      subject: group.subject || "",
      jid: group.id || "",
      owner: group.owner || "",
      participants: Array.isArray(group.participants) ? group.participants.length : 0,
      announce: Boolean(group.announce),
    }))
    .sort((left, right) => left.subject.localeCompare(right.subject));

  logger.info("WhatsApp groups fetched.", { count: groups.length });

  socket.ev.off("creds.update", saveCreds);
  if (typeof socket.end === "function") {
    socket.end(undefined);
  }

  return { groups };
}

module.exports = { runListWhatsAppGroups };
