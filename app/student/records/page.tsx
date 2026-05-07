'use client';

import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { Eye, ListTodo } from 'lucide-react';

export default function StudentRecordsPage() {
  const { examAttempts, publishedExams, currentUser } = useStore();
  const router = useRouter();

  if (!currentUser) return null;

  const myAttempts = examAttempts
    .filter(a => a.userId === currentUser.id && a.status === 'completed')
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const description =
    currentUser.role === 'admin'
      ? '这里展示当前管理员账号本人的考试记录；查看所有员工成绩请进入“成绩管理”。'
      : '查看您所有的历史考试成绩和解析。';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-800">考试记录</h1>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="rounded-full bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">
          共 {myAttempts.length} 条
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead className="min-w-48">交卷时间</TableHead>
                <TableHead className="min-w-80">考试名称</TableHead>
                <TableHead className="w-24 text-center">得分</TableHead>
                <TableHead className="w-24 text-center">结果</TableHead>
                <TableHead className="w-24 text-center">红线错题</TableHead>
                <TableHead className="w-36 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myAttempts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                        <ListTodo className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="font-medium text-slate-700">暂无考试记录</p>
                      <p className="mt-1 text-sm text-slate-500">完成考试后，成绩和解析会显示在这里。</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                myAttempts.map(attempt => {
                  const exam = publishedExams.find(e => e.id === attempt.publishedExamId);
                  if (!exam) return null;
                  
                  return (
                    <TableRow key={attempt.id}>
                      <TableCell className="text-slate-500 text-sm">
                        {new Date(attempt.submittedAt || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium text-slate-700">{exam.name}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-bold ${attempt.passed ? 'text-green-600' : 'text-orange-600'}`}>
                          {attempt.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={attempt.passed ? 'border-green-200 text-green-700 bg-green-50' : 'border-orange-200 text-orange-700 bg-orange-50'}>
                          {attempt.gradingStatus === 'pending' ? '待处理' : attempt.passed ? '通过' : '未通过'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                         {attempt.redlineWrongCount > 0 ? (
                           <Badge variant="destructive">{attempt.redlineWrongCount}</Badge>
                         ) : (
                           <span className="text-slate-300">-</span>
                         )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/student/exam/${attempt.id}/result`)}>
                          <Eye className="w-4 h-4 mr-1" /> 查看详情
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
