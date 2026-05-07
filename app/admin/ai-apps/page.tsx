'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, Trash2, ExternalLink, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }

  return payload as T;
}

function getDefinitionSummary(schema: unknown) {
  const data = schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : {};
  const tables = Array.isArray(data.tables) ? data.tables : [];
  const views = Array.isArray(data.views) ? data.views : [];
  const fieldCount = tables.reduce((count, table) => {
    if (!table || typeof table !== 'object') {
      return count;
    }

    const fields = (table as Record<string, unknown>).fields;
    return count + (Array.isArray(fields) ? fields.length : 0);
  }, 0);

  return { tableCount: tables.length, viewCount: views.length, fieldCount };
}

export default function AiAppsPage() {
  const { dynamicApps, deleteDynamicApp, refreshData } = useStore();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    if (!url.trim()) {
      toast.error('请输入飞书多维表格 URL');
      return;
    }
    
    setIsGenerating(true);
    try {
      const response = await fetch('/api/ai-apps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceUrl: url, description }),
      });
      const result = await parseJsonResponse<{ app: { id: string } }>(response);
      await refreshData();
      toast.success('飞书应用已生成');
      setIsGenerateOpen(false);
      setUrl('');
      setDescription('');
      router.push(`/admin/ai-apps/${result.app.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-orange-500" />
          飞书应用工厂
        </h2>
        <Button onClick={() => setIsGenerateOpen(true)} className="bg-orange-600 hover:bg-orange-700">
          <Sparkles className="w-4 h-4 mr-2" />
          接入飞书生成应用
        </Button>
        <Dialog open={isGenerateOpen} onOpenChange={setIsGenerateOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>根据飞书多维表格生成系统应用</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>飞书多维表格 URL</Label>
                <Input 
                  placeholder="https://xxx.feishu.cn/base/..." 
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>应用需求描述（选填）</Label>
                <textarea 
                  className="w-full flex min-h-[80px] rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="例如：这是一个 CRM 线索管理应用，重点关注负责人、跟进状态和成交进度。" 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsGenerateOpen(false)} disabled={isGenerating}>取消</Button>
              <Button onClick={handleGenerate} className="bg-orange-600 hover:bg-orange-700" disabled={isGenerating}>
                {isGenerating ? '读取飞书中...' : '生成系统应用'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>
      
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {dynamicApps.map(app => {
            const summary = getDefinitionSummary(app.schemaPreview);

            return (
              <div key={app.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-slate-800">{app.name}</h3>
                    <div className="p-1.5 rounded-full bg-orange-50 text-orange-600">
                      <Database className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-4 line-clamp-2">{app.description}</p>
                  <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="text-sm font-bold text-slate-800">{summary.tableCount}</p>
                      <p className="text-[10px] text-slate-400">数据表</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="text-sm font-bold text-slate-800">{summary.fieldCount}</p>
                      <p className="text-[10px] text-slate-400">字段</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2 py-2">
                      <p className="text-sm font-bold text-slate-800">{summary.viewCount}</p>
                      <p className="text-[10px] text-slate-400">视图</p>
                    </div>
                  </div>
                  {app.sourceUrl && (
                    <p className="text-[10px] text-slate-400 truncate">来源: {app.sourceUrl}</p>
                  )}
                </div>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteDynamicApp(app.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => router.push(`/admin/ai-apps/${app.id}`)}>
                    进入应用 <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          {dynamicApps.length === 0 && (
            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-500">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>暂无飞书应用，接入一个多维表格后会自动生成系统内部页面。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
