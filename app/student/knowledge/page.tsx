'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function StudentKnowledgePage() {
  const router = useRouter();

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-slate-50 p-8">
      <Card className="w-full max-w-2xl border-slate-200">
        <CardHeader>
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
            <BookOpen className="h-6 w-6 text-orange-600" />
          </div>
          <CardTitle className="text-2xl text-slate-800">知识库学习在飞书完成</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>
            本系统不再记录知识库学习打卡。请先在公司飞书知识库完成主教材、案例库和题库复习，再回到这里参加考试认证。
          </p>
          <p>
            管理端同步的知识库内容主要用于题库管理、考试范围归类和后续 AI 情景训练上下文，不作为员工端学习进度的解锁条件。
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button className="bg-orange-600 hover:bg-orange-700" onClick={() => router.push('/student')}>
              返回考试认证
            </Button>
            <Button variant="outline" onClick={() => router.push('/student/records')}>
              查看考试记录
            </Button>
            <Button variant="ghost" disabled className="text-slate-400">
              <ExternalLink className="mr-2 h-4 w-4" />
              飞书入口由管理员统一配置
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
