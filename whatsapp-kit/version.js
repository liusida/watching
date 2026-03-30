const { fetchLatestWaWebVersion } = require("@whiskeysockets/baileys");

/**
 * Live WhatsApp Web client revision (web.whatsapp.com). Falls back to Baileys’ bundled default on failure.
 *
 * @param {{ warn?: (msg: string, meta?: object) => void } | null} logger
 */
async function getWaWebVersion(logger) {
  const { version, isLatest, error } = await fetchLatestWaWebVersion();
  if (!isLatest && logger?.warn) {
    const errMsg =
      error && typeof error === "object" && error !== null && "message" in error
        ? error.message
        : String(error);
    logger.warn("WhatsApp Web version fetch failed; using bundled Baileys default.", { errMsg });
  }
  return version;
}

module.exports = { getWaWebVersion };
