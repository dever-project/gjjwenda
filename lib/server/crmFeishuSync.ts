import type { FeishuBitableWritableFields } from '@/lib/server/feishuClient';
import {
  createFeishuBitableRecord,
  parseFeishuBitableUrl,
  readFeishuBitableFields,
  readFeishuBitableTables,
  searchFeishuBitableRecords,
  updateFeishuBitableRecord,
} from '@/lib/server/feishuClient';
import {
  countPendingCrmRecordsForFeishuSync,
  listPendingCrmRecordsForFeishuSync,
  markCrmRecordFeishuSyncFailed,
  markCrmRecordFeishuSynced,
  type PendingCrmFeishuRecord,
} from '@/lib/server/crmRepository';
import { readFeishuCredentials, type FeishuCredentials } from '@/lib/server/feishuRepository';

type JsonObject = Record<string, unknown>;

export interface CrmFeishuTarget {
  appToken: string;
  tableId: string;
}

export interface CrmFeishuSyncInput {
  targetUrl?: string;
  limit?: number;
}

export interface CrmFeishuSyncError {
  id: string;
  customerName?: string;
  message: string;
}

export interface CrmFeishuSyncResult {
  success: boolean;
  target: CrmFeishuTarget;
  totalPendingBefore: number;
  totalPendingAfter: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skippedFieldNames: string[];
  errors: CrmFeishuSyncError[];
}

const MAX_SYNC_LIMIT = 200;
const DEFAULT_SYNC_LIMIT = MAX_SYNC_LIMIT;
const WRITE_INTERVAL_MS = 140;
const REQUIRED_ID_FIELD = 'CRM记录ID';

const CRM_FIELD_ALIASES: Array<[string, (record: PendingCrmFeishuRecord) => unknown]> = [
  [REQUIRED_ID_FIELD, (record) => record.id],
  ['外部ID', (record) => record.externalId],
  ['外部ID来源', (record) => record.externalIdSource],
  ['客户姓名', (record) => record.customerName],
  ['姓名', (record) => record.customerName],
  ['手机号', (record) => record.mobile || record.tel],
  ['电话', (record) => record.tel || record.mobile],
  ['邮箱', (record) => record.email],
  ['微信', (record) => record.weixin],
  ['QQ', (record) => record.qq],
  ['省份', (record) => record.province],
  ['城市', (record) => record.city],
  ['区县', (record) => record.district],
  ['地区', (record) => record.area || [record.province, record.city, record.district].filter(Boolean).join(' / ')],
  ['项目名称', (record) => record.subjectName],
  ['项目', (record) => record.subjectName],
  ['校区名称', (record) => record.schoolName],
  ['公司ID', (record) => record.companyId],
  ['公司名称', (record) => record.companyName],
  ['推广渠道ID', (record) => record.promotionId],
  ['推广渠道名称', (record) => record.promotionName],
  ['推广渠道', (record) => record.promotionName],
  ['客户来源', (record) => record.searchHost],
  ['搜索引擎', (record) => record.searchEngine],
  ['对话ID', (record) => record.chatId],
  ['对话链接', (record) => record.chatUrl],
  ['落地页URL', (record) => record.firstUrl],
  ['来源页URL', (record) => record.referUrl],
  ['备注', (record) => record.note],
  ['原始JSON', (record) => JSON.stringify(record.payload)],
  ['首次入库时间', (record) => formatTimestamp(record.receivedAt)],
  ['最近更新时间', (record) => formatTimestamp(record.updatedAt)],
  ['飞书同步时间', () => formatTimestamp(Date.now())],
  ['同步状态', () => '已同步'],
];

function normalizeSyncLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return DEFAULT_SYNC_LIMIT;
  }

  return Math.min(MAX_SYNC_LIMIT, Math.max(1, Math.floor(value ?? DEFAULT_SYNC_LIMIT)));
}

function readTargetUrl(input: CrmFeishuSyncInput) {
  const targetUrl = input.targetUrl?.trim() || process.env.CRM_FEISHU_TABLE_URL?.trim();
  if (!targetUrl) {
    throw new Error('请先填写飞书多维表格地址');
  }

  return targetUrl;
}

function formatTimestamp(value: number | undefined) {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function fieldNameFromFeishuField(field: JsonObject) {
  const value = field.field_name ?? field.fieldName ?? field.name;
  return typeof value === 'string' ? value.trim() : '';
}

function toWritableValue(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const text = String(value).trim();
  if (!text) {
    return undefined;
  }

  return text.length > 20000 ? `${text.slice(0, 20000)}...` : text;
}

function readFeishuCellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map(readFeishuCellText).join('').trim();
  }

  if (typeof value === 'object') {
    const cell = value as JsonObject;
    return readFeishuCellText(cell.text ?? cell.name ?? cell.value);
  }

  return '';
}

function buildWritableFields(record: PendingCrmFeishuRecord, existingFieldNames: Set<string>) {
  const writableFields: FeishuBitableWritableFields = {};
  const skippedFieldNames = new Set<string>();

  CRM_FIELD_ALIASES.forEach(([fieldName, readValue]) => {
    if (!existingFieldNames.has(fieldName)) {
      skippedFieldNames.add(fieldName);
      return;
    }

    const value = toWritableValue(readValue(record));
    if (value !== undefined) {
      writableFields[fieldName] = value;
    }
  });

  return {
    writableFields,
    skippedFieldNames,
  };
}

function isMissingRemoteRecord(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('RecordIdNotFound') ||
      error.message.includes('WrongRecordId') ||
      error.message.includes('1254006'))
  );
}

async function resolveTarget(credentials: FeishuCredentials, targetUrl: string): Promise<CrmFeishuTarget> {
  const parsed = parseFeishuBitableUrl(targetUrl);
  if (parsed.tableId) {
    return {
      appToken: parsed.appToken,
      tableId: parsed.tableId,
    };
  }

  const tables = await readFeishuBitableTables(credentials, parsed.appToken);
  if (tables.length === 1) {
    return {
      appToken: parsed.appToken,
      tableId: tables[0].tableId,
    };
  }

  throw new Error('飞书地址未包含具体数据表 table_id，请从目标数据表页面复制完整地址后再同步');
}

async function readWritableFieldNames(credentials: FeishuCredentials, target: CrmFeishuTarget) {
  const fields = await readFeishuBitableFields(credentials, target.appToken, target.tableId);
  const fieldNames = new Set(fields.map(fieldNameFromFeishuField).filter(Boolean));

  if (!fieldNames.has(REQUIRED_ID_FIELD)) {
    throw new Error(`目标飞书表格缺少字段：${REQUIRED_ID_FIELD}`);
  }

  return fieldNames;
}

async function readExistingCrmRecordMap(
  credentials: FeishuCredentials,
  target: CrmFeishuTarget,
  crmRecordIds: string[]
) {
  const remainingCrmRecordIds = new Set(crmRecordIds);
  const existingRecordMap = new Map<string, string>();
  let pageToken = '';

  while (remainingCrmRecordIds.size > 0) {
    const page = await searchFeishuBitableRecords(credentials, {
      appToken: target.appToken,
      tableId: target.tableId,
      pageSize: 500,
      pageToken,
      fieldNames: [REQUIRED_ID_FIELD],
    });

    page.records.forEach((record) => {
      const crmRecordId = readFeishuCellText(record.fields[REQUIRED_ID_FIELD]);
      if (!remainingCrmRecordIds.has(crmRecordId)) {
        return;
      }

      existingRecordMap.set(crmRecordId, record.recordId);
      remainingCrmRecordIds.delete(crmRecordId);
    });

    if (!page.pageToken) {
      break;
    }

    pageToken = page.pageToken;
  }

  return existingRecordMap;
}

function candidateRemoteRecordIds(record: PendingCrmFeishuRecord, existingRecordMap: Map<string, string>) {
  const recordIds = [record.feishuRecordId, existingRecordMap.get(record.id)].filter(Boolean) as string[];
  return [...new Set(recordIds)];
}

async function writeOneCrmRecordToFeishu(
  credentials: FeishuCredentials,
  target: CrmFeishuTarget,
  record: PendingCrmFeishuRecord,
  existingFieldNames: Set<string>,
  existingRecordMap: Map<string, string>
) {
  const { writableFields, skippedFieldNames } = buildWritableFields(record, existingFieldNames);

  for (const remoteRecordId of candidateRemoteRecordIds(record, existingRecordMap)) {
    try {
      const result = await updateFeishuBitableRecord(credentials, {
        appToken: target.appToken,
        tableId: target.tableId,
        recordId: remoteRecordId,
        fields: writableFields,
      });
      return {
        mode: 'updated' as const,
        feishuRecordId: result.recordId,
        skippedFieldNames,
      };
    } catch (error) {
      if (!isMissingRemoteRecord(error)) {
        throw error;
      }
    }
  }

  const result = await createFeishuBitableRecord(credentials, {
    appToken: target.appToken,
    tableId: target.tableId,
    fields: writableFields,
  });

  return {
    mode: 'created' as const,
    feishuRecordId: result.recordId,
    skippedFieldNames,
  };
}

export async function syncCrmRecordsToFeishu(input: CrmFeishuSyncInput = {}): Promise<CrmFeishuSyncResult> {
  const credentials = readFeishuCredentials();
  const target = await resolveTarget(credentials, readTargetUrl(input));
  const existingFieldNames = await readWritableFieldNames(credentials, target);
  const limit = normalizeSyncLimit(input.limit);
  const totalPendingBefore = countPendingCrmRecordsForFeishuSync();
  const records = listPendingCrmRecordsForFeishuSync(limit);
  const existingRecordMap = records.length > 0
    ? await readExistingCrmRecordMap(credentials, target, records.map((record) => record.id))
    : new Map<string, string>();
  const skippedFieldNames = new Set<string>();
  const errors: CrmFeishuSyncError[] = [];
  let created = 0;
  let updated = 0;

  for (const record of records) {
    try {
      const result = await writeOneCrmRecordToFeishu(
        credentials,
        target,
        record,
        existingFieldNames,
        existingRecordMap
      );
      result.skippedFieldNames.forEach((fieldName) => skippedFieldNames.add(fieldName));

      if (result.mode === 'created') {
        created += 1;
      } else {
        updated += 1;
      }

      markCrmRecordFeishuSynced(record.id, result.feishuRecordId, Date.now());
      await sleep(WRITE_INTERVAL_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : '同步到飞书失败';
      markCrmRecordFeishuSyncFailed(record.id, message);
      errors.push({
        id: record.id,
        customerName: record.customerName,
        message,
      });
    }
  }

  const failed = errors.length;
  return {
    success: failed === 0,
    target,
    totalPendingBefore,
    totalPendingAfter: countPendingCrmRecordsForFeishuSync(),
    processed: records.length,
    created,
    updated,
    failed,
    skippedFieldNames: [...skippedFieldNames].sort(),
    errors,
  };
}
