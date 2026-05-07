import { NextResponse } from 'next/server';
import type { AppData } from '@/lib/appTypes';
import { replaceAppState, readAppState } from '@/lib/server/appStateRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeAppData(payload: unknown): AppData {
  const data: Partial<AppData> =
    payload && typeof payload === 'object' ? (payload as Partial<AppData>) : {};

  return {
    users: asArray(data.users),
    questions: asArray(data.questions),
    examConfigs: asArray(data.examConfigs),
    publishedExams: asArray(data.publishedExams),
    examAttempts: asArray(data.examAttempts),
    dynamicApps: asArray(data.dynamicApps),
    knowledgeCategories: asArray(data.knowledgeCategories),
    knowledgeArticles: asArray(data.knowledgeArticles),
    trainingProgress: asArray(data.trainingProgress),
    syncRuns: asArray(data.syncRuns),
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'SQLite 数据操作失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(readAppState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const data = normalizeAppData(payload);
    return NextResponse.json(replaceAppState(data));
  } catch (error) {
    return errorResponse(error);
  }
}
