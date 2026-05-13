#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 10000;

const baseUrlInput = process.argv[2] || process.env.CRM_PUSH_BASE_URL || DEFAULT_BASE_URL;
const crmPushToken = process.env.CRM_PUSH_TOKEN?.trim();
const timeoutMs = Number.parseInt(process.env.CRM_PUSH_TIMEOUT_MS || `${DEFAULT_TIMEOUT_MS}`, 10);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toUrl(pathname) {
  const url = new URL(baseUrlInput);
  url.pathname = pathname;
  url.search = '';
  return url;
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

async function submitCrmRecord(payload) {
  assert(crmPushToken, '请先设置 CRM_PUSH_TOKEN，并确保服务端使用同一个 token');

  const response = await fetch(toUrl('/api/crm/push'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CRM-PUSH-TOKEN': crmPushToken,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS),
  });
  const body = await readJsonResponse(response);

  assert(response.status === 201, `提交接口返回 HTTP ${response.status}，响应内容：${body.text}`);
  assert(body.json?.success === true, `提交接口没有返回 success=true，响应内容：${body.text}`);
}

async function fetchAdminRecords(chatId) {
  const url = toUrl('/api/crm/records');
  url.searchParams.set('search', chatId);
  url.searchParams.set('pageSize', '20');

  const response = await fetch(url, {
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS),
  });
  const body = await readJsonResponse(response);

  assert(response.status === 200, `后台列表接口返回 HTTP ${response.status}，响应内容：${body.text}`);
  assert(Array.isArray(body.json?.records), `后台列表接口没有返回 records 数组，响应内容：${body.text}`);

  return body.json.records;
}

async function main() {
  const chatId = `crm_admin_list_test_${Date.now()}_${uniqueDigits(6)}`;
  const mobile = `139${uniqueDigits(8)}`;
  const payload = {
    name: 'CRM后台列表测试',
    mobile,
    city: '杭州',
    province: '浙江',
    subjectName: 'DoublePlus 后台列表测试',
    promotionName: '后台列表入口',
    chatId,
    note: '由 scripts/test-crm-admin-records.mjs 提交',
  };

  console.log(`提交接口：${toUrl('/api/crm/push').href}`);
  console.log(`后台列表：${toUrl('/api/crm/records').href}`);
  console.log(`测试 chatId：${chatId}`);

  await submitCrmRecord(payload);
  const records = await fetchAdminRecords(chatId);
  const matched = records.find((record) => record.externalId === chatId);

  assert(matched, `后台列表没有查到刚提交的 CRM 记录：${chatId}`);
  assert(matched.customerName === payload.name, `后台列表 customerName 不正确：${matched.customerName}`);
  assert(matched.mobile === payload.mobile, `后台列表 mobile 不正确：${matched.mobile}`);
  assert(matched.city === payload.city, `后台列表 city 不正确：${matched.city}`);
  assert(matched.subjectName === payload.subjectName, `后台列表 subjectName 不正确：${matched.subjectName}`);

  console.log('后台 CRM 列表接口验证成功。');
  console.log(`crm_records.id：${matched.id}`);
  console.log(`customerName：${matched.customerName}`);
  console.log(`mobile：${matched.mobile}`);
}

main().catch((error) => {
  console.error('后台 CRM 列表接口测试失败。');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
