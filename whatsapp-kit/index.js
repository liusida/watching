/**
 * Self-contained WhatsApp (Baileys) helpers — copy this entire folder into another Node project.
 * See README.md in this directory.
 */

const { ensureDir } = require("./ensure-dir");
const { getWaWebVersion } = require("./version");
const { normalizeJid, normalizeBaseJid } = require("./jid");
const { BaileysNotifier } = require("./notifier");
const { runPairWhatsApp } = require("./pair");
const { runListWhatsAppGroups } = require("./list-groups");
const { hasUsableAuthSession } = require("./auth-session");

module.exports = {
  ensureDir,
  getWaWebVersion,
  normalizeJid,
  normalizeBaseJid,
  hasUsableAuthSession,
  BaileysNotifier,
  runPairWhatsApp,
  runListWhatsAppGroups,
};
