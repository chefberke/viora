import type { SessionUser } from '../lib/auth.ts';

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
