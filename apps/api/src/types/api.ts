import type { SessionUser } from '../lib/auth.ts';
import type { EntryKind, EntryStatus, ItemCandidate, ParseResult } from './parse.ts';

export interface ErrorResponse {
  error: string;
}

export interface HealthResponse {
  status: 'ok';
}

export interface HelloResponse {
  message: string;
}

/** `GET /api/me` */
export interface MeResponse {
  user: SessionUser;
}

/** `POST /api/account/deletion-feedback` */
export interface DeletionFeedbackResponse {
  recorded: true;
}

export interface LogEntryDto {
  id: string;
  day: number;
  /** Minutes past local midnight, or null when the entry carries no time of day. */
  minuteOfDay: number | null;
  rawText: string;
  revision: number;
  status: EntryStatus;
  result: ParseResult | null;
  createdAt: string;
  updatedAt: string;
}

/** `PUT /api/entries/:id` */
export interface UpsertEntryRequest {
  rawText: string;
  day: number;
  revision: number;
  /**
   * Minutes past local midnight. The client sends it only when `day` is the device's today —
   * logging onto a past day says nothing about when that food was eaten. Only the first write
   * for an entry is kept, so editing a line at night cannot move a breakfast to dinner.
   */
  minuteOfDay: number | null;
}

export interface UpsertEntryResponse {
  entry: LogEntryDto;
}

/** `GET /api/entries?day=` or `?from=&to=` */
/**
 * One edit to one parsed item, as the client sends it.
 *
 * `itemIndex` is an index into the items of the revision named in the request — not into
 * whatever the list becomes as the batch is applied. A request that removes item 0 and
 * re-portions item 1 means the two rows the person was looking at.
 */
export type CorrectionOpRequest =
  | { type: 'pick_candidate'; itemIndex: number; candidateIndex: number }
  | { type: 'set_food'; itemIndex: number; food: ItemCandidate }
  | {
      type: 'set_portion';
      itemIndex: number;
      quantity: number;
      unit: string;
      /** An explicit weight, when the client knows one. Otherwise the unit decides. */
      grams?: number | null;
    }
  | { type: 'remove_item'; itemIndex: number }
  | {
      type: 'add_item';
      name: string;
      quantity: number;
      unit: string;
      kind: EntryKind;
      grams?: number | null;
      /** The database row this food was chosen from. Null for water, or for a bare guess. */
      food?: ItemCandidate | null;
    };

export interface CorrectEntryRequest {
  /** The revision the client is correcting. A mismatch is a 409, never a silent overwrite. */
  revision: number;
  ops: CorrectionOpRequest[];
}

/** The entry as it stands after the corrections, one revision on. */
export interface CorrectEntryResponse {
  entry: LogEntryDto;
}

/** Rows a person can pick from when none of an item's candidates were the food. */
export interface FoodSearchResponse {
  foods: ItemCandidate[];
}

export interface EntriesResponse {
  entries: LogEntryDto[];
}

/**
 * `GET /api/entries/days` — every day the user has a log on, oldest first. The client
 * walks between days on it, so it carries the day numbers alone and no entry bodies.
 */
export interface LoggedDaysResponse {
  days: number[];
}

/** `DELETE /api/entries/:id` */
export interface DeleteEntryResponse {
  deleted: true;
}

/**
 * `GET /api/suggestions?day=&minute=` — what to offer on an empty composer row, best first.
 *
 * Deliberately without a `ParseResult`: accepting a suggestion writes its text into the row
 * and lets the ordinary parse pipeline run, which hits the parse and USDA caches and so costs
 * next to nothing. Carrying a snapshot here would only add a way for it to go stale.
 */
export interface SuggestionDto {
  /** The canonical key it was grouped under. The client uses it as the list key. */
  key: string;
  /** The line to write into the row. */
  text: string;
  source: 'history' | 'bookmark' | 'both';
  score: number;
}

export interface SuggestionsResponse {
  suggestions: SuggestionDto[];
}

export interface SavedMealDto {
  id: string;
  text: string;
  status: EntryStatus;
  result: ParseResult | null;
  createdAt: string;
  updatedAt: string;
}

/** `GET /api/saved-meals` */
export interface SavedMealsResponse {
  savedMeals: SavedMealDto[];
}

/**
 * `PUT /api/saved-meals/:id`
 *
 * Bookmarking passes the entry's existing parse in `result`, so nothing is re-parsed. Editing
 * the text leaves `result` out and the server parses the new line.
 */
export interface SaveMealRequest {
  text: string;
  result?: ParseResult | null;
  sourceEntryId?: string | null;
}

export interface SaveMealResponse {
  savedMeal: SavedMealDto;
}

/** `DELETE /api/saved-meals/:id` */
export interface DeleteSavedMealResponse {
  deleted: true;
}
