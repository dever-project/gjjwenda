#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_DB_PATH = 'data/gjj.sqlite';
const DEFAULT_TIMEOUT_MS = 10000;

const baseUrlInput = process.argv[2] || process.env.CRM_PUSH_BASE_URL || DEFAULT_BASE_URL;
const crmPushToken = process.env.CRM_PUSH_TOKEN?.trim();
const timeoutMs = Number.parseInt(process.env.CRM_PUSH_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolveDatabasePath() {
  const configuredPath = process.env.SQLITE_DB_PATH || DEFAULT_DB_PATH;
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(process.cwd(), configuredPath);
}

function toEndpoint(input) {
  const baseUrl = new URL(input);
  return new URL('/api/crm/push', baseUrl);
}

function uniqueDigits(length) {
  return randomUUID().replace(/\D/g, '').padEnd(length, '0').slice(0, length);
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function submitCrmRecord(endpoint, payload) {
  assert(crmPushToken, '请先设置 CRM_PUSH_TOKEN，并确保服务端使用同一个 token');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CRM-PUSH-TOKEN': crmPushToken,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS),
  });
  const body = await readJsonResponse(response);

  assert(response.status === 201, `接口返回 HTTP ${response.status}，响应内容：${body.text}`);
  assert(body.json?.success === true, `接口没有返回 success=true，响应内容：${body.text}`);
  assert(body.json?.count === 1, `接口没有返回 count=1，响应内容：${body.text}`);
  assert(Array.isArray(body.json?.records), `接口没有返回 records 数组，响应内容：${body.text}`);
  assert(body.json.records.length === 1, `接口 records 数量不为 1，响应内容：${body.text}`);

  return body.json.records[0];
}

function readInsertedCrmRecord(databasePath, chatId) {
  assert(existsSync(databasePath), `找不到 SQLite 数据库文件：${databasePath}`);

  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return db
      .prepare(`
        SELECT
          id,
          external_id,
          external_id_source,
          customer_name,
          mobile,
          city,
          subject_name,
          promotion_name,
          note,
          payload_json,
          received_at,
          updated_at
        FROM crm_records
        WHERE external_id_source = 'chatId'
          AND external_id = ?
        LIMIT 1
      `)
      .get(chatId);
  } finally {
    db.close();
  }
}

function verifyInsertedRecord(row, payload, apiRecord) {
  assert(row, `数据库 crm_records 未查到 chatId=${payload.chatId} 的记录`);
  assert(row.id === apiRecord.id, `数据库 id 与接口返回不一致：db=${row.id}, api=${apiRecord.id}`);
  assert(row.external_id === payload.chatId, `数据库 external_id 不正确：${row.external_id}`);
  assert(row.external_id_source === 'chatId', `数据库 external_id_source 不正确：${row.external_id_source}`);
  assert(row.customer_name === payload.name, `数据库 customer_name 不正确：${row.customer_name}`);
  assert(row.mobile === payload.mobile, `数据库 mobile 不正确：${row.mobile}`);
  assert(row.city === payload.city, `数据库 city 不正确：${row.city}`);
  assert(row.subject_name === payload.subjectName, `数据库 subject_name 不正确：${row.subject_name}`);
  assert(row.promotion_name === payload.promotionName, `数据库 promotion_name 不正确：${row.promotion_name}`);
  assert(row.note === payload.note, `数据库 note 不正确：${row.note}`);

  const rawPayload = JSON.parse(row.payload_json);
  assert(rawPayload.chatId === payload.chatId, '数据库 payload_json 未保存原始 chatId');
  assert(rawPayload.mobile === payload.mobile, '数据库 payload_json 未保存原始 mobile');
}

async function main() {
  const endpoint = toEndpoint(baseUrlInput);
  const databasePath = resolveDatabasePath();
  const chatId = `crm_submit_test_${Date.now()}_${uniqueDigits(6)}`;
  const mobile = `138${uniqueDigits(8)}`;
  const payload = {
    name: 'CRM接口入库测试',
    mobile,
    city: '上海',
    province: '上海',
    district: '浦东新区',
    subjectName: 'DoublePlus 入库测试',
    promotionName: '接口测试',
    searchHost: 'test-script',
    searchEngine: 'local',
    chatId,
    chatURL: `https://example.com/chat/${chatId}`,
    firstUrl: 'https://example.com/landing',
    refer: 'https://example.com/source',
    note: '由 scripts/test-crm-push.mjs 提交并验证入库',
  };

  console.log(`提交接口：${endpoint.href}`);
  console.log(`检查数据库：${databasePath}`);
  console.log(`测试 chatId：${chatId}`);

  const apiRecord = await submitCrmRecord(endpoint, payload);
  console.log(`接口提交成功：id=${apiRecord.id}`);

  const row = readInsertedCrmRecord(databasePath, chatId);
  verifyInsertedRecord(row, payload, apiRecord);

  console.log('数据库入库验证成功。');
  console.log(`crm_records.id：${row.id}`);
  console.log(`customer_name：${row.customer_name}`);
  console.log(`mobile：${row.mobile}`);
}

main().catch((error) => {
  console.error('CRM 接口入库测试失败。');
  console.error(error instanceof Error ? error.message : error);
  console.error('');
  console.error('请先启动本地服务：npm run dev');
  console.error('默认检查数据库：data/gjj.sqlite');
  console.error('如数据库路径不同，请设置 SQLITE_DB_PATH=/path/to/gjj.sqlite');
  process.exit(1);
});
