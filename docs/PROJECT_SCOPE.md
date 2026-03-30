# Watching — Project scope & requirements (draft)

**Purpose:** Automate ongoing monitoring of user-defined “searches,” evaluate new findings with an LLM (OpenAI), and notify the user only when configurable criteria are satisfied.

**Status:** Draft for discussion — sections marked **TBD** need your decisions before implementation.

---

## 1. Vision

You define *what* to watch (queries, feeds, or other sources), *how often* to check, and *what counts as a hit* (criteria). The system collects candidate items, sends relevant context to the OpenAI API for judgment, and alerts you when the model (and any optional hard rules) say the match is good enough.

### Example: Kimi IPO / “when is it happening?” news

**Situation:** You expect **Kimi** (Moonshot AI) to **IPO later in the year** but do not know the date. You want to **keep scanning the news on a schedule** and get a **message only when something meaningful** shows up—not every article that mentions the chatbot.

**How it maps to this project**

| Piece | Example |
|-------|--------|
| **Watch name** | e.g. `kimi-ipo-news` |
| **Schedule** | e.g. every 6–12 hours, or once daily at a fixed local time |
| **Ingestion** | Broad news coverage: programmable news/web search, Google News–style RSS, or a paid news API (**TBD**; see §6). Query side can be keywords like company name + `IPO OR listing OR prospectus OR HKEX` (exact syntax depends on provider). |
| **LLM criteria** | Treat as a match only if the piece is **substantively about** a **listing / IPO / exchange filing / official timing statement**, and optionally distinguish **confirmed or filing-backed** vs **rumor or analyst speculation** so you can tighten alerts over time. |
| **Dedup** | One notification per **canonical URL** (or headline + date) so syndicated stories do not spam you. |

This pattern—**wide net for candidates, narrow filter via OpenAI**—is a good fit when you cannot subscribe to one perfect RSS feed but can describe what “counts” in prose.

---

## 2. Goals (MVP)

| Goal | Description |
|------|-------------|
| **Preset watches** | Create, edit, enable/disable named watches without redeploying code. |
| **Ingest** | Pull new “candidate” items per watch; **MVP: SerpApi** for search/news-style queries (see §6). |
| **LLM gate** | For each new candidate (or batch), call OpenAI with a consistent prompt template + your criteria; parse a structured decision (e.g. match / no match / unsure + short reason). |
| **Notify on match** | Send a message through at least one channel when criteria are met (**TBD**: channel). |
| **De-duplicate** | Do not re-alert for the same underlying item (**TBD**: identity key: URL, hash, id). |
| **Secrets & config** | API keys (OpenAI, search, notifications) live in env or a secret store — not in repo. |

### Non-goals (initially)

- General-purpose web UI for arbitrary users (single-user / self-hosted is fine for v1).
- Guaranteed real-time delivery (polling-based MVP is acceptable unless you need sub-minute latency).
- Bypassing third-party ToS; ingestion must respect source terms and rate limits.

---

## 3. High-level architecture

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Scheduler  │────▶│   Ingest /   │────▶│   OpenAI    │────▶│ Notification │
│  (cron /    │     │   normalize  │     │   evaluate  │     │   (email /   │
│   loop)     │     │   candidates │     │   criteria  │     │    chat…)    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Store state  │
                    │ (seen ids,   │
                    │  run logs)   │
                    └──────────────┘
```

---

## 4. Conceptual data model (watch / preset)

Each **watch** could include:

| Field | Description |
|-------|-------------|
| `name` | Human-readable label. |
| `source_type` | How candidates are found (RSS, search API, static URL list, **TBD**). |
| `source_config` | Query string, feed URL, API params, etc. |
| `schedule` | e.g. every N minutes / cron expression. |
| `criteria` | Natural-language or structured rules the LLM must apply (“only if …”). |
| `llm_model` | e.g. `gpt-4o-mini` vs stronger model for harder judgments. |
| `notify_channel` | Where to send hits. |
| `enabled` | On/off. |

### Suggested v1 SQLite tables

Use **SQLite** as the single local database for configuration and run history.

| Table | Purpose |
|-------|---------|
| `watches` | Stores what to monitor: watch name, query, schedule, criteria, source config, enabled flag |
| `watch_runs` | One row per execution of a watch, with timestamps, status, counts, and error info |
| `candidates` | Raw or normalized results returned from SerpApi before final OpenAI decision |
| `decisions` | Structured OpenAI output such as `match`, `confidence`, and short reason |
| `notifications` | Records which alerts were sent, when, to whom, and whether delivery succeeded |
| `seen_items` | Deduplication keys so the same story is not alerted repeatedly |

**Why SQLite fits v1:** single-user, low operational overhead, easy backup/copy, and good enough for scheduled polling workloads on one server.

---

## 5. OpenAI usage

**Suggested responsibilities for the model**

- Compare candidate text/metadata against `criteria`.
- Output **structured** JSON (e.g. `{ "match": true/false, "confidence": "high|medium|low", "reason": "…", "extracted_facts": [...] }`) for reliable automation.
- Optionally summarize long pages so you stay within context limits and cost caps.

**Operational controls (recommended)**

- Max tokens / model tier per watch.
- Truncation rules for input (first N chars, or extract main content only).
- Logging: store prompts/responses **only if** you accept privacy/retention implications (**TBD**).

---

## 6. Ingestion

What “search” means drives cost, complexity, and legality:

| Option | Pros | Cons |
|--------|------|------|
| **RSS / Atom feeds** | Simple, polite, no HTML parsing | Only where feeds exist |
| **Official APIs** (e.g. Reddit, GitHub, news APIs) | Structured, ToS-clear | Per-platform setup |
| **Programmable search** (e.g. Google Custom Search JSON API, **SerpApi**, Bing via Azure) | Broad web | Quotas, cost, API keys |
| **Targeted HTTP fetch + parse** | Flexible | Fragile, ToS-sensitive |

### MVP preference: SerpApi

**Chosen direction for v1 (web + news-style watches):** [**SerpApi**](https://serpapi.com/) as the primary search provider. It is attractive for MVP because it offers a **small free tier** (you mentioned **250 searches/month**) and gives a simpler way to access search/news results than wiring up Azure first.

**Why it fits:** Easy to start, broad search coverage, structured JSON responses, and low-friction testing for a personal project before committing to a paid platform integration.

**Implementation notes:**

- Use the **SerpApi key** in app config and keep queries low-frequency enough to stay within the free allowance where possible.
- For a watch like `kimi-ipo-news`, prefer the provider's **news-capable** results when available; otherwise use web search plus LLM filtering.
- Because the free tier is small, tune schedule carefully. Example: `1 query x 1 run/day` is about `30/month`; `3 queries x 3 runs/day` is about `270/month`, which already exceeds `250/month`.
- **Optional later:** add **RSS** as a cheap supplement, or switch/add **Bing/Azure** if you need a more official long-term setup.

**IPO / corporate-news watches** (see vision example) still benefit from **LLM filtering** after SerpApi returns candidates—the search provider narrows the web; criteria decide what warrants a notification.

**Still TBD:** which SerpApi engine/result type to use per watch, whether query localization is needed for Chinese names, and whether the free tier is enough once you have multiple watches.

---

## 7. Notifications

| Option | Notes |
|--------|--------|
| Email (SMTP, SendGrid, etc.) | Universal; good for v1 |
| Telegram / Discord / Slack bot | Great for mobile push-like urgency |
| SMS (Twilio) | Higher cost; very visible |
| **WhatsApp via Baileys** | Best fit for this project if you already use WhatsApp and have auth available on the server |

### MVP preference: WhatsApp via Baileys

**Chosen direction for v1 notifications:** **WhatsApp via `baileys`**.

**Why it fits:** You already tested it successfully and already authenticated another project on the same server, so it is likely the fastest path to reliable personal alerts.

**Implementation notes:**

- Treat the **Baileys auth/session state** as persistent app data; do not commit it to git.
- Prefer making the auth path **configurable** so this project can either use its own session directory or intentionally point at an existing one.
- The app should detect **disconnect / logged out / QR re-pair needed** states and surface them clearly in logs.
- Send a compact message with: watch name, confidence, short reason, article title, and URL.

**Caution:** `baileys` is convenient for personal use, but it is not an official WhatsApp Business API product. That is usually acceptable for a self-hosted personal tool, but it is worth treating as an operational dependency that may occasionally need maintenance.

---

## 8. Tech stack (**TBD** — examples only)

- **Runtime:** **Node.js / TypeScript** is the easiest fit for v1 because of `baileys`; Python remains possible only if notifications are split into a separate service.
- **Storage:** SQLite for single-user MVP (seen IDs, watch definitions, run logs).
- **Deployment:** Local cron, systemd timer, or a tiny always-on VPS/container.

**Current preference:** `Node.js + TypeScript + SQLite`.

---

## 9. What still needs design

Now that **SerpApi** and **OpenAI API** are chosen, the biggest remaining questions are about **behavior**, **cost control**, and **operability** rather than search provider selection.

### A. Notification channel

For MVP, the notification channel is now **WhatsApp via `baileys`**.

Remaining questions here are operational:

- Reuse the existing auth/session from the other project, or keep a dedicated session for `watching`?
- Which WhatsApp destination should receive alerts: your own account, a group, or both?
- Do you want immediate alerts, a daily digest, or both?

### B. Scheduling and monthly budget

The free SerpApi allowance is small enough that schedule matters immediately.

Questions to settle:

- How often should each watch run: every few hours, daily, or only on weekdays?
- How many queries does one watch need?
- How many results do you want per query?
- What is the acceptable monthly budget once you exceed the free tier?

### C. Query design

For each watch, decide whether you want:

- One broad query, then let the LLM filter
- Several narrower queries for better recall
- Multilingual queries, e.g. English + Chinese company names

For example, `Kimi IPO` may need a mix like:

- `Moonshot AI IPO`
- `Kimi IPO`
- `月之暗面 IPO`
- `Moonshot AI listing`

### D. Match policy

You need to define what qualifies as worth notifying.

Examples:

- Notify only on **high-confidence** matches
- Notify only if the article appears to mention **official timing**, **filings**, **exchange names**, or **company statements**
- Suppress rumor/speculation unless several credible outlets report the same claim

### E. Candidate depth

Decide what the LLM sees:

- Only the search result title + snippet
- Fetch the linked page and pass fuller text to OpenAI
- Try snippet first, then fetch article only when needed

For MVP, **snippet first, fetch full page only on borderline cases** is a good cost/reliability compromise.

### F. Deduplication

Without dedupe, alerts get noisy fast.

Decide whether one alert is keyed by:

- Canonical URL
- URL after stripping tracking parameters
- Headline + publish date
- Source + headline hash

### G. Logging and privacy

Decide what to store locally:

- Only run metadata and alert decisions
- Search results/snippets
- Full fetched article text
- OpenAI prompts/responses

The less you store, the simpler privacy handling becomes.

### H. Failure behavior

You should define what happens when:

- SerpApi rate-limits or errors
- OpenAI times out
- A linked page is blocked or malformed
- Notification delivery fails

At minimum, the app should retry a little, log the failure, and avoid duplicate alerts on rerun.

### I. Single-user configuration UX

How will you define watches in v1?

- `.yaml` / `.json` config file
- simple CLI commands
- tiny local web UI later

For MVP, a config file is usually enough.

---

## 10. Risks & constraints

- **API spend:** OpenAI + search APIs scale with frequency and volume — cap runs per watch.
- **False positives/negatives:** Criteria wording and model choice matter; you may want “match only if confidence is high” as a second gate.
- **Duplicate alerts:** Requires stable IDs or normalized URLs + hashing.
- **Legal / ethical:** Respect robots.txt, terms of use, and copyright when fetching content.

---

## 11. Phased roadmap (proposal)

| Phase | Deliverable |
|-------|-------------|
| **P0** | **SerpApi** as primary ingest, SQLite, OpenAI JSON decision, one notification channel, single-user config file or minimal CLI. |
| **P1** | Multiple watches, better scheduling, richer dedupe, basic web UI or TUI. |
| **P2** | More source types, optional human-in-the-loop approval, dashboards. |

---

## 12. Checklist — decisions needed from you

- [x] **Sources:** **SerpApi** as MVP primary; RSS/mix optional later.
- [x] **Notification:** **WhatsApp via `baileys`**
- [ ] **Hosting:** Laptop+cron vs always-on server?
- [ ] **Model:** Cost vs accuracy default (`gpt-4o-mini`-class vs larger)?
- [ ] **Privacy:** Store full page text in DB vs discard after evaluation?
- [ ] **Language:** All English initially, or multilingual criteria?
- [ ] **Baileys auth strategy:** reuse existing session vs dedicated session for this project?

---

## Document history

| Date | Author | Change |
|------|--------|--------|
| 2026-03-30 | — | Initial draft from requirements discussion |
| 2026-03-30 | — | Added example use case: Kimi IPO / scheduled news monitoring |
| 2026-03-30 | — | Recorded MVP ingestion preference: Bing Search (Azure), Web/News notes |
| 2026-03-30 | — | Switched MVP ingestion preference to SerpApi based on free-tier fit |
| 2026-03-30 | — | Added post-provider decisions: budget, query design, dedupe, alert policy, failure handling |
| 2026-03-30 | — | Set MVP notification channel to WhatsApp via Baileys and preferred Node/TypeScript runtime |
