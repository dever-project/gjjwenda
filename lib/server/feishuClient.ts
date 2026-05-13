import type { FeishuSource } from '@/lib/appTypes';
import type { FeishuCredentials } from '@/lib/server/feishuRepository';

type JsonObject = Record<string, any>;

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const FEISHU_REQUEST_TIMEOUT_MS = 15_000;

let cachedToken: { token: string; expiresAt: number; appId: string } | null = null;

export interface FeishuBitableUrlInfo {
  appToken: string;
  tableId?: string;
  viewId?: string;
}

export interface FeishuBitableTable {
  tableId: string;
  name: string;
}

export interface FeishuBitableRecord {
  recordId: string;
  fields: JsonObject;
}

export interface FeishuBitableRecordPage {
  records: FeishuBitableRecord[];
  hasMore: boolean;
  pageToken?: string;
  total?: number;
}

export type FeishuBitableWritableFields = Record<string, string | number | boolean | null | string[]>;

export interface FeishuBitableWriteResult {
  recordId: string;
  fields: JsonObject;
}

function maskFeishuPath(path?: string) {
  return path
    ?.split('?')[0]
    .replace(/\/apps\/[^/]+/g, '/apps/<app_token>')
    .replace(/\/tables\/[^/]+/g, '/tables/<table_id>')
    .replace(/\/records\/[^/]+/g, '/records/<record_id>')
    .replace(/\/documents\/[^/]+/g, '/documents/<document_id>')
    .replace(/\/spreadsheets\/[^/]+/g, '/spreadsheets/<spreadsheet_token>');
}

async function readJson(response: Response, path?: string) {
  const payload = await response.json().catch(() => null);
  const maskedPath = maskFeishuPath(path);
  const feishuCode =
    payload && typeof payload === 'object' && payload.code !== undefined
      ? `，错误码：${payload.code}`
      : '';
  const feishuMessage =
    payload && typeof payload === 'object' && typeof payload.msg === 'string' && payload.msg
      ? `，消息：${payload.msg}`
      : '';
  if (!response.ok) {
    throw new Error(
      `飞书接口请求失败：${response.status}${maskedPath ? `（接口：${maskedPath}` : '（'}${feishuCode}${feishuMessage}）`
    );
  }

  if (payload && typeof payload === 'object' && payload.code && payload.code !== 0) {
    const message = payload.msg || `飞书接口返回错误码：${payload.code}`;
    throw new Error(
      `${message}${maskedPath ? `（接口：${maskedPath}，错误码：${payload.code}）` : `（错误码：${payload.code}）`}`
    );
  }

  return payload as JsonObject;
}

async function fetchWithTimeout(url: string, init: RequestInit | undefined, path: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, FEISHU_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      const maskedPath = maskFeishuPath(path);
      throw new Error(
        `飞书接口请求超时：${FEISHU_REQUEST_TIMEOUT_MS / 1000} 秒${maskedPath ? `（接口：${maskedPath}）` : ''}`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getTenantToken(credentials: FeishuCredentials) {
  const now = Date.now();
  if (cachedToken && cachedToken.appId === credentials.appId && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  const tokenPath = '/auth/v3/tenant_access_token/internal';
  const response = await fetchWithTimeout(
    `${FEISHU_API_BASE}${tokenPath}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: credentials.appId,
        app_secret: credentials.appSecret,
      }),
    },
    tokenPath
  );
  const payload = await readJson(response, tokenPath);
  const token = payload.tenant_access_token;
  if (!token) {
    throw new Error('飞书未返回 tenant_access_token');
  }

  cachedToken = {
    token,
    appId: credentials.appId,
    expiresAt: now + Number(payload.expire ?? 7200) * 1000,
  };

  return token;
}

async function feishuFetch(credentials: FeishuCredentials, path: string, init?: RequestInit) {
  const token = await getTenantToken(credentials);
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? 'GET';
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body || method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetchWithTimeout(`${FEISHU_API_BASE}${path}`, { ...init, headers }, path);

  return readJson(response, path);
}

export function extractFeishuToken(urlOrToken: string) {
  const value = urlOrToken.trim();
  if (!value) {
    return '';
  }

  const matched = value.match(/\/(?:docx|base|sheets|wiki|file)\/([A-Za-z0-9]+)/);
  if (matched?.[1]) {
    return matched[1];
  }

  const queryMatched = value.match(/[?&](?:token|spreadsheetToken|app_token)=([A-Za-z0-9]+)/);
  return queryMatched?.[1] ?? value;
}

function normalizeRecordFields(record: JsonObject) {
  return record.fields && typeof record.fields === 'object' ? record.fields : record;
}

function normalizeWriteRecord(payload: JsonObject, fallbackRecordId?: string): FeishuBitableWriteResult {
  const record = payload?.data?.record ?? payload?.data ?? payload?.record ?? {};
  const recordId = String(record.record_id ?? record.recordId ?? fallbackRecordId ?? '');
  if (!recordId) {
    throw new Error('飞书未返回 record_id');
  }

  return {
    recordId,
    fields: normalizeRecordFields(record),
  };
}

function buildQueryString(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  });

  const text = query.toString();
  return text ? `?${text}` : '';
}

function readNextPageToken(payload: JsonObject) {
  const data = payload?.data;
  const hasMoreValue = data?.has_more ?? data?.hasMore;
  const hasMore = hasMoreValue === true || hasMoreValue === 'true';
  if (!hasMore) {
    return '';
  }

  return String(data?.page_token ?? data?.pageToken ?? '');
}

function isWrongRequestBodyError(error: unknown) {
  return error instanceof Error && error.message.includes('WrongRequestBody');
}

function normalizeUrlTableId(tableId?: string | null) {
  const value = tableId?.trim();
  return value?.startsWith('tbl') ? value : undefined;
}

function readUrlParam(url: URL, names: string[]) {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value) {
      return value;
    }
  }

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const name of names) {
      const value = hashParams.get(name);
      if (value) {
        return value;
      }
    }
  }

  return undefined;
}

export function parseFeishuBitableUrl(urlOrToken: string): FeishuBitableUrlInfo {
  const value = urlOrToken.trim().replace(/[；;，,\s]+$/, '');
  if (!value) {
    throw new Error('请输入飞书多维表格 URL 或 app token');
  }

  const blockToken = value.match(/^([A-Za-z0-9]+)_(tbl[A-Za-z0-9]+)/);
  if (blockToken) {
    return { appToken: blockToken[1], tableId: blockToken[2] };
  }

  try {
    const url = new URL(value);
    const appToken = url.pathname.match(/\/base\/([A-Za-z0-9]+)/)?.[1] ?? '';
    const tableId = readUrlParam(url, ['table', 'table_id', 'tableId']);
    const viewId = readUrlParam(url, ['view', 'view_id', 'viewId']);

    if (appToken) {
      return { appToken, tableId: normalizeUrlTableId(tableId), viewId: viewId || undefined };
    }
  } catch {
    // Plain tokens are handled below.
  }

  const token = extractFeishuToken(value);
  if (!token) {
    throw new Error('无法从飞书链接中解析多维表格 app token');
  }

  return { appToken: token };
}

export async function readFeishuBitableTables(credentials: FeishuCredentials, appToken: string) {
  const tables: FeishuBitableTable[] = [];
  let pageToken = '';

  do {
    const query = buildQueryString({ page_size: 100, page_token: pageToken });
    const payload = await feishuFetch(
      credentials,
      `/bitable/v1/apps/${appToken}/tables${query}`
    );
    const items = payload?.data?.items ?? [];
    tables.push(
      ...items.map((item: JsonObject) => ({
        tableId: String(item.table_id ?? item.tableId ?? ''),
        name: String(item.name ?? item.table_name ?? '未命名数据表'),
      })).filter((item: FeishuBitableTable) => item.tableId)
    );
    pageToken = readNextPageToken(payload);
  } while (pageToken);

  return tables;
}

export async function readFeishuBitableFields(
  credentials: FeishuCredentials,
  appToken: string,
  tableId: string
) {
  const fields: JsonObject[] = [];
  let pageToken = '';

  do {
    const query = buildQueryString({ page_size: 100, page_token: pageToken });
    const payload = await feishuFetch(
      credentials,
      `/bitable/v1/apps/${appToken}/tables/${tableId}/fields${query}`
    );
    fields.push(...(payload?.data?.items ?? []));
    pageToken = readNextPageToken(payload);
  } while (pageToken);

  return fields;
}

export async function searchFeishuBitableRecords(
  credentials: FeishuCredentials,
  input: {
    appToken: string;
    tableId: string;
    viewId?: string;
    pageSize?: number;
    pageToken?: string;
    fieldNames?: string[];
  }
): Promise<FeishuBitableRecordPage> {
  const requestedPageSize = Number.isFinite(input.pageSize) ? input.pageSize : 100;
  const pageSize = Math.min(Math.max(requestedPageSize ?? 100, 1), 500);
  const readRecordPage = async (options: { includeOptionalParams: boolean }) => {
    const query = buildQueryString({
      page_size: pageSize,
      page_token: input.pageToken,
      view_id: options.includeOptionalParams ? input.viewId : undefined,
      field_names:
        options.includeOptionalParams && input.fieldNames?.length
          ? JSON.stringify(input.fieldNames)
          : undefined,
    });

    return feishuFetch(
      credentials,
      `/bitable/v1/apps/${input.appToken}/tables/${input.tableId}/records${query}`
    );
  };

  let payload: JsonObject;
  try {
    payload = await readRecordPage({ includeOptionalParams: true });
  } catch (error) {
    if (!isWrongRequestBodyError(error) || (!input.viewId && !input.fieldNames?.length)) {
      throw error;
    }

    payload = await readRecordPage({ includeOptionalParams: false });
  }

  const items = payload?.data?.items ?? [];
  const pageToken = readNextPageToken(payload);

  return {
    records: items.map((item: JsonObject) => ({
      recordId: String(item.record_id ?? ''),
      fields: normalizeRecordFields(item),
    })),
    hasMore: Boolean(pageToken),
    pageToken: pageToken || undefined,
    total: typeof payload?.data?.total === 'number' ? payload.data.total : undefined,
  };
}

export async function createFeishuBitableRecord(
  credentials: FeishuCredentials,
  input: {
    appToken: string;
    tableId: string;
    fields: FeishuBitableWritableFields;
  }
) {
  const payload = await feishuFetch(
    credentials,
    `/bitable/v1/apps/${input.appToken}/tables/${input.tableId}/records`,
    {
      method: 'POST',
      body: JSON.stringify({ fields: input.fields }),
    }
  );

  return normalizeWriteRecord(payload);
}

export async function updateFeishuBitableRecord(
  credentials: FeishuCredentials,
  input: {
    appToken: string;
    tableId: string;
    recordId: string;
    fields: FeishuBitableWritableFields;
  }
) {
  const payload = await feishuFetch(
    credentials,
    `/bitable/v1/apps/${input.appToken}/tables/${input.tableId}/records/${input.recordId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ fields: input.fields }),
    }
  );

  return normalizeWriteRecord(payload, input.recordId);
}

export async function readFeishuDocText(credentials: FeishuCredentials, source: FeishuSource) {
  const token = source.resourceToken || extractFeishuToken(source.resourceUrl);
  if (!token) {
    throw new Error(`${source.name} 缺少文档 token`);
  }

  const rawContent = await feishuFetch(credentials, `/docx/v1/documents/${token}/raw_content`);
  const content = rawContent?.data?.content ?? rawContent?.data?.raw_content ?? rawContent?.content;
  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  const blocks = await feishuFetch(credentials, `/docx/v1/documents/${token}/blocks?page_size=500`);
  const items = blocks?.data?.items ?? [];
  return items
    .map((item: JsonObject) => item.text?.content ?? item.heading1?.elements?.[0]?.text_run?.content ?? '')
    .filter(Boolean)
    .join('\n');
}

export async function readFeishuBitableRows(credentials: FeishuCredentials, source: FeishuSource) {
  const appToken = source.resourceToken || extractFeishuToken(source.resourceUrl);
  if (!appToken || !source.tableId) {
    throw new Error(`${source.name} 缺少多维表格 app token 或 table id`);
  }

  const rows: JsonObject[] = [];
  let pageToken = '';
  do {
    const page = await searchFeishuBitableRecords(credentials, {
      appToken,
      tableId: source.tableId,
      pageSize: 500,
      pageToken,
    });
    rows.push(...page.records.map((record) => record.fields));
    pageToken = page.pageToken || '';
  } while (pageToken);

  return rows;
}

export async function readFeishuSheetRows(credentials: FeishuCredentials, source: FeishuSource) {
  const spreadsheetToken = source.resourceToken || extractFeishuToken(source.resourceUrl);
  const sheetId = source.sheetId || 'Sheet1';
  if (!spreadsheetToken) {
    throw new Error(`${source.name} 缺少电子表格 token`);
  }

  const payload = await feishuFetch(
    credentials,
    `/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodeURIComponent(`${sheetId}!A1:Z5000`)}`
  );
  const values = payload?.data?.valueRange?.values ?? payload?.data?.values ?? [];
  if (!Array.isArray(values) || values.length < 2) {
    return [];
  }

  const headers = (values[0] as unknown[]).map((item: unknown) => String(item ?? '').trim());
  return (values.slice(1) as unknown[][]).map((row) =>
    headers.reduce((result: JsonObject, header, index) => {
      if (header) {
        result[header] = row[index];
      }
      return result;
    }, {})
  );
}
