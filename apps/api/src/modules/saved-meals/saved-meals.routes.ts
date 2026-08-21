import { Router, type Request, type Response } from 'express';

import type {
  DeleteSavedMealResponse,
  SavedMealsResponse,
  SaveMealResponse,
} from '../../types/index.ts';
import { PARSE_BUDGET, rateLimit } from '../../lib/ratelimit.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import { requireId, requireUuid } from '../entries/entries.validation.ts';
import { deleteSavedMeal, listSavedMeals, saveMeal } from './saved-meals.service.ts';
import { parseSaveMealBody } from './saved-meals.validation.ts';

export const savedMealsRouter: Router = Router();

savedMealsRouter.get(
  '/api/saved-meals',
  requireSession,
  async (req: Request, res: Response<SavedMealsResponse>) => {
    const savedMeals = await listSavedMeals(req.session!.user.id);

    res.json({ savedMeals });
  },
);

savedMealsRouter.put(
  '/api/saved-meals/:id',
  requireSession,
  rateLimit(PARSE_BUDGET),
  async (req: Request, res: Response<SaveMealResponse>) => {
    const savedMeal = await saveMeal(
      req.session!.user.id,
      requireUuid(req.params.id),
      req.requestId,
      parseSaveMealBody(req.body),
    );

    res.json({ savedMeal });
  },
);

savedMealsRouter.delete(
  '/api/saved-meals/:id',
  requireSession,
  async (req: Request, res: Response<DeleteSavedMealResponse>) => {
    await deleteSavedMeal(req.session!.user.id, requireId(req.params.id));

    res.json({ deleted: true });
  },
);
