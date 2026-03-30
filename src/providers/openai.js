const OpenAI = require("openai");
const { compactWhitespace } = require("../utils");

function buildQueryPlanSchema(defaults) {
  return {
    name: "task_query_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        engine: { type: "string" },
        hl: { type: "string" },
        gl: { type: "string" },
        maxResultsPerQuery: { type: "integer" },
        queries: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              query: { type: "string" },
              reason: { type: "string" },
            },
            required: ["query", "reason"],
          },
        },
      },
      required: ["summary", "engine", "hl", "gl", "maxResultsPerQuery", "queries"],
    },
  };
}

function buildDecisionSchema() {
  return {
    name: "candidate_decision",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        match: { type: "boolean" },
        confidence: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        reason: { type: "string" },
        extractedSignals: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["match", "confidence", "reason", "extractedSignals"],
    },
  };
}

function buildQueryPlanMessages(taskInput, defaults) {
  return [
    {
      role: "system",
      content:
        "You generate search plans for a personal monitoring task. Emit **exactly one** query string per plan (one SerpApi call per run). Make that single query specific enough for google_news recall without being redundant. Use google_news unless the task clearly needs generic web search.",
    },
    {
      role: "user",
      content: [
        `Task name: ${taskInput.name}`,
        `Goal: ${taskInput.goal}`,
        `Criteria: ${taskInput.criteria}`,
        `Preferred locale: ${taskInput.locale || defaults.defaultLocale}`,
        `Preferred country: ${defaults.defaultCountry}`,
        `Default engine: ${defaults.defaultEngine}`,
        `Default max results per query: ${defaults.defaultMaxResults}`,
        "Return one combined query only (the queries array must have length 1).",
      ].join("\n"),
    },
  ];
}

function buildDecisionMessages(task, candidate) {
  return [
    {
      role: "system",
      content:
        "You evaluate whether a search result is worth notifying the user about. Be conservative. " +
        "match=true with confidence high only when the article (title/snippet implied meaning) satisfies the task criteria as written — not merely the same topic. " +
        "If the task demands concrete dates, filings, or confirmed timelines, vague 'company may IPO' / 'eyes listing' stories WITHOUT a specific date or named regulatory filing must be match=false or at most confidence medium (never high). " +
        "Do not treat crypto tokens or unrelated stocks named 'moonshot' as matches for Chinese AI company news.",
    },
    {
      role: "user",
      content: [
        `Task name: ${task.name}`,
        `Task goal: ${task.goal}`,
        `Task criteria: ${task.criteria}`,
        `Search query: ${candidate.query}`,
        `Candidate title: ${candidate.title}`,
        `Candidate snippet: ${candidate.snippet}`,
        `Candidate source: ${candidate.source}`,
        `Candidate published_at: ${candidate.publishedAt}`,
        `Candidate url: ${candidate.url}`,
        "Return JSON only.",
      ].join("\n"),
    },
  ];
}

class OpenAIClient {
  constructor(apiKey, model, defaults, logger = console) {
    this.apiKey = apiKey;
    this.model = model || "gpt-4o-mini";
    this.defaults = defaults;
    this.logger = logger;
    this.client = new OpenAI({ apiKey });
  }

  async generateQueryPlan(taskInput) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const messages = buildQueryPlanMessages(taskInput, this.defaults);
    this.logger.debug(`Generating query plan for task "${taskInput.name}"`, {
      locale: taskInput.locale || this.defaults.defaultLocale,
      defaultEngine: this.defaults.defaultEngine,
    });
    this.logger.debug(`OpenAI query-plan prompt for task "${taskInput.name}"`, {
      model: this.model,
      messages,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: {
        type: "json_schema",
        json_schema: buildQueryPlanSchema(this.defaults),
      },
      messages,
    });

    const content = response.choices?.[0]?.message?.content;
    const plan = JSON.parse(content);
    this.logger.debug(`Generated query plan for task "${taskInput.name}"`, {
      queryCount: plan.queries?.length || 0,
      engine: plan.engine || this.defaults.defaultEngine,
      response: plan,
    });
    return {
      summary: compactWhitespace(plan.summary),
      engine: plan.engine || this.defaults.defaultEngine,
      hl: plan.hl || this.defaults.defaultLocale.split("-")[0].toLowerCase(),
      gl: (plan.gl || this.defaults.defaultCountry).toLowerCase(),
      maxResultsPerQuery: Number(plan.maxResultsPerQuery) || this.defaults.defaultMaxResults,
      queries: (plan.queries || []).map((queryDefinition) => ({
        query: compactWhitespace(queryDefinition.query),
        reason: compactWhitespace(queryDefinition.reason),
      })),
      raw: plan,
    };
  }

  async evaluateCandidate(task, candidate) {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is missing.");
    }

    const messages = buildDecisionMessages(task, candidate);
    this.logger.debug(`Evaluating candidate with OpenAI for task "${task.name}"`, {
      title: candidate.title,
      source: candidate.source,
      query: candidate.query,
    });
    this.logger.debug(`OpenAI evaluation prompt for task "${task.name}"`, {
      model: this.model,
      messages,
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: {
        type: "json_schema",
        json_schema: buildDecisionSchema(),
      },
      messages,
    });

    const content = response.choices?.[0]?.message?.content;
    const decision = JSON.parse(content);
    this.logger.debug(`OpenAI evaluation finished for task "${task.name}"`, {
      title: candidate.title,
      match: decision.match,
      confidence: decision.confidence,
      response: decision,
    });
    return {
      match: Boolean(decision.match),
      confidence: decision.confidence || "low",
      reason: compactWhitespace(decision.reason),
      extractedSignals: Array.isArray(decision.extractedSignals)
        ? decision.extractedSignals.map((item) => compactWhitespace(item))
        : [],
      raw: decision,
    };
  }
}

module.exports = {
  OpenAIClient,
};
