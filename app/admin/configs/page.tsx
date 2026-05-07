'use client';

import { useState } from 'react';
import { useStore, ExamConfig } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, PlayCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createPublishedExam } from '@/lib/training/exam';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ConfigsPage() {
  const {
    examConfigs,
    questions,
    publishedExams,
    examAttempts,
    knowledgeCategories,
    publishExam,
    deleteExamConfig,
  } = useStore();
  const [deleteTarget, setDeleteTarget] = useState<ExamConfig | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleGenerateExam = (config: ExamConfig) => {
    const newPublished = createPublishedExam(config, questions);
    if (!newPublished) {
      toast.error('题库中没有符合该问卷配置的题目，无法生成！请检查题库。');
      return;
    }

    publishExam(newPublished);
    const exists = publishedExams.find(p => p.examConfigId === config.id && p.status === 'active');
    toast.success(
      `${exists ? '考试已重新生成并发布' : '考试生成发布成功'}，共包含 ${newPublished.questionIds.length} 道题`
    );
  };

  const getCategoryNames = (categoryIds?: string[]) => {
    if (!categoryIds || categoryIds.length === 0) {
      return '不限定';
    }

    return categoryIds
      .map((id) => knowledgeCategories.find((category) => category.id === id)?.name ?? id)
      .join('、');
  };

  const getDeleteImpact = (configId: string) => {
    const relatedPublishedExamIds = publishedExams
      .filter((exam) => exam.examConfigId === configId)
      .map((exam) => exam.id);
    const relatedAttemptCount = examAttempts.filter((attempt) =>
      relatedPublishedExamIds.includes(attempt.publishedExamId)
    ).length;

    return {
      publishedExamCount: relatedPublishedExamIds.length,
      attemptCount: relatedAttemptCount,
    };
  };

  const handleDeleteExamConfig = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteExamConfig(deleteTarget.id);
      toast.success(`已删除考试：${deleteTarget.name}`);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除考试失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteImpact = deleteTarget ? getDeleteImpact(deleteTarget.id) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <h2 className="text-lg font-semibold">考试配置</h2>
        <p className="text-slate-500 text-xs font-medium">按知识分类和题型规则抽题，发布给员工完成本系统考试认证</p>
      </header>

      <div className="flex-1 p-6 flex flex-col overflow-hidden">
        <div className="app-scrollbar flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-slate-200">
          <Table className="text-xs">
            <TableHeader className="bg-slate-50 sticky top-0 z-10 text-slate-500 font-semibold">
            <TableRow>
              <TableHead>考试名称</TableHead>
              <TableHead>适用阶段</TableHead>
              <TableHead>知识分类</TableHead>
              <TableHead>题型组合</TableHead>
              <TableHead className="w-24">建议题数</TableHead>
              <TableHead className="w-24">考试时长</TableHead>
              <TableHead className="w-24">通过标准</TableHead>
              <TableHead className="w-32">状态</TableHead>
              <TableHead className="w-56 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {examConfigs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-slate-500">
                  无配置数据，请先在“题库管理”导入数据
                </TableCell>
              </TableRow>
            ) : (
              examConfigs.map((config) => {
                const isPublished = publishedExams.some(p => p.examConfigId === config.id && p.status === 'active');
                return (
                  <TableRow key={config.id}>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell>{config.stage}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={getCategoryNames(config.categoryIds)}>
                      {getCategoryNames(config.categoryIds)}
                    </TableCell>
                    <TableCell>{config.typeCombination || '所有'}</TableCell>
                    <TableCell>{config.suggestedCount} 题</TableCell>
                    <TableCell>{config.durationMinutes ? `${config.durationMinutes} 分钟` : '不限时'}</TableCell>
                    <TableCell>{config.passScore} 分</TableCell>
                    <TableCell>
                      {isPublished ? (
                         <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-transparent">已生成发布</Badge>
                      ) : (
                         <Badge variant="secondary">未生成</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant={isPublished ? "outline" : "default"} onClick={() => handleGenerateExam(config)}>
                          <PlayCircle className="w-4 h-4 mr-1" />
                          {isPublished ? '重新生成' : '一键发布'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTarget(config)}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      </div>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              确认删除考试？
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              将删除考试配置：
              <span className="font-semibold text-slate-900">{deleteTarget?.name}</span>
            </p>
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
              同时删除：{deleteImpact?.publishedExamCount ?? 0} 份已发布考试、
              {deleteImpact?.attemptCount ?? 0} 条相关考试记录。
            </div>
            <p>题库中的题目不会被删除。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteExamConfig} disabled={isDeleting}>
              {isDeleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
