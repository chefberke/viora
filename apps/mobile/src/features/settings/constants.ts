/**
 * The ids must match `DELETION_REASONS` in `apps/api/src/db/app-schema.ts`, which rejects
 * anything else. Only the labels live here, so the copy can change without a migration.
 */
export const DELETION_REASONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'not_using', label: "I don't use it enough" },
  { id: 'missing_features', label: "It's missing features I need" },
  { id: 'found_alternative', label: 'I found a better app' },
  { id: 'too_expensive', label: 'Too expensive' },
  { id: 'privacy', label: 'Privacy concerns' },
  { id: 'other', label: 'Something else' },
];

/** What the confirmation step requires, letter for letter. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';
