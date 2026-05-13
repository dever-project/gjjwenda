import type { FeishuSource, SyncRun } from '@/lib/appTypes';
import { ensureAppStateSchema } from '@/lib/server/appStateRepository';
import { getDatabase } from '@/lib/server/sqlite';

type Row = Record<string, unknown>;

export interface FeishuSettingsSnapshot {
  appId: string;
  hasSecret: boolean;
  secretPreview?: string;
  openaiBaseUrl: string;
  hasOpenaiApiKey: boolean;
  openaiApiKeyPreview?: string;
  openaiModel: string;
  sources: FeishuSource[];
  syncRuns: SyncRun[];
  updatedAt?: number;
}

export interface FeishuCredentials {
  appId: string;
  appSecret: string;
}

export interface SaveFeishuSettingsInput {
  appId: string;
  appSecret?: string;
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  sources: FeishuSource[];
}

export interface OpenAiSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

function ensureFeishuSchema() {
  ensureAppStateSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS feishu_settings (
      id TEXT PRIMARY KEY,
      app_id TEXT,
      app_secret TEXT,
      openai_base_url TEXT,
      openai_api_key TEXT,
      openai_model TEXT,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS feishu_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_url TEXT NOT NULL,
      resource_token TEXT,
      table_id TEXT,
      sheet_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_synced_at INTEGER
    );
  `);
  addColumnIfMissing('feishu_settings', 'openai_base_url', 'TEXT');
  addColumnIfMissing('feishu_settings', 'openai_api_key', 'TEXT');
  addColumnIfMissing('feishu_settings', 'openai_model', 'TEXT');
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const exists = (getDatabase().prepare(`PRAGMA table_info(${tableName})`).all() as Row[]).some(
    (row) => row.name === columnName
  );
  if (!exists) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

function optionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return undefined;
}

function selectSources(): FeishuSource[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM feishu_sources
    ORDER BY id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    sourceType:
      row.source_type === 'case_doc'
        ? 'case_doc'
        : row.source_type === 'question_table'
          ? 'question_table'
          : row.source_type === 'config_table'
            ? 'config_table'
            : 'knowledge_doc',
    resourceType:
      row.resource_type === 'bitable' ? 'bitable' : row.resource_type === 'sheet' ? 'sheet' : 'docx',
    resourceUrl: String(row.resource_url),
    resourceToken: optionalString(row.resource_token),
    tableId: optionalString(row.table_id),
    sheetId: optionalString(row.sheet_id),
    enabled: Boolean(row.enabled),
    lastSyncedAt: optionalNumber(row.last_synced_at),
  }));
}

function selectSyncRuns(): SyncRun[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM sync_runs
    ORDER BY started_at DESC, id ASC
    LIMIT 50
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    sourceId: optionalString(row.source_id),
    sourceName: optionalString(row.source_name),
    status: row.status === 'failed' ? 'failed' : row.status === 'running' ? 'running' : 'success',
    message: optionalString(row.message),
    questionsImported: Number(row.questions_imported ?? 0),
    configsImported: Number(row.configs_imported ?? 0),
    articlesImported: Number(row.articles_imported ?? 0),
    startedAt: Number(row.started_at ?? Date.now()),
    finishedAt: optionalNumber(row.finished_at),
  }));
}

function maskSecret(secret?: string) {
  if (!secret) {
    return undefined;
  }

  if (secret.length <= 8) {
    return '********';
  }

  return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

export function readFeishuSettings(): FeishuSettingsSnapshot {
  ensureFeishuSchema();
  const row = getDatabase()
    .prepare(`
      SELECT app_id, app_secret, openai_base_url, openai_api_key, openai_model, updated_at
      FROM feishu_settings
      WHERE id = ?
    `)
    .get('default') as Row | undefined;
  const appId = optionalString(row?.app_id) ?? '';
  const appSecret = optionalString(row?.app_secret);
  const openaiApiKey = optionalString(row?.openai_api_key);

  return {
    appId,
    hasSecret: Boolean(appSecret),
    secretPreview: maskSecret(appSecret),
    openaiBaseUrl: optionalString(row?.openai_base_url) ?? DEFAULT_OPENAI_BASE_URL,
    hasOpenaiApiKey: Boolean(openaiApiKey),
    openaiApiKeyPreview: maskSecret(openaiApiKey),
    openaiModel: optionalString(row?.openai_model) ?? DEFAULT_OPENAI_MODEL,
    sources: selectSources(),
    syncRuns: selectSyncRuns(),
    updatedAt: optionalNumber(row?.updated_at),
  };
}

export function readFeishuCredentials(): FeishuCredentials {
  ensureFeishuSchema();
  const row = getDatabase()
    .prepare('SELECT app_id, app_secret FROM feishu_settings WHERE id = ?')
    .get('default') as Row | undefined;
  const appId = optionalString(row?.app_id);
  const appSecret = optionalString(row?.app_secret);

  if (!appId || !appSecret) {
    throw new Error('请先配置飞书 AppID 和 Secret');
  }

  return { appId, appSecret };
}

export function readOpenAiSettings(): OpenAiSettings {
  ensureFeishuSchema();
  const row = getDatabase()
    .prepare(`
      SELECT openai_base_url, openai_api_key, openai_model
      FROM feishu_settings
      WHERE id = ?
    `)
    .get('default') as Row | undefined;
  const apiKey = optionalString(row?.openai_api_key);
  if (!apiKey) {
    throw new Error('请先在基础设置里配置 OpenAI API Key');
  }

  return {
    baseUrl: optionalString(row?.openai_base_url) ?? DEFAULT_OPENAI_BASE_URL,
    apiKey,
    model: optionalString(row?.openai_model) ?? DEFAULT_OPENAI_MODEL,
  };
}

export function saveFeishuSettings(input: SaveFeishuSettingsInput) {
  ensureFeishuSchema();
  const db = getDatabase();
  const existing = db
    .prepare('SELECT app_secret, openai_api_key FROM feishu_settings WHERE id = ?')
    .get('default') as Row | undefined;
  const appSecret =
    input.appSecret && input.appSecret.trim()
      ? input.appSecret.trim()
      : optionalString(existing?.app_secret) ?? '';
  const openaiApiKey =
    input.openaiApiKey && input.openaiApiKey.trim()
      ? input.openaiApiKey.trim()
      : optionalString(existing?.openai_api_key) ?? '';
  const openaiBaseUrl = normalizeOptionalString(input.openaiBaseUrl) || DEFAULT_OPENAI_BASE_URL;
  const openaiModel = normalizeOptionalString(input.openaiModel) || DEFAULT_OPENAI_MODEL;

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO feishu_settings (
        id, app_id, app_secret, openai_base_url, openai_api_key, openai_model, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_id = excluded.app_id,
        app_secret = excluded.app_secret,
        openai_base_url = excluded.openai_base_url,
        openai_api_key = excluded.openai_api_key,
        openai_model = excluded.openai_model,
        updated_at = excluded.updated_at
    `).run('default', input.appId.trim(), appSecret, openaiBaseUrl, openaiApiKey, openaiModel, Date.now());

    db.exec('DELETE FROM feishu_sources;');
    const insertSource = db.prepare(`
      INSERT INTO feishu_sources (
        id, name, source_type, resource_type, resource_url, resource_token,
        table_id, sheet_id, enabled, last_synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    input.sources.forEach((source) => {
      insertSource.run(
        source.id,
        source.name,
        source.sourceType,
        source.resourceType,
        source.resourceUrl,
        source.resourceToken ?? null,
        source.tableId ?? null,
        source.sheetId ?? null,
        source.enabled ? 1 : 0,
        source.lastSyncedAt ?? null
      );
    });

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return readFeishuSettings();
}

export function updateSourceSyncedAt(sourceId: string, syncedAt: number) {
  ensureFeishuSchema();
  getDatabase().prepare(`
    UPDATE feishu_sources
    SET last_synced_at = ?
    WHERE id = ?
  `).run(syncedAt, sourceId);
}

export function insertSyncRun(syncRun: SyncRun) {
  ensureFeishuSchema();
  getDatabase().prepare(`
    INSERT INTO sync_runs (
      id, source_id, source_name, status, message, questions_imported, configs_imported,
      articles_imported, started_at, finished_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    syncRun.id,
    syncRun.sourceId ?? null,
    syncRun.sourceName ?? null,
    syncRun.status,
    syncRun.message ?? null,
    syncRun.questionsImported,
    syncRun.configsImported,
    syncRun.articlesImported,
    syncRun.startedAt,
    syncRun.finishedAt ?? null
  );
}
