/**
 * The Open Food Facts provider: packaged and branded products, worldwide, under the local
 * name they are sold as. It is what makes "ülker çikolatalı gofret" or "sütaş süzme
 * yoğurt" resolve at all — USDA is a US table and has no row for either.
 *
 * Two things make this provider different from the USDA one it mirrors:
 *
 *  - Its rows are crowd-entered from photographed labels, so they need real quality gates.
 *    Measured on live data: about one hit in eight is missing a macro, and a few carry
 *    kilojoules in the kcal field, which reads as 1076 kcal per 100 g.
 *  - It allows 10 searches a minute per IP, and every user of this API shares one IP. The
 *    budget below is what keeps us under it. It is deliberately NOT expressed as a null
 *    return: a skipped lookup must never be written to the cache as "no match", or one
 *    busy minute would blacklist the most common local foods for a whole day.
 */
import { env } from '../../config/index.ts';
import { takeSharedSlot } from '../../lib/redis.ts';
import { log, logError } from '../../utils/index.ts';
import { contentTokens, scoreRow } from './entries.rank.ts';
import type { FoodMatch, Nutrition100g, SearchFood } from './entries.types.ts';

/** One attempt only: a retry spends a budget slot on a request that already failed. */
const REQUEST_TIMEOUT_MS = 3_000;

/**
 * Which `product_name.<lang>` fields are compared. Not a country filter. The line's own
 * language first, English always: most products carry an English name too, and a line
 * with no known language still has something to search in.
 */
function searchLangs(language: string): string {
  return language === '' || language === 'en' ? 'en' : `${language},en`;
}

const PAGE_SIZE = 10;

/** How many ranked products a search hands back. See the USDA provider's own note. */
const CANDIDATE_LIMIT = 10;

/** Only the fields the match needs. The full product document is far larger. */
const SEARCH_FIELDS = 'code,product_name,brands,nutriments';

/**
 * Provenance, on the same scale as `DATA_TYPE_WEIGHT` in the USDA provider: above its
 * `Branded` at 1, below its `SR Legacy` at 1.5. A photographed label is better evidence
 * than another photographed label filed in a US table, and worse evidence than a
 * laboratory.
 */
const RANK_WEIGHT = 1.4;

/**
 * Stricter than the USDA gate of 0.5, because these rows are product titles rather than
 * descriptions: a word the query has and the title lacks usually changes the food, not
 * the wording. Measured — "mercimek çorbası" matches the product "Mercimek" on exactly
 * 0.5, and dry lentils at 347 kcal are not a bowl of soup at 60.
 */
const MIN_OVERLAP = 0.6;

/**
 * What a brand word in the query is worth against a word in the product title.
 *
 * It cannot be worth nothing: ignoring it made "sütaş süzme yoğurt" answer with Eker's
 * yoghurt, whose brand line was then shown to the user as the source. It cannot be worth
 * a full word either, or "ülker" alone would let any Ülker product answer for any other.
 * At half a word the right brand outranks a rival's identical product, while a brand
 * word on its own tops out at 0.5 and cannot clear `MIN_OVERLAP` by itself.
 */
const BRAND_TOKEN_WEIGHT = 0.5;

/** Open Food Facts allows 10 searches a minute per IP. Leave headroom. */
const MAX_PER_MINUTE = 8;
const WINDOW_MS = 60_000;

/** Nothing on Earth is denser than pure fat, which is 900 kcal per 100 g. */
const MAX_KCAL_100G = 900;

/** Timestamps of the searches sent inside the current window, oldest first. */
const sentAt: number[] = [];

/** One outage prints one line, not one line per lookup. */
let degraded = false;

/**
 * This process's own share of the window. Synchronous, pure, and asked first — a request
 * that is already over the local share costs no round trip to find that out.
 *
 * Kept separate from `takeOffSlot` because it is also the only part that can be asserted
 * deterministically: `npm run check` runs with the real environment loaded, so a budget
 * test that went to the network would depend on whatever a live counter happened to hold.
 */
export function takeLocalOffSlot(): boolean {
  const now = Date.now();

  while (sentAt.length > 0 && now - sentAt[0]! >= WINDOW_MS) {
    sentAt.shift();
  }

  if (sentAt.length >= MAX_PER_MINUTE) {
    return false;
  }

  sentAt.push(now);

  return true;
}

/**
 * Consumes one slot of the rate budget. `false` means the caller must not call Open Food
 * Facts at all — not that the food is unknown. The caller has to keep those two apart,
 * because only the second may be cached. Whether the provider is switched on at all is
 * the pipeline's decision (`OFF_ENABLED`), made before any slot is asked for.
 *
 * The window used to be per process, which meant a second API instance got its own eight
 * a minute and doubled the real traffic against an address the provider counts as one.
 * The shared counter is what makes the budget describe the traffic rather than one copy
 * of it, and it fails closed — see `takeSharedSlot`.
 */
export async function takeOffSlot(): Promise<boolean> {
  return takeLocalOffSlot() && (await takeSharedSlot('off', MAX_PER_MINUTE, WINDOW_MS / 1000));
}

/** A number, or null. Values arriving as strings are rejected rather than coerced. */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The per-100 g figures, or null when they cannot be trusted. `energy-kcal_100g` is read
 * by name and never falls back to `energy_100g`, which is kilojoules — mistaking the two
 * is exactly how a cheese ends up at 1076 kcal.
 */
function readNutrients(nutriments: Record<string, unknown>): Nutrition100g | null {
  const kcal = asNumber(nutriments['energy-kcal_100g']);
  const protein = asNumber(nutriments.proteins_100g);
  const fat = asNumber(nutriments.fat_100g);
  const carbs = asNumber(nutriments.carbohydrates_100g);

  if (kcal === null || protein === null || fat === null || carbs === null) {
    return null;
  }

  // A zero also rejects the genuinely calorie-free drinks. They fall to the flagged
  // estimate, which is the cheaper mistake: a zero here is far more often a blank label.
  if (kcal <= 0 || kcal > MAX_KCAL_100G) {
    return null;
  }

  // Atwater: the macros have to add up to roughly the energy the label claims.
  const fromMacros = 4 * protein + 9 * fat + 4 * carbs;

  if (Math.abs(fromMacros - kcal) > Math.max(30, 0.3 * kcal)) {
    return null;
  }

  return { kcal, protein, fat, carbs };
}

interface OffProduct {
  code: string;
  name: string;
  brands: string;
  per100g: Nutrition100g;
}

/**
 * All knowledge of the response shape lives here. Search-a-licious is a younger API than
 * the rest of what this server talks to, so a change there should be one edit.
 */
function readOffProduct(raw: unknown): OffProduct | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const hit = raw as Record<string, unknown>;
  const code = typeof hit.code === 'string' ? hit.code : '';
  const name = typeof hit.product_name === 'string' ? hit.product_name.trim() : '';

  if (code === '' || name === '') {
    return null;
  }

  const nutriments =
    typeof hit.nutriments === 'object' && hit.nutriments !== null
      ? (hit.nutriments as Record<string, unknown>)
      : {};

  const per100g = readNutrients(nutriments);

  if (per100g === null) {
    return null;
  }

  const brands = Array.isArray(hit.brands)
    ? hit.brands.filter((brand): brand is string => typeof brand === 'string').join(', ')
    : typeof hit.brands === 'string'
      ? hit.brands
      : '';

  return { code, name, brands, per100g };
}

/**
 * Ranks the products a search returned, best first.
 *
 * Open Food Facts titles carry no `Primary, qualifier` convention — "Sütaş Tava Yoğurt"
 * is one phrase — so the whole title is passed as the primary segment and every word in
 * it that the query did not ask for is charged at the full rate. That is the right
 * reading here: a product title is chosen by the manufacturer to be exactly specific, so
 * an unasked-for word in it ("Tava", "Light", "Çikolatalı") is a different product rather
 * than a narrower description of the same one.
 */
export function rankMatches(query: string, hits: unknown[], limit = 3): FoodMatch[] {
  const queryTokens = contentTokens(query);

  if (queryTokens.length === 0) {
    return [];
  }

  const ranked: FoodMatch[] = [];

  for (const hit of hits) {
    // The top hit is often the one with a blank label while the second is the right
    // product, so a rejection has to keep the loop going.
    const product = readOffProduct(hit);

    if (product === null) {
      continue;
    }

    // The title carries the food, the brand line carries who made it. Both are evidence,
    // at the weights `BRAND_TOKEN_WEIGHT` explains.
    const nameTokens = contentTokens(product.name);
    const brandTokens = new Set(contentTokens(product.brands));
    const score = scoreRow(queryTokens, nameTokens, []);

    // A query word the title lacks may still be the maker's name. Worth half a word, and
    // only ever as a top-up on the title's own coverage.
    const brandOnly = queryTokens.filter(
      (token) => !nameTokens.includes(token) && brandTokens.has(token),
    ).length;
    const overlap = Math.min(
      1,
      score.coverage + (BRAND_TOKEN_WEIGHT * brandOnly) / queryTokens.length,
    );

    if (overlap < MIN_OVERLAP) {
      continue;
    }

    ranked.push({
      provider: 'off',
      id: product.code,
      description: product.name,
      detail: product.brands,
      per100g: product.per100g,
      matchScore: overlap,
      rank: RANK_WEIGHT * overlap + score.penalty + score.stateBonus,
    });
  }

  ranked.sort((a, b) => b.rank - a.rank);

  return ranked.slice(0, limit);
}

/** Exported for the hand-run check in `scripts/entries.check.ts`; nothing else calls it. */
export function pickBestMatch(query: string, hits: unknown[]): FoodMatch | null {
  return rankMatches(query, hits, 1)[0] ?? null;
}

/**
 * The products that could be this food, best first. Like the USDA provider it never
 * throws, and keeps `[]` apart from null for the same reason — but unlike it, the caller
 * must have taken a budget slot first.
 */
export const searchOffFood: SearchFood = async (query, language) => {
  const hits = await fetchOffHits(query, language);

  return hits === null ? null : rankMatches(query, hits, CANDIDATE_LIMIT);
};

/**
 * The search request on its own: the products Open Food Facts returned, unranked. Split
 * from the ranking for the same reason as the USDA one — so the rows can be recorded
 * once and every later change to `pickBestMatch` replayed against them for free.
 *
 * Null is an outage; `[]` is Open Food Facts answering that it holds nothing. Only the
 * second may ever be cached.
 */
export async function fetchOffHits(query: string, language: string): Promise<unknown[] | null> {
  const url =
    `${env.OFF_BASE_URL}/search?q=${encodeURIComponent(query)}` +
    `&langs=${encodeURIComponent(searchLangs(language))}` +
    `&page_size=${PAGE_SIZE}` +
    `&fields=${encodeURIComponent(SEARCH_FIELDS)}`;

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': env.OFF_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      // A 429 here means the budget above is set too high for the traffic.
      if (!degraded) {
        degraded = true;
        logError('off_unavailable', new Error(`status ${response.status}`), { query });
      }

      return null;
    }

    const body = (await response.json()) as { hits?: unknown };

    if (degraded) {
      degraded = false;
      log('off_recovered');
    }

    return Array.isArray(body.hits) ? body.hits : [];
  } catch (error) {
    if (!degraded) {
      degraded = true;
      logError('off_unavailable', error, { query });
    }

    return null;
  }
}
