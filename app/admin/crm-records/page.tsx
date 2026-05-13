'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, RefreshCw, RotateCcw, Search, UploadCloud, X } from 'lucide-react';
import { toast } from 'sonner';

interface CrmRecord {
  id: string;
  externalId?: string;
  externalIdSource?: string;
  customerName?: string;
  mobile?: string;
  tel?: string;
  city?: string;
  province?: string;
  district?: string;
  subjectName?: string;
  promotionName?: string;
  searchHost?: string;
  searchEngine?: string;
  chatUrl?: string;
  firstUrl?: string;
  referUrl?: string;
  note?: string;
  feishuRecordId?: string;
  feishuSyncedAt?: number;
  feishuSyncError?: string;
  payload: Record<string, unknown>;
  receivedAt: number;
  updatedAt: number;
}

interface CrmRecordResponse {
  records: CrmRecord[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

interface CrmFeishuSyncResponse {
  success: boolean;
  totalPendingBefore: number;
  totalPendingAfter: number;
  processed: number;
  created: number;
  updated: number;
  failed: number;
  skippedFieldNames: string[];
  errors: Array<{
    id: string;
    customerName?: string;
    message: string;
  }>;
  error?: string;
}

interface CrmFeishuResetResponse {
  success: boolean;
  resetCount: number;
  error?: string;
}

const CRM_FEISHU_SYNC_TIMEOUT_MS = 90_000;

function formatTime(value: number) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString();
}

function compactText(value: string | undefined) {
  return value?.trim() || '-';
}

function locationText(record: CrmRecord) {
  const parts = [record.province, record.city, record.district]
    .map((item) => item?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '-';
}

function feishuSyncStatus(record: CrmRecord) {
  if (record.feishuSyncError) {
    return {
      label: '失败',
      className: 'border-red-200 bg-red-50 text-red-700',
      description: record.feishuSyncError,
    };
  }

  if (!record.feishuSyncedAt) {
    return {
      label: '待同步',
      className: 'border-slate-200 bg-slate-50 text-slate-600',
      description: '尚未同步到飞书',
    };
  }

  if (record.updatedAt > record.feishuSyncedAt) {
    return {
      label: '待更新',
      className: 'border-orange-200 bg-orange-50 text-orange-700',
      description: '本地记录已更新，等待重新同步',
    };
  }

  return {
    label: '已同步',
    className: 'border-green-200 bg-green-50 text-green-700',
    description: formatTime(record.feishuSyncedAt),
  };
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }

  return payload as T;
}

export default function AdminCrmRecordsPage() {
  const [records, setRecords] = useState<CrmRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingFeishu, setIsSyncingFeishu] = useState(false);
  const [isClearingFeishuSync, setIsClearingFeishuSync] = useState(false);
  const [feishuTableUrl, setFeishuTableUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<CrmRecord | null>(null);
  const pageSize = 50;

  useEffect(() => {
    setFeishuTableUrl(window.localStorage.getItem('crmFeishuTableUrl') ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query) {
        params.set('search', query);
      }

      setIsLoading(true);
      setErrorMessage('');
      fetch(`/api/crm/records?${params.toString()}`, { cache: 'no-store' })
        .then((response) => parseResponse<CrmRecordResponse>(response))
        .then((data) => {
          if (cancelled) {
            return;
          }
          setRecords(data.records);
          setTotal(data.total);
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          const message = error instanceof Error ? error.message : '读取 CRM 记录失败';
          setErrorMessage(message);
          toast.error(message);
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page, query, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasSearchValue = Boolean(searchTerm.trim() || query);
  const payloadText = useMemo(() => {
    if (!selectedRecord) {
      return '';
    }

    return JSON.stringify(selectedRecord.payload, null, 2);
  }, [selectedRecord]);

  const handleSearch = () => {
    setPage(1);
    setQuery(searchTerm.trim());
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setQuery('');
    setPage(1);
  };

  const handleRefresh = () => {
    setReloadKey((value) => value + 1);
  };

  const handleSyncToFeishu = async () => {
    const targetUrl = feishuTableUrl.trim();
    if (!targetUrl) {
      toast.error('请先填写飞书多维表格地址');
      return;
    }

    setIsSyncingFeishu(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, CRM_FEISHU_SYNC_TIMEOUT_MS);

    try {
      window.localStorage.setItem('crmFeishuTableUrl', targetUrl);
      const response = await fetch('/api/crm/sync-feishu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl }),
        signal: controller.signal,
      });
      const result = await parseResponse<CrmFeishuSyncResponse>(response);
      const summary = `处理 ${result.processed} 条，新增 ${result.created} 条，更新 ${result.updated} 条，失败 ${result.failed} 条`;

      if (result.failed > 0) {
        const firstError = result.errors[0]?.message;
        toast.error(firstError ? `${summary}；首个错误：${firstError}` : summary);
      } else {
        toast.success(`${summary}，剩余待同步 ${result.totalPendingAfter} 条`);
      }

      handleRefresh();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error(`同步到飞书超时：${CRM_FEISHU_SYNC_TIMEOUT_MS / 1000} 秒内未完成，请稍后重试`);
      } else {
        toast.error(error instanceof Error ? error.message : '同步到飞书失败');
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsSyncingFeishu(false);
    }
  };

  const handleClearFeishuSyncState = async () => {
    if (!window.confirm('确认清空所有 CRM 记录的飞书同步状态？清空后不会删除飞书数据，但会允许这些记录重新同步。')) {
      return;
    }

    setIsClearingFeishuSync(true);

    try {
      const response = await fetch('/api/crm/reset-feishu-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await parseResponse<CrmFeishuResetResponse>(response);

      toast.success(`已清空 ${result.resetCount} 条记录的飞书同步状态`);
      handleRefresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空飞书同步状态失败');
    } finally {
      setIsClearingFeishuSync(false);
    }
  };

  const isFeishuActionRunning = isSyncingFeishu || isClearingFeishuSync;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">CRM记录</h2>
          <p className="mt-0.5 text-xs text-slate-500">来自 /api/crm/push 的推送入库数据</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        <div className="flex flex-col gap-3 rounded-lg border border-orange-100 bg-orange-50/70 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-orange-950">同步到飞书多维表格</div>
            <p className="mt-1 text-xs text-orange-800">
              目标表需要包含“CRM记录ID”字段；其他同名字段存在才会写入。
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-3xl">
            <Input
              value={feishuTableUrl}
              onChange={(event) => setFeishuTableUrl(event.target.value)}
              placeholder="粘贴飞书多维表格目标数据表地址，需包含 table=tbl..."
              disabled={isFeishuActionRunning}
              className="bg-white"
            />
            <Button
              variant="destructive"
              onClick={handleClearFeishuSyncState}
              disabled={isFeishuActionRunning}
            >
              <RotateCcw className={`mr-2 h-4 w-4 ${isClearingFeishuSync ? 'animate-spin' : ''}`} />
              {isClearingFeishuSync ? '清空中...' : '清空状态'}
            </Button>
            <Button
              onClick={handleSyncToFeishu}
              disabled={isFeishuActionRunning}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <UploadCloud className={`mr-2 h-4 w-4 ${isSyncingFeishu ? 'animate-pulse' : ''}`} />
              {isSyncingFeishu ? '同步中...' : '同步到飞书'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-2 sm:flex-row md:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSearch();
                  }
                }}
                placeholder="搜索CRM记录ID、姓名、手机号、城市、项目、渠道、chatId..."
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} className="bg-orange-600 hover:bg-orange-700">
              查询
            </Button>
            <Button variant="outline" onClick={handleClearSearch} disabled={!hasSearchValue}>
              <X className="mr-2 h-4 w-4" />
              清空
            </Button>
          </div>
          <div className="text-sm text-slate-500">
            共 {total} 条{query ? `，当前搜索：${query}` : ''}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead className="min-w-36">客户</TableHead>
                <TableHead className="min-w-32">手机号</TableHead>
                <TableHead className="min-w-36">地区</TableHead>
                <TableHead className="min-w-44">项目</TableHead>
                <TableHead className="min-w-36">渠道</TableHead>
                <TableHead className="min-w-44">外部ID</TableHead>
                <TableHead className="min-w-36">飞书同步</TableHead>
                <TableHead className="min-w-40">入库时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-slate-500">
                    正在读取 CRM 记录...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-slate-500">
                    暂无 CRM 记录
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const syncStatus = feishuSyncStatus(record);

                  return (
                    <TableRow key={record.id} className="hover:bg-slate-50">
                      <TableCell>
                        <div className="font-medium text-slate-800">{compactText(record.customerName)}</div>
                        <div className="mt-1 max-w-52 truncate text-xs text-slate-500">{compactText(record.note)}</div>
                      </TableCell>
                      <TableCell className="text-slate-700">{compactText(record.mobile || record.tel)}</TableCell>
                      <TableCell className="text-slate-600">{locationText(record)}</TableCell>
                      <TableCell className="text-slate-700">{compactText(record.subjectName)}</TableCell>
                      <TableCell>
                        <div className="text-slate-700">{compactText(record.promotionName || record.searchHost)}</div>
                        {record.searchEngine && (
                          <div className="mt-1 text-xs text-slate-400">{record.searchEngine}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.externalId ? (
                          <div className="max-w-52 truncate">
                            <Badge variant="outline" className="mb-1 bg-slate-50 text-slate-600">
                              {record.externalIdSource || 'externalId'}
                            </Badge>
                            <div className="truncate text-xs text-slate-500">{record.externalId}</div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={syncStatus.className}>
                          {syncStatus.label}
                        </Badge>
                        <div className="mt-1 max-w-40 truncate text-xs text-slate-400">
                          {syncStatus.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{formatTime(record.receivedAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedRecord(record)}>
                          <Eye className="mr-1 h-4 w-4" />
                          详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-shrink-0 items-center justify-between text-sm text-slate-500">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage((value) => value + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedRecord)} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-h-[86vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>CRM记录详情</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-slate-500">客户：</span>
                  <span className="font-medium">{compactText(selectedRecord.customerName)}</span>
                </div>
                <div>
                  <span className="text-slate-500">手机号：</span>
                  <span className="font-medium">{compactText(selectedRecord.mobile || selectedRecord.tel)}</span>
                </div>
                <div>
                  <span className="text-slate-500">项目：</span>
                  <span>{compactText(selectedRecord.subjectName)}</span>
                </div>
                <div>
                  <span className="text-slate-500">渠道：</span>
                  <span>{compactText(selectedRecord.promotionName || selectedRecord.searchHost)}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">CRM记录ID：</span>
                  <span>{selectedRecord.id}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-500">外部ID：</span>
                  <span>{compactText(selectedRecord.externalId)}</span>
                </div>
                <div>
                  <span className="text-slate-500">飞书记录ID：</span>
                  <span>{compactText(selectedRecord.feishuRecordId)}</span>
                </div>
                <div>
                  <span className="text-slate-500">飞书同步时间：</span>
                  <span>{formatTime(selectedRecord.feishuSyncedAt ?? 0)}</span>
                </div>
                {selectedRecord.feishuSyncError && (
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">同步错误：</span>
                    <span className="text-red-600">{selectedRecord.feishuSyncError}</span>
                  </div>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">原始推送字段</h3>
                <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                  {payloadText}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
