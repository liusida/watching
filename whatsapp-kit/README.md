# whatsapp-kit

Drop-in **Baileys** helpers: QR pairing CLI flow, list groups, Wa Web version resolution, JID normalization, and a small notifier class (as used by the *watching* project).

## Use in another project

1. Copy this entire folder into your repo (e.g. `whatsapp-kit/` next to your `src/`).
2. Install peers in the **host** `package.json`:

   ```bash
   npm install @whiskeysockets/baileys pino qrcode
   ```

3. Require from your app:

   ```js
   const {
     BaileysNotifier,
     runPairWhatsApp,
     runListWhatsAppGroups,
     normalizeJid,
     getWaWebVersion,
   } = require("../whatsapp-kit");
   ```

4. Add thin CLI scripts that call `runPairWhatsApp` / `runListWhatsAppGroups` with your config and logger.

## API sketch

| Export | Role |
|--------|------|
| `getWaWebVersion(logger)` | Fetches live WA Web revision; falls back to Baileys default. |
| `normalizeJid` / `normalizeBaseJid` | String → WhatsApp JID. |
| `BaileysNotifier` | Connect + send text (expects `authPath`, `defaultDestination`, `logger`, optional `dryRun`). `send(task, candidate, decision)` is tailored to *watching*’s task shape; replace `buildMessage` in a fork if needed. |
| `runPairWhatsApp({ authPath, logger, reset?, resetHint?, pairAgainHint? })` | QR pair until socket opens; prints JID to stdout. |
| `runListWhatsAppGroups({ authPath, logger, notPairedMessage?, timeoutMs? })` | Returns `{ groups: [...] }`. |
| `hasUsableAuthSession(creds)` | True if creds look linked (including **QR** sessions where Baileys leaves `registered: false`). |
| `ensureDir` | `fs.mkdirSync(..., { recursive: true })`. |

## Operational notes

- Only one process should use a given auth directory at a time during pairing.
- After QR scan, WhatsApp often closes once (e.g. 515); `runPairWhatsApp` reconnects automatically.
- After `connection: open`, the runner **waits a few seconds** before closing the socket so `saveCreds` can finish. Avoid **Ctrl+C** during that window, or the next run may ask for QR again.
- Day-to-day use: run **`pair-whatsapp` once**, then use your app / **`runListWhatsAppGroups`** — not pair on every start.
- **CLI scripts** using Baileys should call **`process.exit(0)`** (or `1` on error) after work: Baileys often leaves WebSocket / keep-alive handles open, so Node will otherwise sit at the shell prompt looking “stuck”.

## License

Follow the license of the project you copied this folder from.
