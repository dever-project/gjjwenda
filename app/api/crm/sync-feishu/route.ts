import { NextResponse } from 'next/server';
import { syncCrmRecordsToFeishu } from '@/lib/server/crmFeishuSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readPositiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  return undefined;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'CRM 记录同步到飞书失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

    return NextResponse.json(
      await syncCrmRecordsToFeishu({
        targetUrl: typeof data.targetUrl === 'string' ? data.targetUrl : undefined,
        limit: readPositiveInteger(data.limit),
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}
