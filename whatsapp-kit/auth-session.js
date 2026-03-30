/**
 * Whether saved credentials represent a linked WhatsApp session.
 *
 * Baileys sets `registered: true` after **pairing-code** flow, but **QR** pair-success
 * often leaves `registered: false` while `me` + `account` are present — the session is still valid.
 */
function hasUsableAuthSession(creds) {
  if (!creds) {
    return false;
  }
  if (creds.registered === true) {
    return true;
  }
  return Boolean(creds.me?.id && creds.account);
}

module.exports = { hasUsableAuthSession };
