import { apiFetch } from '@/shared/lib';
import type {
  DeleteSavedMealResponse,
  SavedMealsResponse,
  SaveMealRequest,
  SaveMealResponse,
} from '@/shared/api-types';

export const savedMealsKey = () => ['saved-meals'] as const;

export function fetchSavedMeals(): Promise<SavedMealsResponse> {
  return apiFetch<SavedMealsResponse>('/api/saved-meals');
}

/**
 * Bookmarking passes the entry's own parse in `result`, so nothing is re-read. Editing the
 * text leaves it out, and the server parses the new line.
 */
export function saveMeal(id: string, body: SaveMealRequest): Promise<SaveMealResponse> {
  return apiFetch<SaveMealResponse>(`/api/saved-meals/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteSavedMeal(id: string): Promise<DeleteSavedMealResponse> {
  return apiFetch<DeleteSavedMealResponse>(`/api/saved-meals/${id}`, { method: 'DELETE' });
}
