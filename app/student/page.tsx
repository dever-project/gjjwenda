'use client';

import { useStore, PublishedExam, ExamAttempt } from '@/store/useStore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, CheckCircle, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function StudentExamsPage() {
  const {
    publishedExams,
    examAttempts,
    currentUser,
    knowledgeCategories,
    startAttempt,
  } = useStore();
  const router = useRouter();
  const [navigatingExamId, setNavigatingExamId] = useState<string | null>(null);
  const activeExams = useMemo(
    () => publishedExams.filter((exam) => exam.status === 'active'),
    [publishedExams]
  );

  const findInProgressAttempt = useCallback((exam: PublishedExam) =>
    currentUser
      ? examAttempts.find(
          (a) => a.publishedExamId === exam.id && a.userId === currentUser.id && a.status === 'in_progress'
        )
      : undefined,
    [currentUser, examAttempts]
  );

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    activeExams.forEach((exam) => {
      const existingAttempt = findInProgressAttempt(exam);
      if (existingAttempt) {
        router.prefetch(`/student/exam/${existingAttempt.id}`);
      }
    });
  }, [activeExams, currentUser, findInProgressAttempt, router]);

  if (!currentUser) return null;

  const getCategoryName = (categoryId: string) =>
    knowledgeCategories.find((category) => category.id === categoryId)?.name ?? categoryId;

  const persistAttemptInBackground = (attempt: ExamAttempt) => {
    void startAttempt(attempt).catch((error) => {
      console.error('保存考试记录失败', error);
      toast.error('已进入考试，但进度保存失败，请稍后重试');
    });
  };

  const handleStart = (exam: PublishedExam) => {
    const existingAttempt = findInProgressAttempt(exam);

    if (existingAttempt) {
      setNavigatingExamId(exam.id);
      router.push(`/student/exam/${existingAttempt.id}`);
      return;
    }

    setNavigatingExamId(exam.id);
    const newAttempt: ExamAttempt = {
      id: `att_${new Date().getTime()}`,
      userId: currentUser.id,
      publishedExamId: exam.id,
      status: 'in_progress',
      answers: {},
      currentQuestionIndex: 0,
      score: 0,
      passed: false,
      needRetake: false,
      redlineWrongCount: 0,
      gradingStatus: 'not_required',
      objectiveScore: 0,
      subjectiveScore: 0,
      startedAt: new Date().getTime()
    };

    persistAttemptInBackground(newAttempt);
    router.push(`/student/exam/${newAttempt.id}`);
  };

  const getExamStatus = (examId: string) => {
    const attempts = examAttempts.filter(a => a.publishedExamId === examId && a.userId === currentUser.id);
    if (attempts.length === 0) return { label: '未开始', status: 'not_started', color: 'bg-slate-200 text-slate-700' };
    
    // Sort latest first
    const sorted = [...attempts].sort((a,b) => b.startedAt - a.startedAt);
    const latest = sorted[0];

    if (latest.status === 'in_progress') return { label: '进行中', status: 'in_progress', color: 'bg-blue-100 text-blue-700' };
    if (latest.needRetake) return { label: '需重考', status: 'retake', color: 'bg-red-100 text-red-700' };
    if (latest.passed) return { label: '已通过', status: 'passed', color: 'bg-green-100 text-green-700' };
    return { label: '未通过', status: 'failed', color: 'bg-orange-100 text-orange-700' };
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold">考试认证</h2>
          <p className="text-xs text-slate-500">
            {currentUser?.role === 'admin'
              ? '管理员也可以使用同一套考试功能，考试记录按当前账号独立保存。'
              : '培训路径：飞书知识库学习 → 本系统考试认证 → AI情景训练（规划中）'}
          </p>
        </div>
      </header>

      <div className="flex-1 p-8 overflow-y-auto max-w-5xl mx-auto w-full">
        <div className="mb-8">
          <p className="text-slate-500 mt-1">您好，{currentUser.name}！请按要求完成以下培训测验。</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeExams.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-lg border border-dashed border-slate-300">
            暂无需要完成的考试任务
          </div>
        ) : (
          activeExams.map((exam) => {
            const statusInfo = getExamStatus(exam.id);
            const isCompleted = statusInfo.status === 'passed' && !examAttempts.some(a => a.publishedExamId === exam.id && a.needRetake);
            const isNavigating = navigatingExamId === exam.id;

            return (
              <Card key={exam.id} className={`flex flex-col ${isCompleted ? 'border-green-200 bg-green-50/30' : ''}`}>
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className="text-slate-500">{exam.stage || '通用'}</Badge>
                    <Badge className={`${statusInfo.color} border-transparent`} variant="secondary">{statusInfo.label}</Badge>
                  </div>
                  <CardTitle className="text-lg leading-tight">{exam.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 text-sm text-slate-600 space-y-1">
                  <p>共 {exam.questionIds.length} 题</p>
                  <p>考核标准: {exam.passScore} 分通过</p>
                  <p>考试时长: {exam.durationMinutes ? `${exam.durationMinutes} 分钟` : '不限时'}</p>
                  {exam.categoryIds && exam.categoryIds.length > 0 && (
                    <p className="line-clamp-2">考试范围：{exam.categoryIds.map(getCategoryName).join('、')}</p>
                  )}
                  <p className="text-xs text-slate-400">请先在飞书知识库完成对应内容学习。</p>
                </CardContent>
                <CardFooter>
                  {statusInfo.status === 'passed' ? (
                    <Button variant="outline" className="w-full text-green-600 border-green-200 bg-green-50" onClick={() => router.push(`/student/records`)}>
                      <CheckCircle className="mr-2 h-4 w-4" /> 查看成绩
                    </Button>
                  ) : statusInfo.status === 'retake' || statusInfo.status === 'failed' ? (
                    <Button variant="destructive" className="w-full" onClick={() => handleStart(exam)} disabled={isNavigating}>
                      <RotateCcw className="mr-2 h-4 w-4" /> {isNavigating ? '进入中...' : '重新开始'}
                    </Button>
                  ) : statusInfo.status === 'in_progress' ? (
                     <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => handleStart(exam)} disabled={isNavigating}>
                      <Play className="mr-2 h-4 w-4" /> {isNavigating ? '进入中...' : '继续考试'}
                    </Button>
                  ) : (
                    <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => handleStart(exam)} disabled={isNavigating}>
                      <Play className="mr-2 h-4 w-4" /> {isNavigating ? '进入中...' : '开始考试'}
                    </Button>
                  )}
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
