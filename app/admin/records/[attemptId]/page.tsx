'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { finalizeManualReview, getExamQuestions, isManualQuestion } from '@/lib/training/exam';

export default function AdminAttemptReviewPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { examAttempts, publishedExams, questions, users, currentUser, updateAttempt } = useStore();
  const attempt = examAttempts.find((item) => item.id === resolvedParams.attemptId);
  const exam = publishedExams.find((item) => item.id === attempt?.publishedExamId);
  const student = users.find((item) => item.id === attempt?.userId);
  const examQuestions = useMemo(
    () => (exam ? getExamQuestions(exam, questions) : []),
    [exam, questions]
  );
  const manualQuestions = useMemo(
    () => examQuestions.filter(isManualQuestion),
    [examQuestions]
  );

  const initialReview = useMemo(() => {
    const review: Record<string, { score: number; comment: string }> = {};
    manualQuestions.forEach((question) => {
      const answer = attempt?.answers[question.id];
      review[question.id] = {
        score: answer?.reviewerScore ?? answer?.score ?? 0,
        comment: answer?.reviewerComment ?? '',
      };
    });
    return review;
  }, [attempt?.id, manualQuestions]);

  const [review, setReview] = useState(initialReview);

  useEffect(() => {
    setReview(initialReview);
  }, [initialReview]);

  if (!attempt || !exam) {
    return <div className="p-8">找不到答卷</div>;
  }

  const handleReviewChange = (questionId: string, field: 'score' | 'comment', value: string) => {
    setReview((current) => ({
      ...current,
      [questionId]: {
        ...current[questionId],
        [field]: field === 'score' ? Number(value) : value,
      },
    }));
  };

  const handleSave = async () => {
    const finalAttempt = finalizeManualReview(
      attempt,
      exam,
      questions,
      currentUser?.id ?? 'admin',
      review
    );
    await updateAttempt(finalAttempt);
    toast.success('复核结果已保存');
    router.push('/admin/records');
  };

  return (
    <div className="p-8 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/records')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{exam.name}</h1>
            <p className="text-sm text-slate-500">
              员工：{student?.name ?? attempt.userId}｜当前得分：{attempt.score ?? 0}｜状态：
              {attempt.gradingStatus === 'pending' ? '待人工处理' : '系统已自动评分，可抽查复核'}
            </p>
          </div>
        </div>
        {manualQuestions.length > 0 && (
          <Button onClick={handleSave} className="bg-orange-600 hover:bg-orange-700">
            <Save className="w-4 h-4 mr-2" /> 保存复核
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {examQuestions.map((question, index) => {
          const answer = attempt.answers[question.id];
          const manual = isManualQuestion(question);
          return (
            <Card key={question.id} className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-500">#{index + 1}</span>
                    <Badge variant="outline">{question.type}</Badge>
                    {manual && (
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
                        {attempt.gradingStatus === 'pending' ? '待人工处理' : '主观题复核'}
                      </Badge>
                    )}
                    {question.isRedline && <Badge variant="destructive">红线题</Badge>}
                  </div>
                  <span className="text-sm text-slate-500">
                    满分 {Math.round(answer?.maxScore ?? 0)}
                  </span>
                </div>
                <CardTitle className="text-base leading-relaxed">{question.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="mb-1 text-slate-500">员工答案</div>
                  <div className="rounded-lg bg-slate-50 p-3 whitespace-pre-wrap">
                    {Array.isArray(answer?.userAnswer)
                      ? answer.userAnswer.join(', ')
                      : answer?.userAnswer || '(未答)'}
                  </div>
                </div>

                {manual ? (
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <div>
                      <label className="mb-1 block text-slate-500">得分</label>
                      <Input
                        type="number"
                        min={0}
                        max={answer?.maxScore ?? 0}
                        step="0.1"
                        value={review[question.id]?.score ?? 0}
                        onChange={(event) =>
                          handleReviewChange(question.id, 'score', event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-slate-500">评语</label>
                      <Textarea
                        value={review[question.id]?.comment ?? ''}
                        onChange={(event) =>
                          handleReviewChange(question.id, 'comment', event.target.value)
                        }
                        placeholder="填写扣分原因、建议复盘点或通过说明"
                      />
                    </div>
                    {(question.answerKey || question.rubric) && (
                      <div className="md:col-span-2 rounded-lg bg-blue-50 p-3 text-blue-800">
                        <div className="font-medium">参考要点/评分标准</div>
                        <div className="mt-1 whitespace-pre-wrap">{question.answerKey || question.rubric}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg bg-slate-50 p-3">
                    自动判分：{answer?.isCorrect ? '正确' : '错误'}，得分 {Math.round(answer?.score ?? 0)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
