function insertNotification(db, candidateId, payload) {
  const result = db
    .prepare(
      `INSERT INTO notifications (
         candidate_id,
         channel,
         destination,
         status,
         sent_at,
         error_message,
         raw_response_json
       )
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      candidateId,
      payload.channel,
      payload.destination || "",
      payload.status,
      new Date().toISOString(),
      payload.errorMessage || null,
      payload.rawResponse ? JSON.stringify(payload.rawResponse) : null
    );

  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(result.lastInsertRowid);
}

module.exports = {
  insertNotification,
};
