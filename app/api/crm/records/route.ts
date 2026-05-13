import { NextResponse } from 'next/server';
import { listCrmRecords } from '@/lib/server/crmRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readPositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '读取 CRM 记录失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const page = readPositiveInteger(url.searchParams.get('page'), 1);
    const pageSize = readPositiveInteger(url.searchParams.get('pageSize'), 50);

    return NextResponse.json(listCrmRecords({ search, page, pageSize }));
  } catch (error) {
    return errorResponse(error);
  }
}
