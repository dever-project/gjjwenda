'use client';

import { use, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createId } from '@/lib/ai-training/defaults';
import type { AiTrainingMessage, AiTrainingReport, AiTrainingSession } from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { ArrowLeft, Bot, Send, SquareCheckBig, UserRound } from 'lucide-react';
import { toast } from 'sonner';

type ChatPayload = {
  message?: AiTrainingMessage;
  error?: string;
};

type ReportPayload = {
  report?: AiTrainingReport;
  error?: string;
};

function parseErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isValidAiMessage(message: ChatPayload['message']): message is AiTrainingMessage {
  return Boolean(
    message &&
    typeof message.id === 'string' &&
    message.role === 'ai' &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'number'
  );
}

export default function AiTrainingSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const {
    aiTrainingScenarios,
    aiTrainingSessions,
    currentUser,
    upsertAiTrainingSession,
  } = useStore();
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRetryingAiReply, setIsRetryingAiReply] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [failedAiReplySessionId, setFailedAiReplySessionId] = useState<string | null>(null);

  const session = aiTrainingSessions.find((item) => item.id === resolvedParams.sessionId);
  const scenario = aiTrainingScenarios.find((item) => item.id === session?.scenarioId);
  const isOwner = Boolean(currentUser && session?.userId === currentUser.id);
  const canAccess = Boolean(currentUser?.role === 'admin' || isOwner);
  const canInteract = Boolean(isOwner && session?.status === 'in_progress');
  const trimmedInput = input.trim();

  const sortedMessages = useMemo(
    () => [...(session?.messages ?? [])].sort((a, b) => a.createdAt - b.createdAt),
    [session?.messages]
  );

  const getLatestSession = () =>
    useStore.getState().aiTrainingSessions.find((item) => item.id === resolvedParams.sessionId) ?? session;

  const persistSession = async (nextSession: AiTrainingSession) => {
    await upsertAiTrainingSession(nextSession);
  };

  const requestAiReply = async (sessionId: string, messages: AiTrainingMessage[]) => {
    if (!scenario) {
      throw new Error('未找到训练场景');
    }

    const response = await fetch('/api/ai-training/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioId: scenario.id,
        sessionId,
        messages,
      }),
    });
    const payload = await response.json().catch(() => ({})) as ChatPayload;
    if (!response.ok) {
      throw new Error(payload.error || 'AI 回复失败');
    }
    if (!isValidAiMessage(payload.message)) {
      throw new Error('AI 回复格式无效');
    }

    return payload.message;
  };

  const canRetryAiReply = Boolean(canInteract && failedAiReplySessionId === session?.id);

  const handleSend = async () => {
    const latestSession = getLatestSession();
    if (!latestSession || !scenario || !canInteract || !trimmedInput) {
      return;
    }
    const latestIsOwner = Boolean(currentUser && latestSession.userId === currentUser.id);
    if (!latestIsOwner || latestSession.status !== 'in_progress') {
      return;
    }

    const traineeMessage: AiTrainingMessage = {
      id: createId('aitmsg'),
      role: 'trainee',
      content: trimmedInput,
      createdAt: Date.now(),
    };
    const optimisticSession: AiTrainingSession = {
      ...latestSession,
      messages: [...latestSession.messages, traineeMessage],
    };

    setIsSending(true);
    setFailedAiReplySessionId(null);
    setInput('');
    let hasPersistedTraineeMessage = false;
    try {
      await persistSession(optimisticSession);
      hasPersistedTraineeMessage = true;
      const aiMessage = await requestAiReply(latestSession.id, optimisticSession.messages);
      await persistSession({
        ...optimisticSession,
        messages: [...optimisticSession.messages, aiMessage],
      });
      setFailedAiReplySessionId(null);
    } catch (error) {
      if (hasPersistedTraineeMessage) {
        setFailedAiReplySessionId(latestSession.id);
      }
      toast.error(parseErrorMessage(error, 'AI 回复失败'));
    } finally {
      setIsSending(false);
    }
  };

  const handleRetryAiReply = async () => {
    const latestSession = getLatestSession();
    if (!latestSession || !scenario || !canRetryAiReply) {
      return;
    }
    const latestIsOwner = Boolean(currentUser && latestSession.userId === currentUser.id);
    const lastMessage = latestSession.messages.at(-1);
    if (!latestIsOwner || latestSession.status !== 'in_progress' || lastMessage?.role !== 'trainee') {
      setFailedAiReplySessionId(null);
      return;
    }

    setIsRetryingAiReply(true);
    try {
      const aiMessage = await requestAiReply(latestSession.id, latestSession.messages);
      await persistSession({
        ...latestSession,
        messages: [...latestSession.messages, aiMessage],
      });
      setFailedAiReplySessionId(null);
    } catch (error) {
      toast.error(parseErrorMessage(error, 'AI 回复失败'));
    } finally {
      setIsRetryingAiReply(false);
    }
  };

  const handleEndTraining = async () => {
    const latestSession = getLatestSession();
    if (!latestSession || !scenario || !canInteract) {
      return;
    }
    const latestIsOwner = Boolean(currentUser && latestSession.userId === currentUser.id);
    if (!latestIsOwner || latestSession.status !== 'in_progress') {
      return;
    }

    setIsEnding(true);
    try {
      const response = await fetch('/api/ai-training/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: scenario.id,
          sessionId: latestSession.id,
          messages: latestSession.messages,
        }),
      });
      const payload = await response.json().catch(() => ({})) as ReportPayload;
      if (!response.ok) {
        throw new Error(payload.error || '训练报告生成失败');
      }
      if (!payload.report) {
        throw new Error('训练报告格式无效');
      }

      await persistSession({
        ...latestSession,
        status: 'completed',
        report: payload.report,
        completedAt: Date.now(),
      });
      router.push(`/student/ai-training/${latestSession.id}/report`);
    } catch (error) {
      toast.error(parseErrorMessage(error, '训练报告生成失败'));
    } finally {
      setIsEnding(false);
    }
  };

  if (!currentUser) {
    return null;
  }

  if (!session || !scenario) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          未找到训练会话
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="font-semibold text-slate-800">无权访问该训练会话</div>
          <Button variant="outline" onClick={() => router.push('/student/ai-training')}>
            返回训练列表
          </Button>
        </div>
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
              <span>{scenario.difficulty}</span>
              <span>{session.status === 'completed' ? '已完成' : '训练中'}</span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          disabled={!canInteract || isSending || isEnding}
          onClick={() => void handleEndTraining()}
        >
          <SquareCheckBig className="mr-2 h-4 w-4" />
          {isEnding ? '生成报告中...' : '结束训练'}
        </Button>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="mx-auto grid max-w-5xl gap-4 text-sm text-slate-600 md:grid-cols-[1fr_1fr]">
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">场景说明</div>
              <p className="line-clamp-2">{scenario.description || '暂无说明'}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">员工任务</div>
              <p className="line-clamp-2">{scenario.traineeTask}</p>
            </div>
          </div>
        </div>

        <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {sortedMessages.map((message) => {
              const isAi = message.role === 'ai';

              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}
                >
                  {isAi && (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                      isAi
                        ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
                        : 'rounded-tr-sm bg-orange-600 text-white'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  {!isAi && (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-white">
                      <UserRound className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="mx-auto flex max-w-4xl gap-3">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={canInteract ? '输入你的回复...' : '训练已结束，不能继续发送消息'}
              disabled={!canInteract || isSending || isEnding}
              className="min-h-20 resize-none"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />
            <div className="flex w-32 flex-shrink-0 flex-col gap-2">
              <Button
                className="h-full min-h-11 bg-orange-600 hover:bg-orange-700"
                disabled={!canInteract || !trimmedInput || isSending || isRetryingAiReply || isEnding}
                onClick={() => void handleSend()}
              >
                <Send className="mr-2 h-4 w-4" />
                {isSending ? '发送中' : '发送'}
              </Button>
              {canRetryAiReply && (
                <Button
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={isSending || isRetryingAiReply || isEnding}
                  onClick={() => void handleRetryAiReply()}
                >
                  {isRetryingAiReply ? '重试中...' : '重试 AI 回复'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
