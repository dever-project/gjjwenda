'use client';

import { useEffect, useState } from 'react';
import type { FeishuSource } from '@/store/useStore';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

interface FeishuSettingsResponse {
  appId: string;
  hasSecret: boolean;
  secretPreview?: string;
  openaiBaseUrl: string;
  hasOpenaiApiKey: boolean;
  openaiApiKeyPreview?: string;
  openaiModel: string;
  sources: FeishuSource[];
}

const DEFAULT_SOURCES: FeishuSource[] = [
  {
    id: 'knowledge_doc',
    name: '销售人员培训知识库',
    sourceType: 'knowledge_doc',
    resourceType: 'docx',
    resourceUrl: '',
    enabled: true,
  },
  {
    id: 'case_doc',
    name: '案例库',
    sourceType: 'case_doc',
    resourceType: 'docx',
    resourceUrl: '',
    enabled: true,
  },
  {
    id: 'question_table',
    name: '题库表',
    sourceType: 'question_table',
    resourceType: 'bitable',
    resourceUrl: '',
    enabled: true,
  },
  {
    id: 'config_table',
    name: '问卷配置表',
    sourceType: 'config_table',
    resourceType: 'bitable',
    resourceUrl: '',
    enabled: true,
  },
];

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }

  return payload as T;
}

export default function AdminFeishuPage() {
  const { refreshData } = useStore();
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [secretPreview, setSecretPreview] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState(DEFAULT_OPENAI_BASE_URL);
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiApiKeyPreview, setOpenaiApiKeyPreview] = useState('');
  const [openaiModel, setOpenaiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [sources, setSources] = useState<FeishuSource[]>(DEFAULT_SOURCES);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetch('/api/feishu/settings', { cache: 'no-store' })
      .then((response) => parseJsonResponse<FeishuSettingsResponse>(response))
      .then((settings) => {
        setAppId(settings.appId ?? '');
        setSecretPreview(settings.secretPreview ?? '');
        setOpenaiBaseUrl(settings.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL);
        setOpenaiApiKeyPreview(settings.openaiApiKeyPreview ?? '');
        setOpenaiModel(settings.openaiModel ?? DEFAULT_OPENAI_MODEL);
        setSources(settings.sources.length > 0 ? settings.sources : DEFAULT_SOURCES);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : '读取基础设置失败'));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/feishu/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId, appSecret, openaiBaseUrl, openaiApiKey, openaiModel, sources }),
      });
      const settings = await parseJsonResponse<FeishuSettingsResponse>(response);
      setSecretPreview(settings.secretPreview ?? '');
      setOpenaiBaseUrl(settings.openaiBaseUrl ?? DEFAULT_OPENAI_BASE_URL);
      setOpenaiApiKeyPreview(settings.openaiApiKeyPreview ?? '');
      setOpenaiModel(settings.openaiModel ?? DEFAULT_OPENAI_MODEL);
      setAppSecret('');
      setOpenaiApiKey('');
      toast.success('基础设置已保存');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/feishu/sync', { method: 'POST' });
      const settings = await parseJsonResponse<FeishuSettingsResponse>(response);
      setSources(settings.sources.length > 0 ? settings.sources : sources);
      await refreshData();
      toast.success('飞书同步完成，请到题库和考试配置检查结果');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '同步失败');
      await refreshData();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">基础设置</h1>
          <p className="mt-1 text-sm text-slate-500">飞书和 AI 凭据只保存在服务端 SQLite，不进入前端全局状态。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={isSaving}>
            <Save className="mr-2 h-4 w-4" /> 保存设置
          </Button>
          <Button onClick={handleSync} disabled={isSyncing} className="bg-orange-600 hover:bg-orange-700">
            <RefreshCw className="mr-2 h-4 w-4" /> {isSyncing ? '同步中...' : '手动同步'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>飞书应用</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>AppID</Label>
            <Input value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="cli_xxx" />
          </div>
          <div className="space-y-2">
            <Label>App Secret {secretPreview ? `（当前：${secretPreview}）` : ''}</Label>
            <Input
              value={appSecret}
              onChange={(event) => setAppSecret(event.target.value)}
              placeholder="留空表示不修改 Secret"
              type="password"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 模型</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>OpenAI Base URL</Label>
            <Input
              value={openaiBaseUrl}
              onChange={(event) => setOpenaiBaseUrl(event.target.value)}
              placeholder={DEFAULT_OPENAI_BASE_URL}
            />
          </div>
          <div className="space-y-2">
            <Label>模型名称</Label>
            <Input
              value={openaiModel}
              onChange={(event) => setOpenaiModel(event.target.value)}
              placeholder={DEFAULT_OPENAI_MODEL}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>API Key {openaiApiKeyPreview ? `（当前：${openaiApiKeyPreview}）` : ''}</Label>
            <Input
              value={openaiApiKey}
              onChange={(event) => setOpenaiApiKey(event.target.value)}
              placeholder="留空表示不修改 API Key"
              type="password"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
