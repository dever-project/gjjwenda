import { NextResponse } from 'next/server';
import type { FeishuSource } from '@/lib/appTypes';
import { readFeishuSettings, saveFeishuSettings } from '@/lib/server/feishuRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function asSources(value: unknown): FeishuSource[] {
  return Array.isArray(value) ? (value as FeishuSource[]) : [];
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '基础设置操作失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(readFeishuSettings());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    return NextResponse.json(
      saveFeishuSettings({
        appId: typeof data.appId === 'string' ? data.appId : '',
        appSecret: typeof data.appSecret === 'string' ? data.appSecret : undefined,
        openaiBaseUrl: typeof data.openaiBaseUrl === 'string' ? data.openaiBaseUrl : undefined,
        openaiApiKey: typeof data.openaiApiKey === 'string' ? data.openaiApiKey : undefined,
        openaiModel: typeof data.openaiModel === 'string' ? data.openaiModel : undefined,
        sources: asSources(data.sources),
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
