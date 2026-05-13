import { NextResponse } from 'next/server';
import { clearCrmFeishuSyncState } from '@/lib/server/crmRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '清空飞书同步状态失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST() {
  try {
    const resetCount = clearCrmFeishuSyncState();

    return NextResponse.json({
      success: true,
      resetCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
