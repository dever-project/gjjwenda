import { NextResponse } from 'next/server';
import { readFeishuLoginConfig } from '@/lib/server/feishuAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(readFeishuLoginConfig());
}
