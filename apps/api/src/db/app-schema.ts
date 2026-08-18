import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const accountDeletionFeedback = pgTable('account_deletion_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  email: text('email').notNull(),
  /** A `DELETION_REASONS` id, not its label, so the copy can change. */
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const DELETION_REASONS = [
  'not_using',
  'missing_features',
  'found_alternative',
  'too_expensive',
  'privacy',
  'other',
] as const;

export type DeletionReason = (typeof DELETION_REASONS)[number];

export function isDeletionReason(value: unknown): value is DeletionReason {
  return typeof value === 'string' && (DELETION_REASONS as readonly string[]).includes(value);
}
