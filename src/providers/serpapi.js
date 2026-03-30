const { compactWhitespace, makeDedupeKey, normalizeUrl } = require("../utils");

class SerpApiClient {
  constructor(apiKey, logger = console) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async search(queryDefinition) {
    if (!this.apiKey) {
      throw new Error("SERPAPI_API_KEY is missing.");
    }

    const params = new URLSearchParams({
      api_key: this.apiKey,
      engine: queryDefinition.engine || "google_news",
      q: queryDefinition.query,
      hl: queryDefinition.hl || "en",
      gl: queryDefinition.gl || "us",
      num: String(queryDefinition.maxResults || 5),
    });

    this.logger.debug(`SerpApi search started for query "${queryDefinition.query}"`, {
      engine: queryDefinition.engine || "google_news",
      hl: queryDefinition.hl || "en",
      gl: queryDefinition.gl || "us",
      maxResults: queryDefinition.maxResults || 5,
    });

    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SerpApi request failed (${response.status}): ${body}`);
    }

    const payload = await response.json();
    const candidates = this.normalizeResults(payload, queryDefinition);
    this.logger.debug(`SerpApi search finished for query "${queryDefinition.query}"`, {
      candidateCount: candidates.length,
      results: candidates.map((candidate) => ({
        title: candidate.title,
        source: candidate.source,
        publishedAt: candidate.publishedAt,
        url: candidate.url,
        snippet: candidate.snippet,
      })),
    });
    return candidates;
  }

  normalizeResults(payload, queryDefinition) {
    const candidates = [];
    const newsResults = Array.isArray(payload.news_results) ? payload.news_results : [];
    const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
    const rawResults = newsResults.length > 0 ? newsResults : organicResults;

    for (const rawResult of rawResults) {
      const url =
        rawResult.link ||
        rawResult.url ||
        rawResult.news_url ||
        rawResult.source_url ||
        "";

      const candidate = {
        query: queryDefinition.query,
        engine: queryDefinition.engine || "google_news",
        title: compactWhitespace(rawResult.title || ""),
        snippet: compactWhitespace(
          rawResult.snippet ||
            rawResult.summary ||
            rawResult.highlight ||
            rawResult.rich_snippet?.top?.extensions?.join(" ") ||
            ""
        ),
        source:
          rawResult.source?.name ||
          rawResult.source ||
          rawResult.displayed_link ||
          rawResult.favicon ||
          "",
        url,
        normalizedUrl: normalizeUrl(url),
        publishedAt:
          rawResult.date ||
          rawResult.published ||
          rawResult.published_at ||
          rawResult.source?.date ||
          "",
        raw: rawResult,
      };

      candidate.dedupeKey = makeDedupeKey(candidate);

      if (candidate.title || candidate.url) {
        candidates.push(candidate);
      }
    }

    return candidates;
  }
}

module.exports = {
  SerpApiClient,
};
