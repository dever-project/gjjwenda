import type { User } from '@/lib/appTypes';
import { upsertUser } from '@/lib/server/appStateRepository';
import { readFeishuCredentials, readFeishuSettings } from '@/lib/server/feishuRepository';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

interface FeishuAppAccessTokenResponse {
  code?: number;
  msg?: string;
  app_access_token?: string;
}

interface FeishuAccessTokenResponse {
  code?: number;
  msg?: string;
  data?: {
    open_id?: string;
    union_id?: string;
    user_id?: string;
    name?: string;
    en_name?: string;
    avatar_url?: string;
    mobile?: string;
    email?: string;
  };
}

export interface FeishuLoginConfig {
  enabled: boolean;
  appId: string;
}

function fallbackFeishuMessage(message?: string) {
  return message?.trim() || '未知错误';
}

function sanitizeId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

function buildFeishuUser(identity: NonNullable<FeishuAccessTokenResponse['data']>): User {
  const openId = identity.open_id?.trim();
  if (!openId) {
    throw new Error('飞书未返回 open_id');
  }

  const name = identity.name?.trim() || identity.en_name?.trim() || identity.mobile?.trim() || '飞书员工';
  return {
    id: `feishu_${sanitizeId(openId)}`,
    username: `feishu:${openId}`,
    name,
    role: 'student',
  };
}

async function postFeishuJson<T>(path: string, body: unknown, bearerToken?: string): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  if (bearerToken) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`飞书接口请求失败：${response.status}`);
  }

  return payload as T;
}

async function fetchFeishuAppAccessToken() {
  const credentials = readFeishuCredentials();
  const payload = await postFeishuJson<FeishuAppAccessTokenResponse>(
    '/auth/v3/app_access_token/internal',
    {
      app_id: credentials.appId,
      app_secret: credentials.appSecret,
    }
  );

  if (payload.code !== 0) {
    throw new Error(`飞书 app_access_token 获取失败：${fallbackFeishuMessage(payload.msg)}`);
  }
  if (!payload.app_access_token) {
    throw new Error('飞书未返回 app_access_token');
  }

  return payload.app_access_token;
}

async function fetchFeishuIdentity(code: string, appAccessToken: string) {
  const payload = await postFeishuJson<FeishuAccessTokenResponse>(
    '/authen/v1/access_token',
    {
      grant_type: 'authorization_code',
      code,
    },
    appAccessToken
  );

  if (payload.code !== 0) {
    throw new Error(`飞书身份换取失败：${fallbackFeishuMessage(payload.msg)}`);
  }
  if (!payload.data) {
    throw new Error('飞书未返回用户身份信息');
  }

  return payload.data;
}

export function readFeishuLoginConfig(): FeishuLoginConfig {
  const settings = readFeishuSettings();
  return {
    enabled: Boolean(settings.appId && settings.hasSecret),
    appId: settings.appId,
  };
}

export async function loginByFeishuCode(code: string): Promise<User> {
  const trimmedCode = code.trim();
  if (!trimmedCode) {
    throw new Error('飞书授权码不能为空');
  }

  const appAccessToken = await fetchFeishuAppAccessToken();
  const identity = await fetchFeishuIdentity(trimmedCode, appAccessToken);
  const user = buildFeishuUser(identity);
  return upsertUser(user, { preserveExistingRole: true });
}
