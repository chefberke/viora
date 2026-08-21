<div align="center">

<img src="apps/mobile/assets/logo.png" width="120" alt="Viora" />

# Viora

**A meal diary you write like a note.**
One line of free text, Turkish or English, becomes canonical foods, portions and nutrition.

</div>

## The stack

**Mobile** &nbsp; ![Expo](https://img.shields.io/badge/Expo-000020?style=flat-square&logo=expo&logoColor=white) ![React Native](https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![Expo Router](https://img.shields.io/badge/Expo_Router-000020?style=flat-square&logo=expo&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![NativeWind](https://img.shields.io/badge/NativeWind-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![TanStack Query](https://img.shields.io/badge/TanStack_Query-FF4154?style=flat-square&logo=reactquery&logoColor=white) ![Reanimated](https://img.shields.io/badge/Reanimated-001A72?style=flat-square)

**API** &nbsp; ![Node.js](https://img.shields.io/badge/Node.js_20-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Drizzle](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/Upstash_Redis-FF4438?style=flat-square&logo=redis&logoColor=white) ![Better Auth](https://img.shields.io/badge/Better_Auth-000000?style=flat-square&logo=betterauth&logoColor=white)

**Model, data, tooling** &nbsp; ![OpenRouter](https://img.shields.io/badge/OpenRouter-000000?style=flat-square&logo=openrouter&logoColor=white) ![gpt-oss-120b](https://img.shields.io/badge/openai%2Fgpt--oss--120b-412991?style=flat-square) ![USDA](https://img.shields.io/badge/USDA_FoodData_Central-2E5E1E?style=flat-square) ![Open Food Facts](https://img.shields.io/badge/Open_Food_Facts-FF8714?style=flat-square) ![Braintrust](https://img.shields.io/badge/Braintrust-EA580C?style=flat-square&logo=braintrust&logoColor=white) ![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?style=flat-square&logo=turborepo&logoColor=white)

---

## Running it yourself

**Requirements:** Node 20+, a PostgreSQL database, and a free
[USDA FoodData Central key](https://fdc.nal.usda.gov/api-key-signup). An
[OpenRouter](https://openrouter.ai) key is needed to parse new lines, but not to run the accuracy
suite. Redis and the tracing platform are both optional.

```bash
npm install

cp apps/api/.env.example apps/api/.env        # DATABASE_URL, LLM_*, USDA_API_KEY
npm run db:migrate --workspace=@viora/api

cp apps/mobile/.env.example apps/mobile/.env  # point EXPO_PUBLIC_API_URL at the API

npm run dev          # turbo runs both: the API on :3000 and the Expo dev server
```

Turbo's TUI gives each task its own pane, so Expo's `i` / `a` / QR code still work. To run one
side alone: `npm run api` or `npm run mobile`.

**Checking the accuracy claim needs none of that.** The eval harness replays recorded provider
answers from disk, so it runs on a clean checkout with no keys, no database, no Redis and no
network:

```bash
npm run eval --workspace=@viora/api
```

Ten metrics, the failure histogram, the reliability curve and the per-category breakdown in about
0.3 seconds, byte-identical between runs.

---

## Scope of the build

```
apps/api      Express 5 + TypeScript. The parse pipeline, the correction loop,
              the food providers, the suggestion engine, and the eval harness.
apps/mobile   Expo + React Native. The composer, the day, the review sheet.
presentation  A self-contained case study deck: accuracy, reliability,
              security, and the trade-offs.
```

Beyond meal parsing, the app is a working food diary:

- **A composer, not a form.** Every line in the editor is its own entry. It debounces for a
  second, parses, and prices itself while you keep typing the next one.
- **Days.** Swipe between days, jump around a month calendar, pull to refresh.
- **Water is its own entry kind.** `1 litre su` never becomes a food, and gets its own weekly
  sheet with a goal ring.
- **Saved meals.** Bookmarking a row reuses the parse it already had. Editing the text re-parses.
- **Suggestions** ranked from 90 days of your own history by time of day, weekday, recency and
  habit. Pure and clock-free, because the server is UTC and the person eating is not.
- **Account and settings.** Email and Google sign-in, real account deletion behind a typed
  confirmation, light and dark from one token file, skeletons, an offline banner, two error
  boundaries.

---

## The approach

```mermaid
flowchart LR
  M["📱 Expo · React Native<br/>composer · day · review sheet"]
  A["⚙️ Express 5 API<br/>routes → validation → service → pipeline"]
  M -->|"HTTPS · session cookie"| A
  A --> PG[("PostgreSQL<br/>entries · corrections · traces")]
  A --> RD[("Redis<br/>parse cache · rate limits")]
  A --> LLM["OpenRouter<br/>gpt-oss-120b"]
  A --> USDA["USDA<br/>FoodData Central"]
  A --> OFF["Open Food Facts"]
  A -.->|"spans, best effort"| BT["Braintrust"]
```

Two workspaces, five external dependencies. Every external edge has a timeout, a cache, a failure
code, and a defined behaviour when it is down. Three rules keep the boundaries legible:

1. **A route file holds no logic.** It picks a screen and passes props. All twelve route files in
   `apps/mobile/app/` are under fifteen lines.
2. **A feature is imported only through its `index.ts`.** Nothing reaches into another feature's
   internals. When a second feature needs something it moves into `shared/`, and `shared/` may
   never import a feature.
3. **A module is `.routes` then `.validation` then `.service` then the rest.** The route knows
   HTTP, the service knows the database, and the pipeline knows neither.

That last rule is what makes the accuracy work possible. `parseRow(text, deps)` takes its LLM call
and both food providers as injectable dependencies — the single seam that lets the eval harness
replay 126 cases from disk, and lets 80 assertions drive the whole pipeline with stubs, with no
database, no keys and no network.

---

## The core decision

> **The rule the whole architecture is built on: the language model never supplies a number.**
> It reads structure — which foods and how much. Every calorie comes from a food database. When
> no database holds the food, the model's own estimate is used, that item is flagged, and its
> confidence is capped at 0.45. That happens to 1.6% of items.

One model call, two database lookups side by side, then arithmetic.

```mermaid
flowchart TD
  L["diary line · max 500 chars"] --> H["normalise + hash<br/>key = text + prompt version + model id"]
  H -->|"cache hit · 7 days"| OUT
  H --> LLM["one model call<br/>which foods · how many · what unit<br/>gram estimate · food or water · language"]
  LLM --> W["two provider waves, in parallel"]
  W --> U["USDA<br/>generic English name"]
  W --> O["Open Food Facts<br/>the user's own words"]
  U --> R
  O --> R["rank the candidates<br/>fit first, provenance second<br/>then docked by energy distance"]
  R -->|"a row wins"| P["price from that row<br/>keep margin + top 3 losers<br/>score confidence"]
  R -->|"nothing matches"| F["llm_estimate<br/>confidence capped 0.45<br/>flagged needsReview"]
  P --> OUT["entry items + totals"]
  F --> OUT
```

1. **The line** is capped at 500 characters, unicode-normalised and hashed into a cache key that
   includes the prompt version and the model id, so neither changing can ever serve a stale parse.
2. **One model call.** The line arrives inside `<diary_line>` tags, the first of three injection
   layers. Each item carries **two
   names**, because the two databases are indexed differently: a generic English name for USDA,
   and the user's own words for Open Food Facts, which files a Turkish product under its Turkish
   name. Per-100 g figures come back too, but they are only a fallback and a plausibility signal
   — never the numbers a user sees.
3. **Two provider waves, in parallel.** Nesting them would queue the wide USDA lane behind the
   narrow rate-capped one, so a row would cost the sum instead of the larger of the two.
4. **Picking a row.** Fit first, provenance second; then every row is docked by how far its energy
   sits from the model's own estimate. The winner, its margin over the runner-up, and the top
   three losers are all kept on the item — which is what makes a correction free.
5. **Pricing.** Mass units convert exactly. Volume units ask the model for grams, because a cup of
   cornflakes and a cup of honey share a volume and differ elevenfold in mass. The row's overall
   score is a calorie-weighted mean, so a shaky 20-kcal garnish cannot sink a well-grounded meal.

### The result

| | |
|---|---|
| Gold-set pass rate | **88.1%**, up from 55.6% |
| Test cases | 126 hand-written, Turkish and English, across 15 categories |
| Full accuracy run | **0.3 seconds**, offline, no API keys, deterministic |
| Grounding rate | 98.4% of items priced from a real database row |

---

## Read further

| | |
|---|---|
| 📊 [**The case study deck**](presentation/index.html) | How the accuracy is measured, what the measurement found, and what closed it. Open it in a browser: no server, no network |
| [`apps/api/README.md`](apps/api/README.md) | The ranking algorithm line by line, the correction path, the schema, every route |
| [`apps/mobile/README.md`](apps/mobile/README.md) | The composer model, the review surface, offline and error handling |
