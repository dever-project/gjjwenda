'use client';

import type { AppData, ExamAttempt } from '@/lib/appTypes';

const APP_STATE_ENDPOINT = '/api/app-state';
const EXAM_ATTEMPTS_ENDPOINT = '/api/exam-attempts';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `请求失败：${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchAppState(): Promise<AppData> {
  const response = await fetch(APP_STATE_ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
  });

  return parseJsonResponse<AppData>(response);
}

export async function saveAppState(data: AppData): Promise<void> {
  const response = await fetch(APP_STATE_ENDPOINT, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  await parseJsonResponse<AppData>(response);
}

export async function saveExamAttempt(attempt: ExamAttempt): Promise<void> {
  const response = await fetch(`${EXAM_ATTEMPTS_ENDPOINT}/${encodeURIComponent(attempt.id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(attempt),
  });

  await parseJsonResponse<ExamAttempt>(response);
}
