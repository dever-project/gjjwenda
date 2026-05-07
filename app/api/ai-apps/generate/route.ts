import { NextResponse } from 'next/server';
import { buildDynamicAppFromFeishu } from '@/lib/dynamic-apps/feishuAppBuilder';
import { readAppState, replaceAppState } from '@/lib/server/appStateRepository';
import { readFeishuCredentials } from '@/lib/server/feishuRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '生成飞书应用失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const sourceUrl = readText(data.sourceUrl) || readText(data.url);

    if (!sourceUrl) {
      return NextResponse.json({ error: '请输入飞书多维表格 URL' }, { status: 400 });
    }

    const app = await buildDynamicAppFromFeishu(readFeishuCredentials(), {
      sourceUrl,
      description: readText(data.description),
    });
    const state = readAppState();
    replaceAppState({
      ...state,
      dynamicApps: [...state.dynamicApps, app],
    });

    return NextResponse.json({ app });
  } catch (error) {
    return errorResponse(error);
  }
}
