import { NextResponse } from 'next/server';
import { loginByFeishuCode } from '@/lib/server/feishuAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '飞书登录失败';
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const code = readText(data.code);
    const user = await loginByFeishuCode(code);

    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
