'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiTrainingRedlineSeverity } from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { ArrowLeft, MessageSquareText, RotateCcw } from 'lucide-react';

const severityClass: Record<AiTrainingRedlineSeverity, string> = {
  low: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  medium: 'border-orange-200 bg-orange-50 text-orange-700',
  high: 'border-red-200 bg-red-50 text-red-700',
};

const severityLabel: Record<AiTrainingRedlineSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
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

function EmptyList({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

export default function AiTrainingReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { aiTrainingScenarios, aiTrainingSessions, currentUser } = useStore();

  const session = aiTrainingSessions.find((item) => item.id === resolvedParams.sessionId);
  const scenario = aiTrainingScenarios.find((item) => item.id === session?.scenarioId);
  const isOwner = Boolean(currentUser && session?.userId === currentUser.id);
  const canAccess = Boolean(currentUser?.role === 'admin' || isOwner);
  const report = session?.report;
  const dimensionScores = report?.dimensionScores ?? [];

  if (!currentUser) {
    return null;
  }

  if (!session || !scenario) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          未找到训练报告
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="font-semibold text-slate-800">无权访问该训练报告</div>
          <Button variant="outline" onClick={() => router.push('/student/ai-training')}>
            返回训练列表
          </Button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50">
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/student/ai-training')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900">{scenario.name}</h2>
              <p className="mt-1 text-xs text-slate-500">训练报告</p>
            </div>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-600">
              <MessageSquareText className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">报告尚未生成</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                结束训练后，系统会根据对话内容生成评分、红线和话术建议。
              </p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => router.push('/student/ai-training')}>
                返回训练列表
              </Button>
              <Button onClick={() => router.push(`/student/ai-training/${session.id}`)}>
                返回训练
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/student/ai-training')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{scenario.name}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="h-5 px-2 text-[11px]">
                {scenario.stage || '通用'}
              </Badge>
              <span>完成时间：{formatDate(session.completedAt)}</span>
              <span>生成时间：{formatDate(report.generatedAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/student/ai-training')}>
            返回训练列表
          </Button>
          <Button onClick={() => router.push(`/student/ai-training/${session.id}`)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            返回训练
          </Button>
        </div>
      </header>

      <main className="app-scrollbar flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-sm font-medium text-slate-500">总分</div>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-5xl font-bold text-orange-600">{report.totalScore}</span>
                <span className="pb-2 text-sm font-medium text-slate-500">/ 100</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{report.summary}</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">红线命中</h3>
              <div className="mt-3 text-3xl font-bold text-red-600">{report.redlineHits.length}</div>
              <p className="mt-1 text-xs text-slate-500">命中数量越少，合规表达越稳定。</p>
            </section>
          </aside>

          <div className="space-y-6">
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">维度评分</h3>
              <div className="mt-4 space-y-4">
                {dimensionScores.length === 0 ? (
                  <EmptyList text="暂无维度评分" />
                ) : (
                  dimensionScores.map((dimension) => (
                    <div key={dimension.rubricItemId} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="font-semibold text-slate-900">{dimension.name}</h4>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{dimension.reason}</p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xl font-bold text-orange-600">{dimension.score}</div>
                          <div className="text-xs text-slate-500">/ {dimension.maxScore}</div>
                        </div>
                      </div>
                      <div className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        依据：{dimension.evidence || '暂无证据摘录'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">表现亮点</h3>
                {report.strengths.length === 0 ? (
                  <div className="mt-4">
                    <EmptyList text="暂无亮点总结" />
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                    {report.strengths.map((strength) => (
                      <li key={strength} className="rounded-lg bg-green-50 px-3 py-2 text-green-800">
                        {strength}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">待改进问题</h3>
                {report.issues.length === 0 ? (
                  <div className="mt-4">
                    <EmptyList text="暂无问题总结" />
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                    {report.issues.map((issue) => (
                      <li key={issue} className="rounded-lg bg-orange-50 px-3 py-2 text-orange-800">
                        {issue}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">红线明细</h3>
              <div className="mt-4 space-y-3">
                {report.redlineHits.length === 0 ? (
                  <EmptyList text="本次训练未命中红线" />
                ) : (
                  report.redlineHits.map((hit, index) => (
                    <div key={`${hit.ruleId ?? hit.title}-${index}`} className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={severityClass[hit.severity]}>
                          {severityLabel[hit.severity]}风险
                        </Badge>
                        <h4 className="font-semibold text-slate-900">{hit.title}</h4>
                      </div>
                      <blockquote className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        “{hit.quote || '无原话摘录'}”
                      </blockquote>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{hit.reason}</p>
                      <p className="mt-2 text-sm leading-6 text-orange-700">建议：{hit.suggestion}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900">建议话术</h3>
              {report.suggestedPhrases.length === 0 ? (
                <div className="mt-4">
                  <EmptyList text="暂无建议话术" />
                </div>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {report.suggestedPhrases.map((phrase) => (
                    <div key={phrase} className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
                      {phrase}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
