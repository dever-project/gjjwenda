import { NextResponse } from 'next/server';
import { saveCrmPushPayloads } from '@/lib/server/crmRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonObject = Record<string, unknown>;

class BadRequestError extends Error {}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formDataToObject(formData: FormData) {
  const payload: JsonObject = {};

  formData.forEach((value, key) => {
    payload[key] = typeof value === 'string' ? value : value.name;
  });

  return payload;
}

function parseJsonString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = value.trim();
  if (!text.startsWith('{') && !text.startsWith('[')) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function readPayload(request: Request) {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    try {
      return await request.json();
    } catch {
      throw new BadRequestError('请求体不是合法 JSON');
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await request.text();
    return Object.fromEntries(new URLSearchParams(body));
  }

  if (contentType.includes('multipart/form-data')) {
    return formDataToObject(await request.formData());
  }

  const body = await request.text();
  if (!body.trim()) {
    throw new BadRequestError('请求体不能为空');
  }

  try {
    return JSON.parse(body);
  } catch {
    if (body.includes('=')) {
      return Object.fromEntries(new URLSearchParams(body));
    }
    throw new BadRequestError('请求体需要是 JSON 或表单数据');
  }
}

function normalizePayloads(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => normalizePayloadItem(item, index));
  }

  if (isJsonObject(payload)) {
    const nestedPayload =
      parseJsonString(payload.records) ??
      parseJsonString(payload.items) ??
      parseJsonString(payload.data);
    if (nestedPayload !== undefined) {
      return normalizePayloads(nestedPayload);
    }

    if (Array.isArray(payload.records)) {
      return payload.records.map((item, index) => normalizePayloadItem(item, index));
    }

    if (Array.isArray(payload.items)) {
      return payload.items.map((item, index) => normalizePayloadItem(item, index));
    }

    if (Array.isArray(payload.data)) {
      return payload.data.map((item, index) => normalizePayloadItem(item, index));
    }

    if (isJsonObject(payload.data)) {
      return [payload.data];
    }

    return [payload];
  }

  throw new BadRequestError('CRM 推送内容必须是对象或对象数组');
}

function normalizePayloadItem(item: unknown, index: number) {
  if (!isJsonObject(item)) {
    throw new BadRequestError(`第 ${index + 1} 条 CRM 记录必须是对象`);
  }

  return item;
}

function errorResponse(error: unknown) {
  if (error instanceof BadRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : 'CRM 推送入库失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/crm/push',
    method: 'POST',
    body: 'JSON 对象、JSON 对象数组、{ records: [...] }、{ items: [...] }、{ data: [...] } 或表单字段',
    stored: '原始字段完整写入 payload_json，并抽取姓名、电话、地区、项目、渠道、会话等常用字段到独立列',
  });
}

export async function POST(request: Request) {
  try {
    const payload = await readPayload(request);
    const payloads = normalizePayloads(payload);
    const result = saveCrmPushPayloads(payloads);

    return NextResponse.json(
      {
        success: true,
        ...result,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
