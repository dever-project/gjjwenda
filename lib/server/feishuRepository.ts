import type { FeishuSource, SyncRun } from '@/lib/appTypes';
import { ensureAppStateSchema } from '@/lib/server/appStateRepository';
import { getDatabase } from '@/lib/server/sqlite';

type Row = Record<string, unknown>;

export interface FeishuSettingsSnapshot {
  appId: string;
  hasSecret: boolean;
  secretPreview?: string;
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
  sources: FeishuSource[];
}

function ensureFeishuSchema() {
  ensureAppStateSchema();
  getDatabase().exec(`
    CREATE TABLE IF NOT EXISTS feishu_settings (
      id TEXT PRIMARY KEY,
      app_id TEXT,
      app_secret TEXT,
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
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
    .prepare('SELECT app_id, app_secret, updated_at FROM feishu_settings WHERE id = ?')
    .get('default') as Row | undefined;
  const appId = optionalString(row?.app_id) ?? '';
  const appSecret = optionalString(row?.app_secret);

  return {
    appId,
    hasSecret: Boolean(appSecret),
    secretPreview: maskSecret(appSecret),
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

export function saveFeishuSettings(input: SaveFeishuSettingsInput) {
  ensureFeishuSchema();
  const db = getDatabase();
  const existing = db
    .prepare('SELECT app_secret FROM feishu_settings WHERE id = ?')
    .get('default') as Row | undefined;
  const appSecret =
    input.appSecret && input.appSecret.trim()
      ? input.appSecret.trim()
      : optionalString(existing?.app_secret) ?? '';

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.prepare(`
      INSERT INTO feishu_settings (id, app_id, app_secret, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_id = excluded.app_id,
        app_secret = excluded.app_secret,
        updated_at = excluded.updated_at
    `).run('default', input.appId.trim(), appSecret, Date.now());

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
