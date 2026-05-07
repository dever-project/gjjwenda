'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DynamicAppDefinition,
  DynamicAppField,
  DynamicAppMetric,
  DynamicAppTable,
  DynamicAppView,
} from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Database, LayoutDashboard, RefreshCw, Search, Table as TableIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DynamicRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

interface RecordPageResponse {
  records: DynamicRecord[];
  hasMore: boolean;
  pageToken?: string;
  total?: number;
}

function isDynamicDefinition(value: unknown): value is DynamicAppDefinition {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as DynamicAppDefinition).version === 1 &&
      Array.isArray((value as DynamicAppDefinition).tables)
  );
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join('、');
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return (
      stringifyValue(objectValue.text) ||
      stringifyValue(objectValue.name) ||
      stringifyValue(objectValue.en_name) ||
      stringifyValue(objectValue.link) ||
      stringifyValue(objectValue.url) ||
      stringifyValue(objectValue.file_token) ||
      JSON.stringify(value)
    );
  }

  return String(value);
}

function formatDateValue(value: unknown) {
  const text = stringifyValue(value);
  if (!text) {
    return '-';
  }

  const timestamp = Number(text);
  if (Number.isFinite(timestamp) && timestamp > 10_000) {
    return new Date(timestamp).toLocaleString();
  }

  return text;
}

function renderFieldValue(field: DynamicAppField, value: unknown) {
  const text = field.type === 'date' ? formatDateValue(value) : stringifyValue(value);
  if (!text) {
    return <span className="text-slate-300">-</span>;
  }

  if (field.type === 'boolean') {
    return <Badge variant={text === 'true' || text === '1' || text === '是' ? 'default' : 'secondary'}>{text}</Badge>;
  }

  if (field.type === 'select' || field.type === 'multiSelect') {
    return (
      <div className="flex flex-wrap gap-1">
        {text.split('、').map((item) => (
          <Badge key={item} variant="secondary">{item}</Badge>
        ))}
      </div>
    );
  }

  if (field.type === 'url' && /^https?:\/\//.test(text)) {
    return <a className="text-orange-600 hover:underline" href={text} target="_blank" rel="noreferrer">打开链接</a>;
  }

  return <span className="line-clamp-2">{text}</span>;
}

function parseJsonResponse<T>(response: Response): Promise<T> {
  return response.json().then((payload) => {
    if (!response.ok) {
      throw new Error(payload?.error || `请求失败：${response.status}`);
    }

    return payload as T;
  });
}

function findViewTable(definition: DynamicAppDefinition, view: DynamicAppView | undefined) {
  if (!view) {
    return definition.tables[0];
  }

  return definition.tables.find((table) => table.id === view.tableId) ?? definition.tables[0];
}

function getViewFields(table: DynamicAppTable, view: DynamicAppView | undefined) {
  if (view?.type === 'table') {
    const allowedKeys = new Set(view.fieldKeys);
    return table.fields.filter((field) => allowedKeys.has(field.key));
  }

  return table.fields.filter((field) => field.visible).slice(0, 8);
}

function isRecordMatched(record: DynamicRecord, query: string) {
  if (!query) {
    return true;
  }

  return Object.values(record.fields).some((value) =>
    stringifyValue(value).toLowerCase().includes(query.toLowerCase())
  );
}

function metricValue(metric: DynamicAppMetric, records: DynamicRecord[], total?: number) {
  if (metric.type === 'count') {
    return total ?? records.length;
  }

  if (!metric.fieldKey) {
    return '-';
  }

  const filledCount = records.filter((record) => stringifyValue(record.fields[metric.fieldKey!])).length;
  if (records.length === 0) {
    return '0%';
  }

  return `${Math.round((filledCount / records.length) * 100)}%`;
}

export default function DynamicAppViewer() {
  const { appId } = useParams();
  const appIdValue = Array.isArray(appId) ? appId[0] : appId;
  const { dynamicApps } = useStore();
  const router = useRouter();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [totalRecords, setTotalRecords] = useState<number | undefined>();
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const app = dynamicApps.find((item) => item.id === appIdValue);
  const definition = isDynamicDefinition(app?.schemaPreview) ? app.schemaPreview : undefined;
  const views = definition?.views ?? [];
  const currentView = views.find((view) => view.id === activeViewId) ?? views[0];
  const currentTable = definition ? findViewTable(definition, currentView) : undefined;
  const visibleFields = currentTable ? getViewFields(currentTable, currentView) : [];

  const filteredRecords = useMemo(
    () => records.filter((record) => isRecordMatched(record, query.trim())),
    [records, query]
  );

  const loadRecords = async (mode: 'replace' | 'append' = 'replace') => {
    if (!appIdValue || !currentTable) {
      return;
    }

    setIsLoadingRecords(true);
    setRecordError('');
    if (mode === 'replace') {
      setRecords([]);
      setNextPageToken(undefined);
      setTotalRecords(undefined);
    }

    try {
      const params = new URLSearchParams({
        tableId: currentTable.id,
        pageSize: '100',
      });
      if (mode === 'append' && nextPageToken) {
        params.set('pageToken', nextPageToken);
      }

      const response = await fetch(`/api/ai-apps/${appIdValue}/records?${params.toString()}`, {
        cache: 'no-store',
      });
      const page = await parseJsonResponse<RecordPageResponse>(response);
      setRecords((current) => (mode === 'append' ? [...current, ...page.records] : page.records));
      setNextPageToken(page.hasMore ? page.pageToken : undefined);
      setTotalRecords(page.total);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : '读取飞书记录失败');
    } finally {
      setIsLoadingRecords(false);
    }
  };

  useEffect(() => {
    if (!mounted || !currentTable?.id) {
      return;
    }

    void loadRecords('replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, appIdValue, currentTable?.id]);

  if (!mounted) {
    return <div className="h-screen w-full bg-slate-50" />;
  }

  if (!app) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50">
        <p className="text-slate-500 mb-4">应用不存在或加载失败</p>
        <Button onClick={() => router.push('/admin/ai-apps')}>返回列表</Button>
      </div>
    );
  }

  if (!definition) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6">
        <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Database className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <h1 className="mb-2 text-lg font-semibold text-slate-800">应用定义格式过旧</h1>
          <p className="mb-5 text-sm text-slate-500">这个应用是旧版 AI mock schema，无法绑定飞书真实数据。请回到应用工厂重新生成。</p>
          <Button onClick={() => router.push('/admin/ai-apps')}>返回应用工厂</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-screen bg-slate-50 overflow-hidden">
      <div className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => router.push('/admin/ai-apps')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate" title={app.name}>{app.name}</h2>
            <p className="text-[10px] text-slate-400 truncate">系统内部飞书应用</p>
          </div>
        </div>
        <div className="px-3 py-4 border-b border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">数据源</p>
          <p className="mt-1 text-xs text-slate-600 line-clamp-2">{currentTable?.name}</p>
          <p className="mt-2 text-[10px] text-slate-400">{visibleFields.length} 个展示字段</p>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {views.map((view) => {
            const isActive = currentView?.id === view.id;
            return (
              <button
                key={view.id}
                onClick={() => setActiveViewId(view.id)}
                className={`flex items-center w-full px-3 py-2 text-xs font-medium rounded-lg transition-colors ${isActive ? 'bg-orange-50 text-orange-600' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {view.type === 'dashboard' ? <LayoutDashboard className="w-4 h-4 mr-2" /> : <TableIcon className="w-4 h-4 mr-2" />}
                {view.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">{currentView?.name}</h1>
            <p className="text-xs text-slate-400">实时读取飞书多维表格记录</p>
          </div>
          <Button variant="outline" onClick={() => loadRecords('replace')} disabled={isLoadingRecords}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {isLoadingRecords ? '同步中' : '刷新数据'}
          </Button>
        </header>

        <div className="flex-1 p-6 overflow-auto">
          {recordError && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
              {recordError}
            </div>
          )}

          {currentView?.type === 'dashboard' && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {currentView.metrics.map((metric) => (
                <div key={metric.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">{metric.title}</p>
                  <div className="text-3xl font-bold mt-2 text-slate-800">{metricValue(metric, records, totalRecords)}</div>
                  <p className="mt-2 text-[10px] text-slate-400">基于当前已读取记录计算</p>
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">记录列表</h2>
                <p className="text-xs text-slate-400">
                  已读取 {records.length} 条{typeof totalRecords === 'number' ? ` / 飞书返回 ${totalRecords} 条` : ''}
                </p>
              </div>
              <div className="relative w-72">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-300" />
                <Input
                  className="pl-8"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="在已读取记录中搜索"
                />
              </div>
            </div>

            <Table className="text-xs">
              <TableHeader className="bg-slate-50 sticky top-0 z-10 text-slate-500 font-semibold">
                <TableRow>
                  {visibleFields.map((field) => (
                    <TableHead key={field.fieldId}>{field.title}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.map((record) => (
                  <TableRow key={record.recordId} className="hover:bg-slate-50 transition-colors">
                    {visibleFields.map((field) => (
                      <TableCell key={field.fieldId} className="max-w-64 py-3 align-top">
                        {renderFieldValue(field, record.fields[field.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={Math.max(visibleFields.length, 1)} className="py-12 text-center text-slate-400">
                      {isLoadingRecords ? '正在读取飞书记录...' : '暂无记录'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {nextPageToken && (
              <div className="border-t border-slate-100 p-4 text-center">
                <Button variant="outline" onClick={() => loadRecords('append')} disabled={isLoadingRecords}>
                  加载更多飞书记录
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
