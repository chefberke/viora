# @viora/mobile

Expo 57 and React Native 0.86, expo-router, TanStack Query, NativeWind.

The product-level story is in the [root README](../../README.md). Folder rules and the theming
system are in [`AGENTS.md`](AGENTS.md) and are not repeated here. This file is what the client
actually does.

---

## Running it

```bash
cp .env.example .env
npm run dev            # or: npm run ios / npm run android
```

`EXPO_PUBLIC_API_URL` has to be reachable **from the device running the app**, not from your Mac:

| Target | Value |
|---|---|
| iOS Simulator | `http://localhost:3000` |
| Android Emulator | `http://10.0.2.2:3000` |
| Physical device | `http://<your-LAN-IP>:3000` |

Expo inlines `EXPO_PUBLIC_*` at bundle time, so **restart Metro after changing it**. The auth
client throws a named error at startup if it is missing, and the sign-in screen surfaces
"cannot reach the server, check EXPO_PUBLIC_API_URL" rather than a generic network failure,
because that screen is the one place where the likeliest cause really is a misconfigured URL.

---

## Routes

`app/` holds routes only. Every file picks a screen and passes props.

| Route | Screen |
|---|---|
| `(app)/index` | the day: composer, rows, summary bar |
| `(app)/entry/[id]` | the nutrition sheet for one row, and the review surface |
| `(app)/water` | the weekly water sheet |
| `(app)/calendar` | the month, as a bottom sheet |
| `(app)/summary` | the day read out in full, with the macro split |
| `(app)/saved-meal/[id]` | one bookmarked meal |
| `(app)/settings` | a full-screen modal: account, meals, appearance, deletion |
| `(auth)/welcome`, `sign-in`, `sign-in-email`, `sign-up-email` | |

A sheet opened from a past day carries that day in its params, because the sheet has to look the
entry up in the day it belongs to rather than in today.

---

## The composer

The single idea the whole screen is built on: **a draft is a list, and every line is its own
entry.** What you write arrives as one meal per entry, not as one block of text to be split later.

- Each row keeps a stable client-generated uuid across edits, so it keeps its input and with it
  its caret while being typed in.
- A row rests for **1 second** after the last keystroke before its text is sent.
- The write is optimistic and compare-and-sets on `revision`. A stale edit loses quietly, because
  newer text supersedes older text.
- Two rows that read the same are left alone. A second burger is a second meal, not a mistake.
- An entry is never blank.

While a parse runs, the right edge of the row shows one shimmering word at a time, walked in a
circle. A parse can take a while, and a single word held for all of it reads as a stall.

**Three different failure endings, not one.** A row with no connection is waiting and will send
itself. A row the server refused for a reason retrying cannot change says so and offers nothing.
Everything else offers the retry. That distinction is `messageForError`, whose load-bearing field
is `retry`: a retry offered against a 413 is a button that cannot work, and a retry offered
against a timeout is worse than useless, because the parse may have completed on the server and
pressing it can log the meal twice.

---

## The review surface

The nutrition sheet is where the accuracy work becomes visible.

- Every item shows the database its numbers came from, or says plainly that it is a model
  estimate. Water names no source, because none was asked.
- Confidence is a word and a colour, from one shared map: `high` at 0.85 and up, `medium`, `low`
  under 0.55. Low is not a style choice; it is exactly the set of items whose numbers are a guess.
- A row with flagged items shows a quiet hint: "one item here is a guess", with a way into the
  review. It carries no wavy underline, unlike the no-food hint, because a wave means the writing
  is wrong and here the writing is fine. It is the reading that is uncertain.
- Expanding an item gives three actions inline, because the app deliberately avoids nested modals:
  **change food** (the three candidates the parse already kept, each showing what it would come to
  at the current weight), **change portion** (multipliers plus a free field), and **remove**.
- When none of the candidates are right, a search panel queries both databases through the same
  ranking the parser uses, so the row a person picks is one the parser could have picked itself.

Two things about `useItemCorrections` are not the shape the rest of the app uses, and both are
deliberate. The revision comes off the entry being rendered rather than from any counter of our
own, because every op says "item 2 of this list" and the only list that sentence is true of is
the one on screen. And the cache write happens where the request does rather than in an
`onSuccess`, because this runs inside a sheet that can be dragged away at any moment: an
unmounted observer's callbacks never run, while the work already in flight runs to the end.

---

## Offline and errors

- `expo-network` is wired into TanStack Query's `onlineManager` before the first query runs.
  Without it the default is "always online": every query fires into a dead socket, waits out the
  100 s timeout, retries once, and only then reports a failure the person could have been told
  about immediately. With it, queries pause and **mutations wait**, so a meal typed in a lift is
  sent when the doors open. It prefers `isInternetReachable` over `isConnected`, because the case
  this exists for is the hotel network that is connected and answers nothing.
- **Two error boundaries.** The one in `app/_layout.tsx` renders outside every provider and
  replaces the whole tree. The one inside `(app)` keeps the theme, so a sheet that throws while
  rendering a bad parse no longer blanks the app someone was halfway through using.
- `QueryCache` and `MutationCache` hooks write every unhandled failure down. The app previously
  swallowed five failures outright, each a deliberate `.catch(() => {})` with a comment
  explaining why the *user* need not be told. Each was right about that and wrong to leave nothing
  behind: "a miss costs nothing" is a claim nobody could check.
- The logger stays a `console` call in the shape a crash reporter would want, so swapping one in
  later is a change to one file rather than a vendor decision made now.

---

## Time

Nothing in this app asks the server what time it is. The server runs in UTC and the person eating
may be thirteen hours away, so the day and the minute always come from the device.

- `useToday` re-reads the date when the app returns to the foreground, when the zone changes, and
  on every hour mark. A phone keeps this screen mounted for days.
- `useMinuteBucket` reads the clock in quarter hours, which is fine-grained enough to tell
  breakfast from mid-morning and coarse enough that the suggestions query key changes four times
  an hour instead of sixty.
- `useMinuteOfDay` reads the clock on each call rather than from `useToday`, which only re-renders
  hourly. Only today gets a value: writing yesterday's dinner in at 23:00 says nothing about when
  that dinner was eaten, and the server keeps the first value it is given.

---

## Theming

One rule: **to add or change a colour, edit `src/theme/tokens.js` and nothing else.** Style with
semantic classes (`bg-surface`, `text-foreground-muted`, `text-macro-carbs`), never a hex value,
and never a `dark:` prefix, because the CSS variables already switch per scheme.

The two schemes separate surfaces from the page differently on purpose: light uses a tinted page
with white pills lifted by a shadow, dark uses a near-black page with pills lifted by colour. So
the shadow is a theme token, empty in dark, because a shadow on a near-black page only muddies it.

Full detail in [`AGENTS.md`](AGENTS.md).

---

## Gates

```bash
npm run typecheck
npm run lint
npx expo export --platform ios --output-dir /tmp/bundlecheck
```

The second one is not decoration. `tsc` does not resolve a native module or execute a
module-level side effect, and both of those are how this half of the app can break.
