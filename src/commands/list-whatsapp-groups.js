#!/usr/bin/env node

const { runListWhatsAppGroups } = require("../../whatsapp-kit");
const { getConfig } = require("../config");
const { createLogger } = require("../logger");
const { ensureDir, parseArgs } = require("../utils");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node src/commands/list-whatsapp-groups.js [--auth-path /path/to/auth]",
      "",
      "Examples:",
      "  npm run list-whatsapp-groups",
      "  node src/commands/list-whatsapp-groups.js --auth-path /srv/baileys/session",
      "",
      "Notes:",
      "  - Core logic lives in whatsapp-kit/ (copy that folder to reuse in other projects).",
      "  - Requires a valid paired Baileys auth directory.",
    ].join("\n")
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const config = getConfig();
  const logger = createLogger("list-whatsapp-groups", {
    debugEnabled: config.debugEnabled,
    logFilePath: config.logFilePath,
  });

  const authPath = args["auth-path"] || config.baileysAuthPath;
  if (!authPath) {
    throw new Error("No auth path available. Set BAILEYS_AUTH_PATH or pass --auth-path.");
  }

  ensureDir(authPath);
  logger.info("list-whatsapp-groups command started.", { authPath });

  const { groups } = await runListWhatsAppGroups({
    authPath,
    logger,
    notPairedMessage: "This auth path is not paired yet. Run pair-whatsapp first.",
  });

  if (groups.length === 0) {
    console.log("No WhatsApp groups found for this session.");
  } else {
    console.table(groups);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
