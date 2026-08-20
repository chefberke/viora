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
import { log, logError } from '../../utils/index.ts';
import { foldTokens } from './entries.text.ts';
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

/** Only the fields the match needs. The full product document is far larger. */
const SEARCH_FIELDS = 'code,product_name,brands,nutriments';

/** Beats the USDA `Branded` weight of 1, loses to `SR Legacy` at 2 and `Foundation` at 3. */
const RANK_WEIGHT = 1.5;

/**
 * Product names run long ("Ülker Çikolatalı Gofret 36 g"), so USDA's flat per-token
 * penalty would eat most of the weight above. This one is a share of the name's length.
 */
const EXTRA_TOKEN_PENALTY = 0.4;

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
 * Consumes one slot of the rate budget. `false` means the caller must not call Open Food
 * Facts at all — not that the food is unknown. The caller has to keep those two apart,
 * because only the second may be cached. Whether the provider is switched on at all is
 * the pipeline's decision (`OFF_ENABLED`), made before any slot is asked for.
 *
 * The window is per process. A second API instance gets its own budget and doubles the
 * real traffic against the shared IP; scaling out means moving this to a Redis counter
 * that fails closed.
 */
export function takeOffSlot(): boolean {
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

/** Exported for the hand-run check in `scripts/entries.check.ts`; nothing else calls it. */
export function pickBestMatch(query: string, hits: unknown[]): FoodMatch | null {
  const queryTokens = foldTokens(query);

  if (queryTokens.length === 0) {
    return null;
  }

  let best: FoodMatch | null = null;
  let bestRank = -Infinity;

  for (const hit of hits) {
    // The top hit is often the one with a blank label while the second is the right
    // product, so a rejection has to keep the loop going.
    const product = readOffProduct(hit);

    if (product === null) {
      continue;
    }

    // The title carries the food, the brand line carries who made it. Both are evidence,
    // at the weights `BRAND_TOKEN_WEIGHT` explains.
    const nameTokens = foldTokens(product.name);
    const brandTokens = foldTokens(product.brands);

    let nameMatched = 0;
    let weighted = 0;

    for (const token of queryTokens) {
      if (nameTokens.includes(token)) {
        nameMatched += 1;
        weighted += 1;
      } else if (brandTokens.includes(token)) {
        weighted += BRAND_TOKEN_WEIGHT;
      }
    }

    const overlap = weighted / queryTokens.length;

    if (overlap < MIN_OVERLAP) {
      continue;
    }

    // Only the title is measured for length: a brand line lists every name a product is
    // sold under, and none of those make the row less specific.
    const extraTokens = Math.max(0, nameTokens.length - nameMatched);
    const penalty =
      nameTokens.length === 0 ? 0 : (EXTRA_TOKEN_PENALTY * extraTokens) / nameTokens.length;
    const rank = RANK_WEIGHT * overlap - penalty;

    if (rank > bestRank) {
      bestRank = rank;
      best = {
        provider: 'off',
        id: product.code,
        description: product.name,
        detail: product.brands,
        per100g: product.per100g,
        matchScore: overlap,
        rank,
      };
    }
  }

  return best;
}

/**
 * Finds the best product match for a name the user wrote themselves. Like the USDA
 * provider it never throws and returns null for both "nothing matched" and "the service
 * was unreachable" — but unlike it, the caller must have taken a budget slot first.
 */
export const searchOffFood: SearchFood = async (query, language) => {
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

    return pickBestMatch(query, Array.isArray(body.hits) ? body.hits : []);
  } catch (error) {
    if (!degraded) {
      degraded = true;
      logError('off_unavailable', error, { query });
    }

    return null;
  }
};
