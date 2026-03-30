/**
 * Fail fast before SerpApi/OpenAI calls when a task document is misconfigured.
 */

function validateRunnableTask(task) {
  const label = task?.name ? `"${task.name}"` : "(unnamed)";
  const errors = [];

  if (!task || typeof task.name !== "string" || !task.name.trim()) {
    errors.push("Task must have a non-empty name.");
  }

  if (task.enabled === false) {
    errors.push("Task is disabled (enabled: false).");
  }

  const plan = task.queryPlan;
  if (!plan || typeof plan !== "object") {
    errors.push("Missing queryPlan object.");
  } else {
    if (!plan.engine || !String(plan.engine).trim()) {
      errors.push("queryPlan.engine is required (e.g. google_news).");
    }
    const queries = plan.queries;
    if (!Array.isArray(queries) || queries.length === 0) {
      errors.push("queryPlan.queries must be a non-empty array.");
    } else {
      queries.forEach((entry, index) => {
        if (!entry || !String(entry.query || "").trim()) {
          errors.push(`queryPlan.queries[${index}] is missing a "query" string.`);
        }
      });
    }
  }

  const dest = task.notify?.destination;
  if (!dest || !String(dest).trim()) {
    errors.push(
      "notify.destination is empty — set a WhatsApp user or group JID (e.g. from npm run list-whatsapp-groups)."
    );
  }

  if (errors.length) {
    throw new Error(`Task ${label} is not ready to run:\n- ${errors.join("\n- ")}`);
  }
}

function validateEnvForRun(config) {
  const errors = [];
  if (!config.serpapiApiKey?.trim()) {
    errors.push("SERPAPI_API_KEY is missing or empty in .env");
  }
  if (!config.openaiApiKey?.trim()) {
    errors.push("OPENAI_API_KEY is missing or empty in .env");
  }
  if (!config.baileysAuthPath?.trim()) {
    errors.push("BAILEYS_AUTH_PATH is missing or empty in .env");
  }
  if (errors.length) {
    throw new Error(`Environment is not ready to run tasks:\n- ${errors.join("\n- ")}`);
  }
}

module.exports = {
  validateRunnableTask,
  validateEnvForRun,
};
