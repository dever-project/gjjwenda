'use client';

import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ExternalLink, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminRecordsPage() {
  const { examAttempts, publishedExams, users } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();

  const completedAttempts = examAttempts
    .filter(a => a.status === 'completed')
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const filteredAttempts = completedAttempts.filter(a => {
    const user = users.find(u => u.id === a.userId);
    const exam = publishedExams.find(e => e.id === a.publishedExamId);
    if (!user || !exam) return false;
    
    const searchString = `${user.name} ${exam.name}`.toLowerCase();
    return searchString.includes(searchTerm.toLowerCase());
  });

  const handleExport = () => {
    const rows = [
      ['交卷时间', '员工', '账号', '考试名称', '得分', '结果', '评分状态', '红线错题', '是否需重考'],
      ...filteredAttempts.map((attempt) => {
        const user = users.find((item) => item.id === attempt.userId);
        const exam = publishedExams.find((item) => item.id === attempt.publishedExamId);
        return [
          attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '',
          user?.name ?? attempt.userId,
          user?.username ?? '',
          exam?.name ?? attempt.publishedExamId,
          attempt.score,
          attempt.gradingStatus === 'pending' ? '待人工处理' : attempt.passed ? '通过' : '未通过',
          attempt.gradingStatus === 'pending' ? '待人工处理' : '已完成',
          attempt.redlineWrongCount,
          attempt.needRetake ? '是' : '否',
        ];
      }),
    ];

    downloadCsv(`考试成绩_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-800">成绩管理</h1>
        <Button variant="outline" onClick={handleExport} disabled={filteredAttempts.length === 0}>
          <Download className="w-4 h-4 mr-2" /> 导出记录
        </Button>
      </div>

      <div className="mb-4 flex items-center bg-white p-4 rounded-lg shadow-sm border border-slate-200">
        <div className="relative w-64">
           <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
           <Input 
             placeholder="搜索员工或问卷..." 
             className="pl-9"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        <div className="ml-4 text-sm text-slate-500">
          共 {filteredAttempts.length} 条记录
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-lg shadow-sm border border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50 sticky top-0 z-10">
            <TableRow>
              <TableHead>交卷时间</TableHead>
              <TableHead>员工</TableHead>
              <TableHead>考试名称</TableHead>
              <TableHead className="w-24 text-center">得分</TableHead>
              <TableHead className="w-24 text-center">结果</TableHead>
              <TableHead className="w-24 text-center">红线错题</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAttempts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-500">
                  无匹配的成绩记录
                </TableCell>
              </TableRow>
            ) : (
              filteredAttempts.map(attempt => {
                const user = users.find(u => u.id === attempt.userId);
                const exam = publishedExams.find(e => e.id === attempt.publishedExamId);
                if (!user || !exam) return null;
                
                return (
                  <TableRow key={attempt.id}>
                    <TableCell className="text-slate-500 text-sm">
                      {new Date(attempt.submittedAt || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">{user.name}</TableCell>
                    <TableCell>{exam.name}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${attempt.passed ? 'text-green-600' : 'text-orange-600'}`}>
                        {attempt.score}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={attempt.passed ? 'border-green-200 text-green-700 bg-green-50' : 'border-orange-200 text-orange-700 bg-orange-50'}>
                        {attempt.gradingStatus === 'pending' ? '待处理' : attempt.passed ? '通过' : '未通过'}
                      </Badge>
                      {attempt.needRetake && (
                         <div className="text-[10px] text-red-500 mt-1">需重考</div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                       {attempt.redlineWrongCount > 0 ? (
                         <Badge variant="destructive">{attempt.redlineWrongCount}</Badge>
                       ) : (
                         <span className="text-slate-300">-</span>
                       )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/admin/records/${attempt.id}`)}>
                        <ExternalLink className="w-4 h-4 mr-1" />
                        {attempt.gradingStatus === 'pending' ? '处理' : '详情'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
