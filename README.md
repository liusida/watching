# Watching

`watching` is a self-hosted personal monitoring tool.

You define a **task** such as:

- "Tell me when there is credible news about Kimi's IPO timing"
- "Tell me when a company starts talking about listing in Hong Kong"

The app then:

1. generates search queries for the task with `OpenAI`
2. searches with `SerpApi`
3. evaluates returned candidates with `OpenAI`
4. stores task runs and state in `SQLite`
5. sends a WhatsApp message through `Baileys` if a result qualifies

This project runs as plain Node.js scripts. There is **no compile step**.

## Stack

- `Node.js`
- `SerpApi`
- `OpenAI API`
- `SQLite` via `better-sqlite3`
- `Baileys` for WhatsApp notifications

## Requirements

- Node.js `20+`
- npm
- a `SerpApi` key
- an `OpenAI` API key
- a valid `Baileys` auth/session directory if you want real WhatsApp delivery

## Setup

Install dependencies:

```bash
npm install
```

Create your local env file:

```bash
cp .env.example .env
```

Then fill in the important values in `.env`:

```env
SERPAPI_API_KEY=...
OPENAI_API_KEY=...
BAILEYS_AUTH_PATH=/absolute/path/to/your/baileys/session
```

Put each task’s WhatsApp **group or user JID** in `config/tasks.json` under `notify.destination` (or pass `--destination` to `add-task`). Use `npm run list-whatsapp-groups` to list group JIDs.

### Main env variables

- `SERPAPI_API_KEY`: required for search
- `OPENAI_API_KEY`: required for query generation and evaluation
- `OPENAI_MODEL`: defaults to `gpt-4o-mini`
- `TASKS_FILE_PATH`: defaults to `./config/tasks.json`
- `DB_PATH`: defaults to `./data/watching.db`
- `LOG_FILE_PATH`: defaults to `./logs/watching.log`
- `BAILEYS_AUTH_PATH`: path to an authenticated Baileys session directory
- `POLL_INTERVAL_MS`: worker poll interval, default `60000`
- `SERPAPI_ENGINE`: default engine, default `google_news`
- `DEFAULT_LOCALE`: default locale, default `en-US`
- `DEFAULT_COUNTRY`: default country, default `us`
- `DEFAULT_MAX_RESULTS`: default max results per query
- `DRY_RUN_NOTIFY=1`: do not send real WhatsApp messages
- `DEBUG=1`: enable verbose logs

## Project Layout

- `config/tasks.json`: editable task definitions
- `data/watching.db`: SQLite database
- `logs/watching.log`: runtime log file
- `src/commands/`: CLI commands
- `src/providers/`: SerpApi and OpenAI integrations
- `whatsapp-kit/`: portable **WhatsApp / Baileys** module (pair, list groups, notifier). Copy the whole folder into another Node project; see `whatsapp-kit/README.md`.

## Core Commands

### Add a task

Create a new monitoring task from plain language:

```bash
npm run add-task -- --goal "Notify me when there is credible news about Kimi IPO timing"
```

You can also set more fields:

```bash
npm run add-task -- \
  --name kimi-ipo-date \
  --goal "Notify me when there is credible news about Kimi or Moonshot AI IPO timing, filing schedule, exchange listing, or prospectus progress." \
  --schedule "every 12 hours" \
  --criteria "Only notify when the result strongly suggests an IPO timeline, listing plan, exchange filing, prospectus, or official company statement." \
  --locale en-US \
  --destination 8613812345678
```

Notes:

- the task name is auto-generated from the goal if you do not pass `--name`
- the command asks `OpenAI` to generate a `queryPlan`
- the task is written to `config/tasks.json`
- the task is synced into SQLite

### List tasks

```bash
npm run list-tasks
```

This prints a table with:

- task id
- task name
- whether it is enabled
- schedule
- locale
- last run time
- last run status

### Pair WhatsApp and get your JID

If your Baileys auth path is not linked yet, run (no phone number required):

```bash
npm run pair-whatsapp
```

The command prints a **QR code** in the terminal. Open WhatsApp on your phone → **Linked devices** → **Link a device**, then scan it.

Optional auth directory:

```bash
node src/commands/pair-whatsapp.js --auth-path /path/to/baileys/session
```

Important:

- with `npm run`, pass flags **after** `--` if you add any
- if you see **401** or “connection failure” while scanning QR, local session files are usually bad: run `npm run pair-whatsapp -- --reset` (or delete your Baileys auth directory), then try again
- right after a successful QR scan, WhatsApp may close the socket once (e.g. **515**); the command reconnects with a short delay — you do not need to scan again
- pairing uses the **live WhatsApp Web** client revision (`web.whatsapp.com/sw.js`), not only the version baked into the Baileys repo
- **stop the worker** (or anything else using `BAILEYS_AUTH_PATH`) while you run `pair-whatsapp`, or the session folder may conflict
- after the script prints your JID it **waits ~2.5s** so the session can save; don’t **Ctrl+C** until you see the “Done. Session is saved” lines — otherwise you may have to pair again
- you only need **`pair-whatsapp` once** per auth folder; normal use is **`npm run worker`** (or `list-whatsapp-groups`), not pairing every time
- once connected, it prints:
  - `Raw JID`
  - `Base JID`
  - `Name`

### List WhatsApp groups

If your session is already paired, list the available groups:

```bash
npm run list-whatsapp-groups
```

This prints each group's:

- subject
- JID
- owner
- participant count

Use the selected group JID as the destination for `watching`.

### Run one task now

```bash
npm run run-once -- --task kimi-ipo-date
```

Run all configured tasks:

```bash
npm run run-once -- --all
```

### Start the background worker

```bash
npm run worker
```

This starts the internal scheduler loop and checks due tasks every `POLL_INTERVAL_MS`.

## How Scheduling Works

Scheduling is handled **inside the app**, not by system cron.

Examples of supported schedule values:

- `every 12 hours`
- `daily`
- `hourly`
- a 5-field cron expression such as `0 8,20 * * *`

### Important behavior

- `every 12 hours` means "run when 12 hours have passed since the last run"
- it is **not** anchored to exact wall-clock times unless you use a cron expression
- the worker checks whether a task is due on each poll

## Pre-run checks

Before `run-once` or the worker runs searches, **`src/validate-task.js`** checks:

- `.env` has `SERPAPI_API_KEY`, `OPENAI_API_KEY`, and `BAILEYS_AUTH_PATH`
- each task has a non-empty `queryPlan` (engine + queries) and **`notify.destination`**

A misconfigured task fails immediately with a clear error instead of burning API usage. The worker skips invalid tasks and logs the error.

## How Notifications Work

The app sends a WhatsApp message only when:

- the task run succeeds
- a candidate result is evaluated by `OpenAI`
- `OpenAI` returns:
  - `match = true`
  - `confidence = high`
- `task.notify.destination` is set (WhatsApp user or group JID)
- `BAILEYS_AUTH_PATH` points to a valid authenticated session

If no notification is sent, the task can still show `completed`. That only means the run finished successfully.

## Task File Format

Tasks live in `config/tasks.json`.

Example:

```json
{
  "tasks": [
    {
      "name": "kimi-ipo-date",
      "goal": "Notify me when there is credible news about Kimi or Moonshot AI IPO timing, official filing schedule, listing exchange, or prospectus progress.",
      "schedule": "every 12 hours",
      "criteria": "Only notify when the result strongly suggests an IPO timeline, listing plan, exchange filing, prospectus, or official company statement. Suppress weak speculation.",
      "locale": "en-US",
      "enabled": true,
      "queryPlan": {
        "engine": "google_news",
        "hl": "en",
        "gl": "us",
        "maxResultsPerQuery": 5,
        "summary": "Generated by OpenAI",
        "queries": [
          {
            "query": "Kimi IPO date announcement",
            "reason": "Look for direct timing announcements"
          }
        ]
      },
      "notify": {
        "destination": "8613812345678"
      }
    }
  ]
}
```

You can edit this file manually if needed.

## Logs

Logs go to:

- terminal output
- `logs/watching.log`

Useful ways to inspect logs:

```bash
tail -f logs/watching.log
```

```bash
less logs/watching.log
```

The logs include:

- search keywords
- returned SerpApi results
- OpenAI prompts
- OpenAI parsed responses
- dedupe decisions
- notification attempts
- task and worker summaries

## SQLite Data

The app stores state in `data/watching.db`.

Main tables:

- `tasks`
- `task_runs`
- `candidates`
- `decisions`
- `notifications`
- `seen_items`

This lets the app avoid duplicate alerts and preserve task history.

## Typical Workflow

1. configure `.env`
2. add a task
3. inspect generated task queries in `config/tasks.json`
4. run it once:

```bash
npm run run-once -- --task kimi-ipo-date
```

5. inspect:
   - `logs/watching.log`
   - `config/tasks.json`
   - `npm run list-tasks`
6. once satisfied, start the worker:

```bash
npm run worker
```

## Troubleshooting

### Task says `completed` but I got no WhatsApp message

Possible reasons:

- no result matched strongly enough
- `task.notify.destination` is missing or empty (set it in `config/tasks.json` or `add-task --destination`)
- `BAILEYS_AUTH_PATH` is not pointing to a valid session
- the task results were all deduped

### I want to inspect what the app actually searched and sent to OpenAI

Check:

```bash
logs/watching.log
```

That file now contains:

- query strings
- search results
- OpenAI prompt messages
- OpenAI responses

### I want to test without sending a real WhatsApp message

Use:

```env
DRY_RUN_NOTIFY=1
```

Then the app will go through the notification path without sending a real message.

## Current Status

The project already includes a sample task:

- `kimi-ipo-date`

You can list it with:

```bash
npm run list-tasks
```
