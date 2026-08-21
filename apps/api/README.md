# @viora/api

Express 5 on Node 20, TypeScript, Drizzle over PostgreSQL. Parses a line of free text into priced
foods, stores the day, applies corrections, ranks suggestions, and measures its own accuracy
offline.

The product overview is in the [root README](../../README.md). This file is the implementation.

---

## Running it

```bash
cp .env.example .env      # DATABASE_URL, BETTER_AUTH_*, LLM_*, USDA_API_KEY are required
npm run db:migrate
npm run dev               # http://localhost:3000

npm run eval              # 126 gold cases, offline, no keys, 0.3 s
npm run check             # 80 pipeline + correction assertions, stubbed providers
```

`.env.example` is the annotated source of truth. The ones with a decision behind them:

| Variable | Without it |
|---|---|
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | No cache and no shared provider budget. **Both or neither** — a URL with no token refuses to boot, because a failing cache is indistinguishable from no cache and its symptom is a bill rather than an error. |
| `OFF_ENABLED` | `false` runs on USDA alone. |
| `CORS_ORIGINS` | Blank reflects any origin in development and allows none in production. |
| `TRUST_PROXY` | Behind a proxy every caller shares one rate-limit bucket; set too high and any caller can forge a fresh identity per request. |
| `BRAINTRUST_*` | Blank disables tracing. `parse_traces` is still written; there is just nowhere to read it. |
| `LLM_PRICE_*_PER_1K` | Defaults to 0, which emits no cost key. Set only for a model the trace store does not price itself — two disagreeing cost figures are worse than one. |

---

## Layout

```
src/
  config/      env, parsed and validated once at boot
  db/          drizzle schema (app + Better Auth tables) and the pool
  lib/         auth · redis · ratelimit · braintrust
  modules/
    entries/     the parse pipeline, the correction engine, the trace writer
    foods/       correction-time food search
    saved-meals/ suggestions/ auth/ account/ user/ health/
  types/       the wire contract, imported by the schema and mirrored by the client
  utils/       logger · http errors · circuit breaker · concurrency · request id
eval/          126 gold cases, cassettes, matching, scoring, reporting, harvesting
scripts/       entries.check.ts (80 assertions) · retention.ts
```

**A module reads `.routes` → `.validation` → `.service` → the rest.** The route knows HTTP, the
service knows the database, and the pipeline knows neither. `src/types/parse.ts` imports nothing
on purpose: the schema, the auth layer and the API types all lean on it, and a dependency there
would close an import cycle that collapses Drizzle's inference.

Middleware order carries two decisions: the auth router is mounted **above** `express.json()`
because Better Auth reads the raw body, and `trust proxy` decides what `req.ip` is, which is the
rate-limit identity. `errorHandler` is the one place a tagged pipeline error becomes a status code.

---

## Routes

| Method | Path | Budget | Notes |
|---|---|---|---|
| `PUT` | `/api/entries/:id` | parse 20/min | Upsert. Client-minted uuid, compare-and-set on `revision`. Parses only when the text changed. |
| `POST` | `/api/entries/:id/corrections` | corrections 60/min | Applies a batch of ops to the stored parse. **No model call.** 409 on a stale revision. |
| `GET` | `/api/entries` · `/api/entries/days` | | One day or a range; which days have anything on them. |
| `DELETE` | `/api/entries/:id` | | |
| `GET` | `/api/foods/search?q=` | search 30/min | For when all three candidates were wrong. USDA always, Open Food Facts only on a granted slot. |
| `GET` `PUT` `DELETE` | `/api/saved-meals[/:id]` | parse 20/min on `PUT` | With `result`, the entry's own parse is reused and nothing is re-parsed. |
| `GET` | `/api/suggestions?day=&minute=` | | The day and the minute come from the device, never from the server clock. |
| `POST` | `/api/account/deletion-feedback` | | Closed set of reasons. Called before deletion, so the answer survives a deletion that then fails. |
| `GET` | `/api/me` · `/health` | | |
| `ALL` | `/api/auth/*splat` | | Better Auth. `*splat` is Express 5 syntax; the Express 4 form throws at startup. |

Every route is behind a session except `/health` and auth itself. Per-user budgets **fail open**
(they are not a security boundary); the Open Food Facts window **fails closed** (it protects
somebody else from us).

---

## The parse pipeline

`entries.pipeline.ts` is the order things run in. Every helper is a sibling file:

```
entries.text.ts          normalising, cache keys, token folding
entries.cache.ts         parse cache (7 d), food cache (30 d, misses 1 d)
entries.prompt.ts        system prompt + few-shots, so a prompt change is a small diff
entries.llm.ts           transport only: one OpenAI-shaped request and its retries
entries.llm-output.ts    the only place that reads the wire field names
entries.rank.ts          how a database row is judged against the food a user named
entries.usda.ts          USDA provider: network half + ranking half
entries.off.ts           Open Food Facts provider + its shared rate window
entries.lookup.ts        one name against one provider: cache, network, or refused
entries.portion.ts       units to grams, per-100g scaled to them
entries.confidence.ts    itemConfidence · overallConfidence · confidenceLevel
entries.assemble.ts      totals, sources, row kind, candidate shapes
entries.corrections.ts   what a correction does to a stored parse. Pure
entries.trace.ts         the parse_traces row and its per-provider companions
entries.versions.ts      PROMPT_VERSION and PROMPT_FINGERPRINT
```

### Ranking

Both providers rank their own rows, so the vocabulary lives in `entries.rank.ts` rather than
twice. Four rules do the work:

- **Position beats count.** USDA writes `Primary, qualifier, qualifier`, so an unmatched word
  before the first comma changes **what** the row is (0.8) and one after it only says **which
  one** (0.14, capped). A class-prefix rule skips shelf labels: `Beverages, coffee, brewed` reads
  as coffee, `Snacks, banana chips` still reads as chips.
- **A row is scored on what it adds, not only on what the query asked for.** Otherwise `apple`
  scores a perfect 1.0 against `Croissants, apple`, and that 1.0 feeds the item's confidence.
- **State awareness.** Cooked / raw / fried / grilled / roasted / processed classes: agreement is
  a bonus, contradiction a penalty, an unrequested processed row is docked.
- **Plausibility.** `plausibleRank = match.rank − energyDisagreement(row, estimateKcal)`. The
  model's estimate is not accurate enough to publish — but it is easily accurate enough to say
  that a 467 kcal row is not yogurt.

Each provider also has a quality gate. What a **zero** means depends on the source: on a
lab-measured row it is a measurement and brewed tea really is 0 kcal; on a crowd-entered branded
row it is an unfilled field, which is how a can of Pepsi and a jar of pickles both came back at no
calories.

### Constants that carry a decision

| Constant | Value | Why |
|---|---|---|
| `MAX_ITEMS` | 20 | 15 was under the length of a real line — a Turkish breakfast typed out in full is 18 foods, and three were cut with nothing saying so. Truncation is now logged. |
| `MAX_QUANTITY` | high | `quantity` counts **units**, so `500 g chicken` arrives as quantity 500. The old ceiling of 100 silently rewrote every weighed line over 100 g. `toGrams` clamps the weight anyway. |
| `USDA_CONCURRENCY` / `OFF_CONCURRENCY` | 6 / 2 | Open Food Facts allows only 10 searches a minute per IP, shared by everyone. |
| `OVERLAP_LEAD` | 0.15 | How much better a provider must answer its **own** query before that decides the item, ahead of any provenance weight. Without it, a lab row answering a translated guess beat the user's actual product every time. |
| `REVIEW_MARGIN` | 0.1 | Below `OFF_WIN_MARGIN` on purpose: a gap the ranking refuses to decide a provider on is not a gap the parse should quietly settle either. |
| `LLM_ESTIMATE_CONFIDENCE_CAP` | 0.45 | An ungrounded estimate can never present itself as more than a coin flip and change. This value defines the `low` boundary. |

---

## Corrections

`entries.corrections.ts` is arithmetic on data already on disk: no model call, no lookup, no
clock. That is the whole reason the correction loop is cheap enough to exist.

| Type | Effect |
|---|---|
| `pick_candidate` | Swap in one of the stored candidates, re-price at the current grams |
| `set_portion` | Re-price the stored `per100g` at a new quantity |
| `set_food` | A row from `/api/foods/search`, run through the pipeline's own lookup, cache and ranking, so the row a person picks is one the parser could have picked itself |
| `remove_item` | Compact the list; its calories leave the total with it |
| `add_item` | Priced from the row it was chosen from. Recorded with index −1, because it had none |

A batch resolves every index against the list the person was looking at, so editing a row the same
batch just removed is refused. A user-set value is confidence 1.0. Kind, confidence, totals and
sources are all **recomputed** with the same helpers the parser uses, so a stored result can never
disagree with its own items.

---

## The eval harness

```bash
npm run eval                                # 126 cases, offline, 0.3 s, no keys
npm run eval -- --case tr-ayran -v          # one case, failing items printed
npm run eval -- --filter cooked_raw         # one category
npm run eval -- --compare baseline latest   # regression diff, exits 1 on a drop
npm run eval -- --braintrust                # also push the run as an experiment

npm run eval:record -- --limit 45           # spends model quota. Resumable, capped
npm run eval:record -- --no-llm             # record the food side only
npm run eval:harvest -- --limit 50          # turn real corrections into proposed gold cases
```

**Replay is the default everywhere.** Recording spends a metered model quota and a shared Open
Food Facts budget, so it never happens unless asked for by name, never re-records a case already
on disk, and stops at `--limit`.

Each case has **two independently versioned cassette legs**. The model leg is invalidated by a
prompt edit — that is the expensive one. The food leg stores the **raw candidate rows**, not the
winning row, so every ranking experiment replays instantly and for free. Replay hands the pipeline
the same shortlist length the providers themselves return, so a replayed run sees exactly what a
live one would.

Runs write `eval/reports/<name>.json` and `.md`. Pinned checkpoints, diffable with `--compare`:
`baseline` 55.6% → `phase2-code` 84.1% (ranking) → `phase2` 86.5% (prompt) → `phase6-api` 88.1%
(current) — plus `latest`, whatever ran last.

---

## Schema

Six application tables plus Better Auth's four, nine migrations.

| Table | Notes |
|---|---|
| `log_entries` | Client-generated uuid, so retries and re-parses stay one entry. `day` is a YYYYMMDD int matching the mobile helper. `revision` is the client's edit counter; writes compare-and-set on it. `result` is jsonb. |
| `saved_meals` | `canonical_key(text)` is the dedupe key and the join back to the log history. |
| `parse_traces` | One row per pipeline run, success or failure. `id` is also the trace span id. Indexed on `(user_id, created_at)` and `(error_code)`. |
| `parse_trace_lookups` | Per provider: `lookups`, `cache_hits`, `skipped`, `unreachable`, `latency_ms`. A third database should be a new value in `provider`, not four more columns. |
| `entry_corrections` | Append-only: `before`, `after`, `revision`, `item_index`, `type`, `trace_id`. |
| `account_deletion_feedback` | Deliberately outlives the account, which is why `user_id` carries no foreign key. Holds nothing identifying. |

Migration `0008` adds the `unreachable` column and **drops `email`, which is irreversible.**

```bash
npm run db:generate   # after editing the schema
npm run db:migrate
npm run db:studio
npm run auth:generate # regenerates src/db/schema.ts from the auth config
```

---

## Gates

There is no test runner and no CI. These are hand-run:

```bash
npm run typecheck                              # src + scripts/ + eval/
npm run build
npm run check                                  # 80 assertions, no database needed
npm run eval
npm run eval -- --compare phase6-api latest    # must be 0.0pp
npm run retention                              # needs Postgres. Idempotent
curl localhost:3000/health
```

`npm run check` drives the whole pipeline and the whole correction path with stubbed providers,
through the same `ParseDeps` seam the eval uses. Two extra modes hit the real thing:
`npm run check -- --parse "<line>"` parses one line against the live providers, and
`npm run check -- --live <names>` queries Open Food Facts directly.
