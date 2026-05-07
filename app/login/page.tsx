'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore, type User } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildFeishuOAuthUrl,
  getFeishuAuthCode,
  isFeishuClient,
  loadFeishuSDK,
} from '@/lib/client/feishuLogin';

type FeishuStatus = 'idle' | 'loading' | 'success' | 'error';

interface FeishuLoginConfig {
  enabled: boolean;
  appId: string;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }

  return payload as T;
}

async function fetchFeishuConfig() {
  const response = await fetch('/api/auth/feishu/config', { cache: 'no-store' });
  return parseJsonResponse<FeishuLoginConfig>(response);
}

async function loginByFeishuCode(code: string) {
  const response = await fetch('/api/auth/feishu/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return parseJsonResponse<{ user: User }>(response);
}

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/student';
  }

  return value.startsWith('/admin') ? '/student' : value;
}

function readLoginParams() {
  if (typeof window === 'undefined') {
    return { code: '', nextPath: '/student' };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get('code') || '',
    nextPath: getSafeNextPath(params.get('next') || params.get('state')),
  };
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus>('idle');
  const [feishuMessage, setFeishuMessage] = useState('飞书内打开会自动登录；浏览器中可点击飞书登录。');
  const [nextPath, setNextPath] = useState('/student');
  const { users, setCurrentUser, refreshData } = useStore();
  const router = useRouter();
  const autoLoginTriggeredRef = useRef(false);

  const finishFeishuLogin = async (code: string, targetPath = nextPath) => {
    setFeishuStatus('loading');
    setFeishuMessage('正在校验飞书身份...');
    const { user } = await loginByFeishuCode(code);
    setCurrentUser(user);
    await refreshData();
    setFeishuStatus('success');
    setFeishuMessage('飞书登录成功，正在进入考试系统');
    toast.success('飞书登录成功');
    router.push(targetPath);
  };

  useEffect(() => {
    const { code: browserCode, nextPath: parsedNextPath } = readLoginParams();
    setNextPath(parsedNextPath);

    if (!browserCode || autoLoginTriggeredRef.current) {
      return;
    }

    autoLoginTriggeredRef.current = true;
    void finishFeishuLogin(browserCode, parsedNextPath).catch((error) => {
      setFeishuStatus('error');
      setFeishuMessage(error instanceof Error ? error.message : '飞书登录失败');
      toast.error(error instanceof Error ? error.message : '飞书登录失败');
    });
  }, []);

  useEffect(() => {
    if (!isFeishuClient() || autoLoginTriggeredRef.current) {
      return;
    }

    autoLoginTriggeredRef.current = true;
    setFeishuStatus('loading');
    setFeishuMessage('正在获取飞书身份...');

    void (async () => {
      const config = await fetchFeishuConfig();
      if (!config.enabled || !config.appId) {
        throw new Error('服务端未配置飞书登录');
      }

      const code = await getFeishuAuthCode(config.appId);
      await finishFeishuLogin(code);
    })().catch((error) => {
      setFeishuStatus('error');
      setFeishuMessage(error instanceof Error ? error.message : '飞书免登录失败');
    });
  }, []);

  useEffect(() => {
    if (isFeishuClient()) {
      void loadFeishuSDK().catch(() => undefined);
    }
  }, []);

  const handleLocalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((item) => item.username === username);
    if (!user || user.role !== 'admin') {
      toast.error('用户名或密码错误');
      return;
    }

    const userPassword = user.password || 'admin123';
    if (password !== userPassword) {
      toast.error('用户名或密码错误');
      return;
    }

    setCurrentUser(user);
    toast.success('登录成功');
    router.push(user.role === 'admin' ? '/admin' : '/student');
  };

  const handleBrowserFeishuLogin = async () => {
    setFeishuStatus('loading');
    setFeishuMessage('正在发起飞书登录...');

    try {
      const config = await fetchFeishuConfig();
      if (!config.enabled || !config.appId) {
        throw new Error('服务端未配置飞书登录');
      }

      const redirectUrl = new URL(window.location.pathname, window.location.origin);
      window.location.href = buildFeishuOAuthUrl(config.appId, redirectUrl.toString(), nextPath);
    } catch (error) {
      setFeishuStatus('error');
      const message = error instanceof Error ? error.message : '飞书登录发起失败';
      setFeishuMessage(message);
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-orange-100 w-12 h-12 rounded-full flex items-center justify-center mb-2">
            <BookOpen className="h-6 w-6 text-orange-600" />
          </div>
          <CardTitle className="text-2xl font-bold">Haven平台管理</CardTitle>
          <CardDescription>员工使用飞书登录，管理员使用本地账号</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
            <p className="text-sm font-medium text-orange-900">飞书登录</p>
            <p className="mt-1 text-xs text-orange-700">{feishuMessage}</p>
            <Button
              type="button"
              onClick={handleBrowserFeishuLogin}
              disabled={feishuStatus === 'loading'}
              className="mt-3 w-full bg-orange-500 hover:bg-orange-600"
            >
              {feishuStatus === 'loading' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              飞书登录
            </Button>
          </div>

          <form onSubmit={handleLocalLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">管理员账号</Label>
              <Input
                id="username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">管理员密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="admin123"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" className="w-full">
              管理员登录
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col text-sm text-slate-500 text-center">
          <p>飞书登录后的角色统一为员工</p>
          <p>管理员: admin / admin123</p>
        </CardFooter>
      </Card>
    </div>
  );
}
