import { randomUUID } from 'node:crypto';
import { getDatabase } from '@/lib/server/sqlite';

type Row = Record<string, unknown>;
type CrmPayload = Record<string, unknown>;

export interface CrmSavedRecord {
  id: string;
  externalId?: string;
  externalIdSource?: string;
  name?: string;
  mobile?: string;
  subjectName?: string;
  promotionName?: string;
  receivedAt: number;
  updatedAt: number;
  created: boolean;
}

export interface CrmPushSaveResult {
  count: number;
  records: CrmSavedRecord[];
}

interface CrmExtractedFields {
  id: string;
  externalId?: string;
  externalIdSource?: string;
  name?: string;
  mobile?: string;
  tel?: string;
  email?: string;
  weixin?: string;
  qq?: string;
  province?: string;
  city?: string;
  district?: string;
  area?: string;
  subjectName?: string;
  schoolName?: string;
  companyId?: string;
  companyName?: string;
  promotionId?: string;
  promotionName?: string;
  searchHost?: string;
  searchEngine?: string;
  chatId?: string;
  chatUrl?: string;
  firstUrl?: string;
  referUrl?: string;
  note?: string;
  payloadJson: string;
  receivedAt: number;
  updatedAt: number;
}

const EXTERNAL_ID_KEYS = [
  'cardId',
  'recordId',
  'clueId',
  'leadId',
  'chatId',
  'chat_id',
  'ssid',
  'visitorStaticId',
  'visitor_static_id',
];

function columnExists(tableName: string, columnName: string) {
  const rows = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all() as Row[];
  return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  if (!columnExists(tableName, columnName)) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

export function ensureCrmSchema() {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_records (
      id TEXT PRIMARY KEY,
      external_id TEXT,
      external_id_source TEXT,
      customer_name TEXT,
      mobile TEXT,
      tel TEXT,
      email TEXT,
      weixin TEXT,
      qq TEXT,
      province TEXT,
      city TEXT,
      district TEXT,
      area TEXT,
      subject_name TEXT,
      school_name TEXT,
      company_id TEXT,
      company_name TEXT,
      promotion_id TEXT,
      promotion_name TEXT,
      search_host TEXT,
      search_engine TEXT,
      chat_id TEXT,
      chat_url TEXT,
      first_url TEXT,
      refer_url TEXT,
      note TEXT,
      payload_json TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

  `);

  addColumnIfMissing('crm_records', 'external_id', 'TEXT');
  addColumnIfMissing('crm_records', 'external_id_source', 'TEXT');
  addColumnIfMissing('crm_records', 'customer_name', 'TEXT');
  addColumnIfMissing('crm_records', 'mobile', 'TEXT');
  addColumnIfMissing('crm_records', 'tel', 'TEXT');
  addColumnIfMissing('crm_records', 'email', 'TEXT');
  addColumnIfMissing('crm_records', 'weixin', 'TEXT');
  addColumnIfMissing('crm_records', 'qq', 'TEXT');
  addColumnIfMissing('crm_records', 'province', 'TEXT');
  addColumnIfMissing('crm_records', 'city', 'TEXT');
  addColumnIfMissing('crm_records', 'district', 'TEXT');
  addColumnIfMissing('crm_records', 'area', 'TEXT');
  addColumnIfMissing('crm_records', 'subject_name', 'TEXT');
  addColumnIfMissing('crm_records', 'school_name', 'TEXT');
  addColumnIfMissing('crm_records', 'company_id', 'TEXT');
  addColumnIfMissing('crm_records', 'company_name', 'TEXT');
  addColumnIfMissing('crm_records', 'promotion_id', 'TEXT');
  addColumnIfMissing('crm_records', 'promotion_name', 'TEXT');
  addColumnIfMissing('crm_records', 'search_host', 'TEXT');
  addColumnIfMissing('crm_records', 'search_engine', 'TEXT');
  addColumnIfMissing('crm_records', 'chat_id', 'TEXT');
  addColumnIfMissing('crm_records', 'chat_url', 'TEXT');
  addColumnIfMissing('crm_records', 'first_url', 'TEXT');
  addColumnIfMissing('crm_records', 'refer_url', 'TEXT');
  addColumnIfMissing('crm_records', 'note', 'TEXT');
  addColumnIfMissing('crm_records', 'payload_json', "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing('crm_records', 'received_at', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('crm_records', 'updated_at', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_records_external_identity
      ON crm_records (external_id_source, external_id)
      WHERE external_id IS NOT NULL AND external_id <> '';

    CREATE INDEX IF NOT EXISTS idx_crm_records_received_at
      ON crm_records (received_at);

    CREATE INDEX IF NOT EXISTS idx_crm_records_mobile
      ON crm_records (mobile);

    CREATE INDEX IF NOT EXISTS idx_crm_records_tel
      ON crm_records (tel);
  `);
}

function readText(payload: CrmPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string') {
      const text = value.trim();
      if (text) {
        return text;
      }
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
  }

  return undefined;
}

function readExternalIdentity(payload: CrmPayload) {
  for (const key of EXTERNAL_ID_KEYS) {
    const value = readText(payload, [key]);
    if (value) {
      return {
        externalId: value,
        externalIdSource: key,
      };
    }
  }

  return {};
}

function normalizePhoneNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const compactValue = value.replace(/[\s\-()]/g, '').trim();
  if (!compactValue) {
    return undefined;
  }

  if (compactValue.startsWith('+86') && compactValue.length > 3) {
    return compactValue.slice(3);
  }

  if (compactValue.startsWith('86') && compactValue.length === 13) {
    return compactValue.slice(2);
  }

  return compactValue;
}

function extractCrmFields(payload: CrmPayload, now: number): CrmExtractedFields {
  const externalIdentity = readExternalIdentity(payload);
  const mobile = normalizePhoneNumber(readText(payload, ['mobile', 'tel', 'phone']));
  const tel = normalizePhoneNumber(readText(payload, ['tel', 'mobile', 'phone']));

  return {
    id: `crm_${randomUUID()}`,
    ...externalIdentity,
    name: readText(payload, ['name', 'repName', 'userRealName']),
    mobile,
    tel,
    email: readText(payload, ['email']),
    weixin: readText(payload, ['weixin', 'wx', 'wechat']),
    qq: readText(payload, ['qq']),
    province: readText(payload, ['province']),
    city: readText(payload, ['city']),
    district: readText(payload, ['district']),
    area: readText(payload, ['area']),
    subjectName: readText(payload, ['subjectName', 'subject_name']),
    schoolName: readText(payload, ['schoolName', 'school_name']),
    companyId: readText(payload, ['companyId', 'company_id']),
    companyName: readText(payload, ['companyName', 'company_name']),
    promotionId: readText(payload, ['promotionId', 'promotion_id']),
    promotionName: readText(payload, ['promotionName', 'promotion_name']),
    searchHost: readText(payload, ['searchHost', 'search_host']),
    searchEngine: readText(payload, ['searchEngine', 'search_engine']),
    chatId: readText(payload, ['chatId', 'chat_id']),
    chatUrl: readText(payload, ['chatURL', 'chatUrl', 'chat_url']),
    firstUrl: readText(payload, ['firstUrl', 'first_url']),
    referUrl: readText(payload, ['refer', 'referUrl', 'refer_url']),
    note: readText(payload, ['note']),
    payloadJson: JSON.stringify(payload),
    receivedAt: now,
    updatedAt: now,
  };
}

function findExistingRecord(fields: CrmExtractedFields) {
  if (fields.externalId && fields.externalIdSource) {
    const row = getDatabase()
      .prepare(`
        SELECT id, received_at
        FROM crm_records
        WHERE external_id_source = ? AND external_id = ?
        LIMIT 1
      `)
      .get(fields.externalIdSource, fields.externalId) as Row | undefined;

    if (row) {
      return row;
    }
  }

  const phone = normalizePhoneNumber(fields.mobile) ?? normalizePhoneNumber(fields.tel);
  if (!phone) {
    return undefined;
  }

  return getDatabase()
    .prepare(`
      SELECT id, received_at
      FROM crm_records
      WHERE mobile = ? OR tel = ?
      ORDER BY updated_at DESC, received_at DESC
      LIMIT 1
    `)
    .get(phone, phone) as Row | undefined;
}

function nullable(value: string | undefined) {
  return value ?? null;
}

function rowInteger(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return fallback;
}

function insertCrmRecord(fields: CrmExtractedFields) {
  getDatabase()
    .prepare(`
      INSERT INTO crm_records (
        id,
        external_id,
        external_id_source,
        customer_name,
        mobile,
        tel,
        email,
        weixin,
        qq,
        province,
        city,
        district,
        area,
        subject_name,
        school_name,
        company_id,
        company_name,
        promotion_id,
        promotion_name,
        search_host,
        search_engine,
        chat_id,
        chat_url,
        first_url,
        refer_url,
        note,
        payload_json,
        received_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      fields.id,
      nullable(fields.externalId),
      nullable(fields.externalIdSource),
      nullable(fields.name),
      nullable(fields.mobile),
      nullable(fields.tel),
      nullable(fields.email),
      nullable(fields.weixin),
      nullable(fields.qq),
      nullable(fields.province),
      nullable(fields.city),
      nullable(fields.district),
      nullable(fields.area),
      nullable(fields.subjectName),
      nullable(fields.schoolName),
      nullable(fields.companyId),
      nullable(fields.companyName),
      nullable(fields.promotionId),
      nullable(fields.promotionName),
      nullable(fields.searchHost),
      nullable(fields.searchEngine),
      nullable(fields.chatId),
      nullable(fields.chatUrl),
      nullable(fields.firstUrl),
      nullable(fields.referUrl),
      nullable(fields.note),
      fields.payloadJson,
      fields.receivedAt,
      fields.updatedAt
    );
}

function updateCrmRecord(fields: CrmExtractedFields) {
  getDatabase()
    .prepare(`
      UPDATE crm_records
      SET
        external_id = COALESCE(?, external_id),
        external_id_source = COALESCE(?, external_id_source),
        customer_name = ?,
        mobile = ?,
        tel = ?,
        email = ?,
        weixin = ?,
        qq = ?,
        province = ?,
        city = ?,
        district = ?,
        area = ?,
        subject_name = ?,
        school_name = ?,
        company_id = ?,
        company_name = ?,
        promotion_id = ?,
        promotion_name = ?,
        search_host = ?,
        search_engine = ?,
        chat_id = ?,
        chat_url = ?,
        first_url = ?,
        refer_url = ?,
        note = ?,
        payload_json = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .run(
      nullable(fields.externalId),
      nullable(fields.externalIdSource),
      nullable(fields.name),
      nullable(fields.mobile),
      nullable(fields.tel),
      nullable(fields.email),
      nullable(fields.weixin),
      nullable(fields.qq),
      nullable(fields.province),
      nullable(fields.city),
      nullable(fields.district),
      nullable(fields.area),
      nullable(fields.subjectName),
      nullable(fields.schoolName),
      nullable(fields.companyId),
      nullable(fields.companyName),
      nullable(fields.promotionId),
      nullable(fields.promotionName),
      nullable(fields.searchHost),
      nullable(fields.searchEngine),
      nullable(fields.chatId),
      nullable(fields.chatUrl),
      nullable(fields.firstUrl),
      nullable(fields.referUrl),
      nullable(fields.note),
      fields.payloadJson,
      fields.updatedAt,
      fields.id
    );
}

function saveOneCrmRecord(payload: CrmPayload, now: number): CrmSavedRecord {
  const fields = extractCrmFields(payload, now);
  const existingRecord = findExistingRecord(fields);
  const created = !existingRecord;

  if (existingRecord) {
    fields.id = String(existingRecord.id);
    fields.receivedAt = rowInteger(existingRecord.received_at, fields.receivedAt);
    updateCrmRecord(fields);
  } else {
    insertCrmRecord(fields);
  }

  return {
    id: fields.id,
    externalId: fields.externalId,
    externalIdSource: fields.externalIdSource,
    name: fields.name,
    mobile: fields.mobile,
    subjectName: fields.subjectName,
    promotionName: fields.promotionName,
    receivedAt: fields.receivedAt,
    updatedAt: fields.updatedAt,
    created,
  };
}

export function saveCrmPushPayloads(payloads: CrmPayload[]): CrmPushSaveResult {
  ensureCrmSchema();

  const now = Date.now();
  const db = getDatabase();
  const records: CrmSavedRecord[] = [];

  db.exec('BEGIN;');
  try {
    payloads.forEach((payload) => {
      records.push(saveOneCrmRecord(payload, now));
    });
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return {
    count: records.length,
    records,
  };
}
