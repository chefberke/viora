import { Router, type Request, type Response } from 'express';

import { rateLimit, SEARCH_BUDGET } from '../../lib/ratelimit.ts';
import type { FoodSearchResponse } from '../../types/index.ts';
import { requireSession } from '../auth/auth.middleware.ts';
import { searchFoods } from './foods.service.ts';
import { parseFoodSearchQuery } from './foods.validation.ts';

export const foodsRouter: Router = Router();

/** The rows a person can choose from when the parser's own candidates were all wrong. */
foodsRouter.get(
  '/api/foods/search',
  requireSession,
  rateLimit(SEARCH_BUDGET),
  async (req: Request, res: Response<FoodSearchResponse>) => {
    const { q, language } = parseFoodSearchQuery(req.query);

    res.json({ foods: await searchFoods(q, language) });
  },
);
