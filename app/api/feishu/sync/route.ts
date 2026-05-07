import { NextResponse } from 'next/server';
import { runFeishuSync } from '@/lib/server/feishuSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '飞书同步失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST() {
  try {
    return NextResponse.json(await runFeishuSync());
  } catch (error) {
    return errorResponse(error);
  }
}
