'use client';

import { useRouter } from 'next/navigation';
import { useStore, Question } from '@/store/useStore';
import { useState, use, useMemo, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { gradeAttempt } from '@/lib/training/exam';

function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function clampQuestionIndex(index: unknown, questionCount: number) {
  if (questionCount <= 0) {
    return 0;
  }

  const numericIndex = typeof index === 'number' && Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(Math.max(numericIndex, 0), questionCount - 1);
}

function isAnswerFilled(answer: string | string[] | undefined) {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  return typeof answer === 'string' && answer.trim().length > 0;
}

export default function ExamTakingPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { examAttempts, questions, publishedExams, updateAttempt, completeAttempt } = useStore();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const attempt = examAttempts.find(a => a.id === resolvedParams.attemptId);
  const exam = publishedExams.find(pe => pe.id === attempt?.publishedExamId);
  
  const examQuestions = useMemo(() => {
    if (!exam) {
      return undefined;
    }

    return exam.questionIds
      .map(id => questions.find(q => q.id === id))
      .filter((question): question is Question => Boolean(question));
  }, [exam, questions]);

  const currentQ = examQuestions?.[currentIndex];
  
  const options = useMemo(() => {
    if (!currentQ) return [];
    return [
      { key: 'A', value: currentQ.optionA },
      { key: 'B', value: currentQ.optionB },
      { key: 'C', value: currentQ.optionC },
      { key: 'D', value: currentQ.optionD },
    ].filter(o => o.value);
  }, [currentQ?.id, currentQ?.optionA, currentQ?.optionB, currentQ?.optionC, currentQ?.optionD]);

  const [now, setNow] = useState(Date.now());
  const hasSubmittedRef = useRef(false);
  const restoredAttemptIdRef = useRef<string | null>(null);
  const durationMs = exam?.durationMinutes ? exam.durationMinutes * 60_000 : 0;
  const deadlineAt = attempt && durationMs > 0 ? attempt.startedAt + durationMs : null;
  const remainingMs = deadlineAt ? Math.max(0, deadlineAt - now) : null;
  const isTimeLimited = remainingMs !== null;

  useEffect(() => {
    if (!attempt || !examQuestions || examQuestions.length === 0) {
      return;
    }

    if (restoredAttemptIdRef.current === attempt.id) {
      return;
    }

    restoredAttemptIdRef.current = attempt.id;
    setCurrentIndex(clampQuestionIndex(attempt.currentQuestionIndex, examQuestions.length));
  }, [attempt, examQuestions]);

  const getLatestAttempt = useCallback(() => {
    if (!attempt) {
      return undefined;
    }

    return useStore.getState().examAttempts.find((item) => item.id === attempt.id) ?? attempt;
  }, [attempt]);

  const saveCurrentQuestionIndex = useCallback(
    async (nextIndex: number) => {
      if (!examQuestions || examQuestions.length === 0) {
        return;
      }

      const nextQuestionIndex = clampQuestionIndex(nextIndex, examQuestions.length);
      const latestAttempt = getLatestAttempt();

      if (!latestAttempt || latestAttempt.currentQuestionIndex === nextQuestionIndex) {
        setCurrentIndex(nextQuestionIndex);
        return;
      }

      await updateAttempt({
        ...latestAttempt,
        currentQuestionIndex: nextQuestionIndex,
      });
      setCurrentIndex(nextQuestionIndex);
    },
    [examQuestions, getLatestAttempt, updateAttempt]
  );

  const submitAttempt = useCallback(
    async (options?: { skipUnansweredConfirm?: boolean; timeUp?: boolean }) => {
      if (!attempt || !exam || !examQuestions || examQuestions.length === 0 || hasSubmittedRef.current) {
        return;
      }

      const latestAttempt = getLatestAttempt();
      if (!latestAttempt) {
        return;
      }

      const answeredCount = examQuestions.filter((question) =>
        isAnswerFilled(latestAttempt.answers[question.id]?.userAnswer)
      ).length;
      if (!options?.skipUnansweredConfirm && answeredCount < examQuestions.length) {
        if (!window.confirm(`您还有 ${examQuestions.length - answeredCount} 道大题未答完，确定要交卷吗？`)) {
          return;
        }
      }

      hasSubmittedRef.current = true;
      const finalAttempt = gradeAttempt(
        {
          ...latestAttempt,
          currentQuestionIndex: currentIndex,
        },
        exam,
        questions
      );
      await completeAttempt(finalAttempt);
      toast.success(
        options?.timeUp
          ? '考试时间已到，系统已自动交卷'
          : finalAttempt.gradingStatus === 'pending'
            ? '交卷成功，部分题待人工处理'
            : '交卷成功！'
      );
      router.push(`/student/exam/${attempt.id}/result`);
    },
    [attempt, completeAttempt, currentIndex, exam, examQuestions, getLatestAttempt, questions, router]
  );

  useEffect(() => {
    if (!isTimeLimited) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isTimeLimited]);

  useEffect(() => {
    if (remainingMs === 0) {
      void submitAttempt({ skipUnansweredConfirm: true, timeUp: true });
    }
  }, [remainingMs, submitAttempt]);
  
  if (!attempt || !exam) {
    return <div className="p-8">考试未找到</div>;
  }

  if (!examQuestions || examQuestions.length === 0 || !currentQ) {
    return <div className="p-8">暂无题目数据</div>;
  }
  // attempt.answers[currentQ.id]?.userAnswer could be string | string[]
  const currentAnswer = attempt.answers[currentQ.id]?.userAnswer;
  const isCurrentQuestionAnswered = isAnswerFilled(currentAnswer);

  const handleAnswerChange = (val: string | string[]) => {
    const latestAttempt = getLatestAttempt() ?? attempt;
    const updatedAttempt = { ...latestAttempt, currentQuestionIndex: currentIndex };
    updatedAttempt.answers = {
      ...updatedAttempt.answers,
      [currentQ.id]: {
        questionId: currentQ.id,
        userAnswer: val,
        isCorrect: false,
        score: 0,
        gradingMode: ['简答', '情景', '论述', '话术改写'].includes(String(currentQ.type))
          ? 'manual'
          : 'auto',
        isRedlineWrong: false,
      }
    };
    void updateAttempt(updatedAttempt);
  };

  const handleCheckboxChange = (optionStr: string, checked: boolean) => {
    let arr = Array.isArray(currentAnswer) ? [...currentAnswer] : [];
    if (checked) {
      if (!arr.includes(optionStr)) arr.push(optionStr);
    } else {
      arr = arr.filter(v => v !== optionStr);
    }
    handleAnswerChange(arr.sort());
  };

  const handleSubmit = () => {
    void submitAttempt();
  };

  const moveToQuestion = (nextIndex: number) => {
    void saveCurrentQuestionIndex(nextIndex).catch(() => {
      toast.error('保存当前题号失败，请稍后重试');
    });
  };

  const handlePreviousQuestion = () => {
    moveToQuestion(currentIndex - 1);
  };

  const handleNextQuestion = () => {
    if (!isCurrentQuestionAnswered) {
      toast.error('请先完成当前题，再进入下一题');
      return;
    }

    moveToQuestion(currentIndex + 1);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 py-4 px-6 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <h1 className="font-bold text-slate-800">{exam.name}</h1>
        <div className="flex items-center space-x-4">
           <div className="text-sm font-medium text-slate-500">
             进度：<span className="text-orange-500 font-bold">{currentIndex + 1}</span> / {examQuestions.length}
           </div>
           <div className={`text-sm font-semibold ${remainingMs !== null && remainingMs <= 300_000 ? 'text-red-600' : 'text-slate-500'}`}>
             {isTimeLimited ? `剩余：${formatRemainingTime(remainingMs ?? 0)}` : '不限时'}
           </div>
           <Button variant="default" onClick={handleSubmit} className="bg-orange-500 hover:bg-orange-600">
             交卷
           </Button>
        </div>
      </header>
      
      <main className="flex-1 flex justify-center py-8 px-4 overflow-y-auto">
        <div className="w-full max-w-3xl flex flex-col h-full">
          <Card className="flex-1 flex flex-col border-slate-200 shadow-sm overflow-hidden mb-6">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-sm text-slate-500 mb-2">
                 <span className="bg-slate-200 px-2 py-0.5 rounded text-xs text-slate-700 font-medium">{currentQ.type}</span>
              </div>
              <CardTitle className="text-lg leading-relaxed font-semibold text-slate-800">
                {currentQ.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex-1 overflow-y-auto">
              
              {currentQ.type === '多选' && (
                <div className="space-y-4">
                  {options.map((opt) => (
                    <div key={opt.key} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                      <Checkbox 
                        id={`opt-${opt.key}`} 
                        checked={Array.isArray(currentAnswer) && currentAnswer.includes(opt.key)}
                        onCheckedChange={(c) => handleCheckboxChange(opt.key, c as boolean)}
                      />
                      <Label htmlFor={`opt-${opt.key}`} className="font-normal text-slate-700 text-base leading-snug cursor-pointer whitespace-pre-wrap">
                        {opt.key}. {opt.value}
                      </Label>
                    </div>
                  ))}
                </div>
              )}

              {['单选', '判断', '情景'].includes(currentQ.type as string) && (
                <RadioGroup 
                  value={currentAnswer as string || ''} 
                  onValueChange={handleAnswerChange}
                  className="space-y-3"
                >
                  {options.map((opt) => (
                    <div key={opt.key} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value={opt.key} id={`opt-${opt.key}`} />
                      <Label htmlFor={`opt-${opt.key}`} className="font-normal text-slate-700 text-base leading-snug cursor-pointer whitespace-pre-wrap">
                        {opt.key}. {opt.value}
                      </Label>
                    </div>
                  ))}
                  {currentQ.type === '判断' && options.length === 0 && (
                     <>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                        <RadioGroupItem value="A" id="opt-A" />
                        <Label htmlFor="opt-A" className="font-normal text-slate-700 text-base cursor-pointer">A. 正确</Label>
                      </div>
                      <div className="flex items-center space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                        <RadioGroupItem value="B" id="opt-B" />
                        <Label htmlFor="opt-B" className="font-normal text-slate-700 text-base cursor-pointer">B. 错误</Label>
                      </div>
                     </>
                  )}
                </RadioGroup>
              )}

              {currentQ.type === '话术改写' && options.length > 0 && (
                <RadioGroup 
                  value={currentAnswer as string || ''} 
                  onValueChange={handleAnswerChange}
                  className="space-y-3"
                >
                  {options.map((opt) => (
                    <div key={opt.key} className="flex items-start space-x-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                      <RadioGroupItem value={opt.key} id={`opt-${opt.key}`} />
                      <Label htmlFor={`opt-${opt.key}`} className="font-normal text-slate-700 text-base leading-snug cursor-pointer whitespace-pre-wrap">
                        {opt.key}. {opt.value}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}

              {currentQ.type === '填空' && (
                <div className="pt-2">
                  <Input 
                    placeholder="请输入答案..." 
                    value={currentAnswer as string || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="max-w-md h-12"
                  />
                </div>
              )}

              {['简答', '情景', '论述', '话术改写'].includes(currentQ.type as string) && options.length === 0 && (
                <div className="pt-2">
                  <Textarea 
                    placeholder="请在此输入作答内容..." 
                    value={currentAnswer as string || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    className="min-h-[150px]"
                  />
                </div>
              )}

            </CardContent>
            <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 flex justify-between">
               <Button 
                 variant="outline" 
                 disabled={currentIndex === 0} 
                 onClick={handlePreviousQuestion}
               >
                 <ChevronLeft className="w-4 h-4 mr-1" /> 上一题
               </Button>
               <Button 
                 variant={currentIndex === examQuestions.length - 1 ? "default" : "outline"}
                 className={currentIndex === examQuestions.length - 1 ? "bg-slate-800 hover:bg-slate-700 text-white" : ""}
                 onClick={() => {
                   if (currentIndex < examQuestions.length - 1) {
                     handleNextQuestion();
                   } else {
                     handleSubmit();
                   }
                 }}
               >
                 {currentIndex === examQuestions.length - 1 ? (
                   <><Check className="w-4 h-4 mr-1" /> 检查交卷</>
                 ) : (
                   <>下一题 <ChevronRight className="w-4 h-4 ml-1" /></>
                 )}
               </Button>
            </CardFooter>
          </Card>
        </div>
      </main>
    </div>
  );
}
