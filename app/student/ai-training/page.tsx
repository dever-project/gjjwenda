'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { createId } from '@/lib/ai-training/defaults';
import type { AiTrainingScenario, AiTrainingSession } from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { FileText, MessagesSquare, Play } from 'lucide-react';
import { toast } from 'sonner';

function getLatestScore(sessions: AiTrainingSession[], scenarioId: string, userId: string) {
  const latestSession = sessions
    .filter((session) => session.scenarioId === scenarioId && session.userId === userId && session.report)
    .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt))[0];

  return typeof latestSession?.report?.totalScore === 'number' ? `${latestSession.report.totalScore} 分` : '暂无';
}

function createAiTrainingSession(scenario: AiTrainingScenario, userId: string): AiTrainingSession {
  const now = Date.now();

  return {
    id: createId('aitsession'),
    scenarioId: scenario.id,
    userId,
    status: 'in_progress',
    messages: [
      {
        id: createId('aitmsg'),
        role: 'ai',
        content: scenario.openingMessage,
        createdAt: now,
      },
    ],
    startedAt: now,
  };
}

export default function StudentAiTrainingPage() {
  const {
    aiTrainingScenarios,
    aiTrainingSessions,
    currentUser,
    upsertAiTrainingSession,
  } = useStore();
  const router = useRouter();
  const [startingScenarioId, setStartingScenarioId] = useState<string | null>(null);

  const publishedScenarios = useMemo(
    () => aiTrainingScenarios
      .filter((scenario) => scenario.status === 'published')
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [aiTrainingScenarios]
  );

  if (!currentUser) {
    return null;
  }

  const handleStart = async (scenario: AiTrainingScenario) => {
    setStartingScenarioId(scenario.id);
    const session = createAiTrainingSession(scenario, currentUser.id);

    try {
      await upsertAiTrainingSession(session);
      router.push(`/student/ai-training/${session.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '训练会话创建失败，请稍后重试');
      setStartingScenarioId(null);
    }
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessagesSquare className="h-5 w-5 text-orange-500" />
            AI情景训练
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">
            选择已发布场景，与 AI 客户完成对练并生成反馈报告。
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {publishedScenarios.length === 0 ? (
            <div className="col-span-full rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
              暂无已发布的 AI 情景训练场景
            </div>
          ) : (
            publishedScenarios.map((scenario) => {
              const isStarting = startingScenarioId === scenario.id;

              return (
                <Card key={scenario.id} className="flex flex-col border-slate-200">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant="outline" className="text-slate-600">
                        {scenario.stage || '通用'}
                      </Badge>
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100" variant="secondary">
                        {scenario.difficulty}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg leading-tight">{scenario.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4 text-sm text-slate-600">
                    <p className="line-clamp-3">{scenario.description || '管理员暂未填写场景说明。'}</p>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="mb-1 text-xs font-semibold text-slate-500">员工任务</div>
                      <p className="line-clamp-3 text-slate-700">{scenario.traineeTask}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-1 flex items-center gap-1 text-slate-500">
                          <FileText className="h-3.5 w-3.5" />
                          资料
                        </div>
                        <div className="font-semibold text-slate-800">{scenario.documents.length} 份</div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-1 text-slate-500">最近得分</div>
                        <div className="font-semibold text-slate-800">
                          {getLatestScore(aiTrainingSessions, scenario.id, currentUser.id)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="w-full bg-orange-600 hover:bg-orange-700"
                      disabled={isStarting}
                      onClick={() => void handleStart(scenario)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      {isStarting ? '进入中...' : '开始训练'}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
