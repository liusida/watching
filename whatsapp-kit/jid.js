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

function normalizeBaseJid(rawJid) {
  const trimmed = String(rawJid || "").trim();
  if (!trimmed) {
    return "";
  }

  const [userPart] = trimmed.split(":");
  if (userPart.includes("@")) {
    return userPart;
  }

  return `${userPart}@s.whatsapp.net`;
}

module.exports = { normalizeJid, normalizeBaseJid };
