#!/usr/bin/env node

const { runPairWhatsApp } = require("../../whatsapp-kit");
const { getConfig } = require("../config");
const { createLogger } = require("../logger");
const { ensureDir, parseArgs } = require("../utils");

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node src/commands/pair-whatsapp.js [--auth-path PATH] [--reset]",
      "",
      "Examples:",
      "  npm run pair-whatsapp",
      "  npm run pair-whatsapp -- --reset",
      "  node src/commands/pair-whatsapp.js --auth-path /srv/baileys/session",
      "",
      "Notes:",
      "  - Core logic lives in whatsapp-kit/ (copy that folder to reuse in other projects).",
      "  - If the auth path is not linked yet, a QR code is printed in the terminal.",
      "  - In WhatsApp: Settings → Linked devices → Link a device → scan the QR.",
      "  - Stop the watching worker (or anything else using the same auth folder) before pairing.",
      "  - If linking fails with 401, try: npm run pair-whatsapp -- --reset",
      "  - After success, wait until the script says it is done (few seconds) before Ctrl+C so the session saves.",
      "  - You only need pair-whatsapp once per auth folder; then use the worker or list-whatsapp-groups.",
    ].join("\n")
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const positional = args._[0];
  if (positional && /^\+?\d[\d\s\-]{6,}$/.test(String(positional).trim())) {
    console.warn(
      "Ignoring phone-style argument; QR linking does not use a phone number on the command line.\n"
    );
  }

  const config = getConfig();
  const logger = createLogger("pair-whatsapp", {
    debugEnabled: config.debugEnabled,
    logFilePath: config.logFilePath,
  });

  const authPath = args["auth-path"] || config.baileysAuthPath;
  if (!authPath) {
    throw new Error("No auth path available. Set BAILEYS_AUTH_PATH or pass --auth-path.");
  }

  ensureDir(authPath);

  await runPairWhatsApp({
    authPath,
    reset: Boolean(args.reset),
    logger,
    resetHint: "Or run: npm run pair-whatsapp -- --reset",
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
