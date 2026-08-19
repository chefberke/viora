import type { SessionUser } from '../lib/auth.ts';
import type { EntryStatus, ParseResult } from './parse.ts';

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
}

export interface UpsertEntryResponse {
  entry: LogEntryDto;
}

/** `GET /api/entries?day=` or `?from=&to=` */
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
