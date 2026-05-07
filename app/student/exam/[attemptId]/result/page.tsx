'use client';

import { useRouter } from 'next/navigation';
import { useStore, Question } from '@/store/useStore';
import { use } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ExamResultPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { examAttempts, questions, publishedExams } = useStore();
  
  const attempt = examAttempts.find(a => a.id === resolvedParams.attemptId);
  const exam = publishedExams.find(pe => pe.id === attempt?.publishedExamId);
  
  if (!attempt || !exam) {
    return <div className="p-8">找不到考试结果记录</div>;
  }

  // Get ordered questions
  const examQuestions = exam.questionIds
    .map(id => questions.find(q => q.id === id))
    .filter(Boolean) as Question[];

  const correctCount = Object.values(attempt.answers).filter(a => a.isCorrect).length;
  const incorrectCount = examQuestions.length - correctCount;

  return (
    <div className="app-scrollbar h-full overflow-y-auto bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        
        <Card className="text-center shadow-sm border-slate-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-bold text-slate-800">{exam.name} - 成绩单</CardTitle>
            <CardDescription>交卷时间: {new Date(attempt.submittedAt || new Date().getTime()).toLocaleString()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`inline-flex items-center justify-center p-6 rounded-full mb-6 ${attempt.passed ? 'bg-green-50' : 'bg-orange-50'}`}>
              <div className="text-center">
                <span className={`text-5xl font-black ${attempt.passed ? 'text-green-600' : 'text-orange-600'}`}>
                  {attempt.score}
                </span>
                <span className="text-lg font-medium text-slate-500 ml-1">分</span>
              </div>
            </div>
            
            <div className="flex justify-center flex-wrap gap-4 mb-6">
              <Badge variant="outline" className="text-base py-1 px-3">
                标准: {exam.passScore} 分
              </Badge>
              <Badge variant="outline" className={`text-base py-1 px-3 ${attempt.passed ? 'text-green-600 border-green-200 bg-green-50' : 'text-orange-600 border-orange-200 bg-orange-50'}`}>
                {attempt.gradingStatus === 'pending' ? '待处理' : attempt.passed ? '通过' : '未通过'}
              </Badge>
              {attempt.needRetake && (
                 <Badge variant="destructive" className="text-base py-1 px-3">
                   需重考 (触发红线)
                 </Badge>
              )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto mb-8">
               <div className="bg-slate-100 p-3 rounded-lg">
                 <div className="text-sm text-slate-500 mb-1">总题数</div>
                 <div className="text-xl font-bold text-slate-800">{examQuestions.length}</div>
               </div>
               <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                 <div className="text-sm text-green-600 mb-1">答对</div>
                 <div className="text-xl font-bold text-green-700">{correctCount}</div>
               </div>
               <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                 <div className="text-sm text-orange-600 mb-1">答错</div>
                 <div className="text-xl font-bold text-orange-700">{incorrectCount}</div>
               </div>
               <div className={`p-3 rounded-lg border ${attempt.redlineWrongCount > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-100 border-transparent'}`}>
                 <div className={`text-sm mb-1 ${attempt.redlineWrongCount > 0 ? 'text-red-600' : 'text-slate-500'}`}>红线错题</div>
                 <div className={`text-xl font-bold ${attempt.redlineWrongCount > 0 ? 'text-red-700' : 'text-slate-800'}`}>{attempt.redlineWrongCount}</div>
               </div>
            </div>
            {attempt.gradingStatus === 'pending' && (
              <div className="max-w-2xl mx-auto mb-6 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                本次考试有题目缺少可自动评分的参考要点，已进入人工处理。当前分数包含已自动评分部分。
              </div>
            )}

            <div className="space-x-4">
               <Button onClick={() => router.push('/student')}>返回我的考试</Button>
            </div>
          </CardContent>
        </Card>

        {attempt.redlineWrongCount > 0 && (
          <div className="bg-red-50 border border-red-200 border-l-4 border-l-red-500 p-4 rounded-md flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-500 mr-3 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-medium">注意：包含红线题错误</h3>
              <p className="text-red-600 text-sm mt-1">
                红线题为高压线知识点，错误可能会影响您的综合认证或要求重新考核。请务必仔细复盘以下标红的错题。
              </p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-800 pt-4">题目解析与复盘</h2>
          
          {examQuestions.map((q, idx) => {
            const ansRec = attempt.answers[q.id];
            const isCorrect = ansRec?.isCorrect;
            const isRedlineWrong = ansRec?.isRedlineWrong;

            return (
              <Card key={q.id} className={`overflow-hidden border-l-4 ${isCorrect ? 'border-green-500' : (isRedlineWrong ? 'border-red-500' : 'border-orange-500')}`}>
                <CardHeader className="bg-slate-50/50 pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-500">#{idx + 1}</span>
                      <Badge variant="outline" className="bg-white">{q.type}</Badge>
                      {q.isRedline && <Badge variant="destructive">红线题</Badge>}
                    </div>
                    {isCorrect ? (
                      <span className="flex items-center text-green-600 text-sm font-medium"><CheckCircle className="w-4 h-4 mr-1"/> 正确</span>
                    ) : (
                      <span className="flex items-center text-orange-600 text-sm font-medium"><XCircle className="w-4 h-4 mr-1"/> 错误</span>
                    )}
                  </div>
                  <CardTitle className="text-base font-semibold mt-2 leading-relaxed">
                    {q.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 text-sm space-y-4">
                  {q.optionA && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-600">
                      <div>A. {q.optionA}</div>
                      {q.optionB && <div>B. {q.optionB}</div>}
                      {q.optionC && <div>C. {q.optionC}</div>}
                      {q.optionD && <div>D. {q.optionD}</div>}
                    </div>
                  )}

                  <div className="flex flex-col space-y-2 pt-2">
                    <div className="flex items-start">
                      <span className="w-20 shrink-0 text-slate-500">您的答案：</span>
                      <span className={`font-medium ${isCorrect ? 'text-green-600' : 'text-orange-600'}`}>
                        {Array.isArray(ansRec?.userAnswer) ? ansRec.userAnswer.join(', ') : (ansRec?.userAnswer || '(未答)')}
                      </span>
                    </div>
                    <div className="flex items-start">
                      <span className="w-20 shrink-0 text-slate-500">正确答案：</span>
                      <span className="font-medium text-slate-800 whitespace-pre-wrap">
                        {ansRec?.gradingMode === 'manual' ? (q.answerKey || q.rubric || '待人工处理') : q.correctAnswer}
                      </span>
                    </div>
                    {ansRec?.gradingMode === 'manual' && (
                      <>
                        <div className="flex items-start">
                          <span className="w-20 shrink-0 text-slate-500">评分得分：</span>
                          <span className="font-medium text-slate-800">
                            {attempt.gradingStatus === 'pending'
                              ? '待人工处理'
                              : `${Math.round(ansRec.score)} / ${Math.round(ansRec.maxScore ?? 0)}`}
                          </span>
                        </div>
                        {ansRec.reviewerComment && (
                          <div className="flex items-start">
                            <span className="w-20 shrink-0 text-slate-500">评语：</span>
                            <span className="text-slate-700 whitespace-pre-wrap">{ansRec.reviewerComment}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {q.explanation && (
                    <div className="bg-blue-50 p-3 rounded border border-blue-100 mt-4">
                      <span className="text-blue-700 font-medium block mb-1">【解析】</span>
                      <p className="text-blue-800/80 leading-relaxed whitespace-pre-wrap">{q.explanation}</p>
                    </div>
                  )}

                  {q.knowledgePage && (
                    <div className="flex items-center text-sm text-slate-500 mt-2">
                      <span className="mr-2">关联知识：</span>
                      <a href="#" className="text-blue-600 hover:underline">{q.knowledgePage}</a>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
