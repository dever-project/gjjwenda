'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AiTrainingSessionStatus } from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { ExternalLink, Search } from 'lucide-react';

const statusMeta: Record<AiTrainingSessionStatus, { label: string; className: string }> = {
  in_progress: {
    label: '训练中',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  completed: {
    label: '已完成',
    className: 'border-green-200 bg-green-50 text-green-700',
  },
};

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return '-';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export default function AiTrainingRecordsPage() {
  const { aiTrainingSessions, aiTrainingScenarios, users } = useStore();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const records = useMemo(() => {
    return [...aiTrainingSessions]
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === 'completed' ? -1 : 1;
        }

        return (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt);
      })
      .map((session) => ({
        session,
        scenario: aiTrainingScenarios.find((item) => item.id === session.scenarioId),
        employee: users.find((item) => item.id === session.userId),
      }));
  }, [aiTrainingScenarios, aiTrainingSessions, users]);

  const filteredRecords = useMemo(() => {
    if (!normalizedSearchTerm) {
      return records;
    }

    return records.filter(({ employee, scenario }) => {
      const searchText = [
        employee?.name,
        employee?.username,
        scenario?.name,
      ].filter(Boolean).join(' ').toLowerCase();

      return searchText.includes(normalizedSearchTerm);
    });
  }, [normalizedSearchTerm, records]);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">训练记录</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            查看员工 AI 情景训练完成情况、评分和红线命中。
          </p>
        </div>
        <div className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
          共 {filteredRecords.length} 条
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col p-6">
        <div className="mb-4 flex items-center rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="relative w-80 max-w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="搜索员工、账号或场景"
              className="pl-9"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="app-scrollbar flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-slate-50 font-semibold text-slate-500">
              <TableRow>
                <TableHead className="min-w-44">员工</TableHead>
                <TableHead className="min-w-64">场景</TableHead>
                <TableHead className="w-24 text-center">状态</TableHead>
                <TableHead className="w-24 text-center">总分</TableHead>
                <TableHead className="w-24 text-center">红线</TableHead>
                <TableHead className="w-40">开始时间</TableHead>
                <TableHead className="w-40">完成时间</TableHead>
                <TableHead className="w-28 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="text-sm font-medium text-slate-700">暂无训练记录</div>
                    <div className="mt-1 text-xs text-slate-500">员工开始训练后，记录会显示在这里。</div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map(({ session, scenario, employee }) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{employee?.name ?? session.userId}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{employee?.username ?? '-'}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-medium text-slate-800" title={scenario?.name ?? session.scenarioId}>
                        {scenario?.name ?? session.scenarioId}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500" title={scenario?.stage || '通用'}>
                        {scenario?.stage || '通用'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={statusMeta[session.status].className}>
                        {statusMeta[session.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {typeof session.report?.totalScore === 'number' ? (
                        <span className="font-bold text-orange-600">{session.report.totalScore}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {session.report?.redlineHits.length ? (
                        <Badge variant="destructive">{session.report.redlineHits.length}</Badge>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-500">{formatDate(session.startedAt)}</TableCell>
                    <TableCell className="text-slate-500">{formatDate(session.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/student/ai-training/${session.id}/report`)}
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        报告
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
