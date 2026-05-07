import { NextResponse } from 'next/server';
import type { DynamicAppDefinition } from '@/lib/appTypes';
import { searchFeishuBitableRecords } from '@/lib/server/feishuClient';
import { readAppState } from '@/lib/server/appStateRepository';
import { readFeishuCredentials } from '@/lib/server/feishuRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '读取应用数据失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

function isDynamicAppDefinition(value: unknown): value is DynamicAppDefinition {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as DynamicAppDefinition).version === 1 &&
      Array.isArray((value as DynamicAppDefinition).tables)
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ appId: string }> }
) {
  try {
    const { appId } = await params;
    const url = new URL(request.url);
    const tableId = url.searchParams.get('tableId') ?? undefined;
    const pageToken = url.searchParams.get('pageToken') ?? undefined;
    const rawPageSize = Number(url.searchParams.get('pageSize') ?? 100);
    const pageSize = Number.isFinite(rawPageSize) ? rawPageSize : 100;
    const state = readAppState();
    const app = state.dynamicApps.find((item) => item.id === appId);

    if (!app) {
      return NextResponse.json({ error: '应用不存在' }, { status: 404 });
    }
    if (!isDynamicAppDefinition(app.schemaPreview)) {
      return NextResponse.json({ error: '应用定义不是飞书动态应用格式' }, { status: 400 });
    }

    const table = tableId
      ? app.schemaPreview.tables.find((item) => item.id === tableId)
      : app.schemaPreview.tables[0];
    if (!table) {
      return NextResponse.json({ error: '应用未配置数据表' }, { status: 400 });
    }

    const fieldNames = table.fields.filter((field) => field.visible).map((field) => field.key);
    const page = await searchFeishuBitableRecords(readFeishuCredentials(), {
      appToken: table.source.appToken,
      tableId: table.source.tableId,
      viewId: table.source.viewId,
      pageToken,
      pageSize,
      fieldNames,
    });

    return NextResponse.json(page);
  } catch (error) {
    return errorResponse(error);
  }
}
