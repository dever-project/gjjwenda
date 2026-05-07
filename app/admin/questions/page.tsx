'use client';

import { useState, useRef } from 'react';
import { useStore, Question, ExamConfig } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Search, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createDocxExamConfigs,
  parseConfigRows,
  parseQuestionRows,
  parseTeacherDocxQuestions,
} from '@/lib/training/questionImport';

function extractDocxText(buffer: ArrayBuffer) {
  const cfb = (XLSX as any).CFB.read(new Uint8Array(buffer), { type: 'array' });
  const documentFile =
    (XLSX as any).CFB.find(cfb, '/word/document.xml') ||
    (XLSX as any).CFB.find(cfb, 'document.xml');

  if (!documentFile?.content) {
    throw new Error('DOCX 中未找到 word/document.xml');
  }

  const xml = new TextDecoder('utf-8').decode(documentFile.content);
  const xmlDoc = new DOMParser().parseFromString(xml, 'application/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('DOCX XML 解析失败');
  }

  const paragraphs = xmlDoc.getElementsByTagName('w:p').length > 0
    ? Array.from(xmlDoc.getElementsByTagName('w:p'))
    : Array.from(xmlDoc.getElementsByTagNameNS('*', 'p'));

  return paragraphs
    .map((paragraph) => {
      const parts: string[] = [];
      paragraph.querySelectorAll('*').forEach((node) => {
        if (node.localName === 't' || node.localName === 'delText') {
          parts.push(node.textContent ?? '');
        } else if (node.localName === 'tab') {
          parts.push('\t');
        } else if (node.localName === 'br') {
          parts.push('\n');
        }
      });

      return parts.join('').trim();
    })
    .filter(Boolean)
    .join('\n');
}

export default function QuestionsPage() {
  const {
    questions,
    examConfigs,
    publishedExams,
    examAttempts,
    trainingProgress,
    knowledgeCategories,
    importQuestionData,
    clearQuestionBank,
  } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isClearOpen, setIsClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDocxUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const text = extractDocxText(buffer);
    const newQuestions = parseTeacherDocxQuestions(text, `docx_${Date.now()}`);

    if (newQuestions.length === 0) {
      toast.error('未从 DOCX 中解析到题库数据');
      return;
    }

    const newConfigs = createDocxExamConfigs(file.name, newQuestions, `ec_docx_${Date.now()}`);
    importQuestionData([...questions, ...newQuestions], [...newConfigs, ...examConfigs]);
    toast.success(`成功从 DOCX 导入 ${newQuestions.length} 道题目，并生成 ${newConfigs.length} 份考试配置`);
  };

  const handleSpreadsheetUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

    // Parse Question Bank
    const questionSheetName = wb.SheetNames.find(name => name.includes('01') || name.includes('题库'));
    let newQuestions: Question[] = [];
    if (questionSheetName) {
      const ws = wb.Sheets[questionSheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      newQuestions = parseQuestionRows(data, `q_${Date.now()}`);
    }

    // Parse Exam Configs
    const configSheetName = wb.SheetNames.find(name => name.includes('00') || name.includes('问卷说明'));
    let newConfigs: ExamConfig[] = [];
    if (configSheetName) {
      const ws = wb.Sheets[configSheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
      newConfigs = parseConfigRows(data, `ec_${Date.now()}`);
    }

    if (newQuestions.length > 0 || newConfigs.length > 0) {
      importQuestionData(
        newQuestions.length > 0 ? [...questions, ...newQuestions] : questions,
        newConfigs.length > 0 ? newConfigs : examConfigs
      );
    }

    if (newQuestions.length > 0) {
      toast.success(`成功导入 ${newQuestions.length} 道题目`);
    } else {
      toast.error(`未找到题库数据`);
    }

    if (newConfigs.length > 0) {
      toast.success(`成功导入 ${newConfigs.length} 份问卷配置`);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.docx')) {
        await handleDocxUpload(file);
      } else {
        await handleSpreadsheetUpload(file);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : '解析文件失败，请检查格式');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredQuestions = questions.filter(q => 
    q.title.includes(searchTerm) || q.questionNo.includes(searchTerm) || q.examGroup.includes(searchTerm)
  );
  const hasQuestionBankData =
    questions.length > 0 ||
    examConfigs.length > 0 ||
    publishedExams.length > 0 ||
    examAttempts.length > 0 ||
    trainingProgress.length > 0;

  const getCategoryName = (categoryId?: string) =>
    categoryId ? knowledgeCategories.find((category) => category.id === categoryId)?.name ?? categoryId : '-';

  const handleClearQuestionBank = async () => {
    if (!hasQuestionBankData) {
      toast.info('当前没有可清空的题库数据');
      return;
    }

    setIsClearing(true);
    try {
      await clearQuestionBank();
      toast.success('已清空题库、考试配置、已发布考试、考试记录和学习进度');
      setIsClearOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '清空题库失败');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <h2 className="text-lg font-semibold">题库管理</h2>
        <div className="flex items-center gap-4">
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv, .docx" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleUpload}
          />
          <Button variant="default" onClick={() => fileInputRef.current?.click()} className="bg-orange-600 hover:bg-orange-700 text-white rounded-full px-4 h-8 text-xs font-semibold">
            <Upload className="mr-2 h-3.5 w-3.5" />
            导入题库/考试数据
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsClearOpen(true)}
            disabled={!hasQuestionBankData}
            className="rounded-full px-4 h-8 text-xs font-semibold border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            清空题库
          </Button>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="relative w-64">
               <Search className="absolute left-3 top-1.5 opacity-40 text-xs" />
               <Input 
                 placeholder="搜索题目、编号或分组..." 
                 className="pl-9 pr-4 py-1.5 bg-slate-100 border-none rounded-full text-xs focus:ring-2 focus:ring-orange-500 outline-none transition-all"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <div className="ml-4 text-xs font-medium text-slate-500">
              共 {filteredQuestions.length} 题
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-slate-200">
          <Table className="text-xs">
            <TableHeader className="bg-slate-50 sticky top-0 z-10 text-slate-500 font-semibold">
            <TableRow>
              <TableHead className="w-20">题号</TableHead>
              <TableHead className="w-32">分组</TableHead>
              <TableHead className="w-32">分类</TableHead>
              <TableHead className="w-24">题型</TableHead>
              <TableHead>题目</TableHead>
              <TableHead className="w-20">阅卷</TableHead>
              <TableHead className="w-32">难度</TableHead>
              <TableHead className="w-24">红线题</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredQuestions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500">
                  暂无题目数据，请导入飞书表格或教师版 DOCX 题库
                </TableCell>
              </TableRow>
            ) : (
              filteredQuestions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.questionNo}</TableCell>
                  <TableCell>{q.examGroup}</TableCell>
                  <TableCell>{getCategoryName(q.categoryId)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{q.type}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate" title={q.title}>
                    {q.title}
                  </TableCell>
                  <TableCell>{q.gradingMode === 'manual' ? '人工' : '自动'}</TableCell>
                  <TableCell>{q.difficulty}</TableCell>
                  <TableCell>
                    {q.isRedline ? <Badge variant="destructive">红线</Badge> : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </div>
      <Dialog open={isClearOpen} onOpenChange={setIsClearOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              确认清空题库？
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>此操作会清空当前测试用的考试数据，且无法撤销。</p>
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-red-700">
              将删除：{questions.length} 道题目、{examConfigs.length} 份考试配置、
              {publishedExams.length} 份已发布考试、{examAttempts.length} 条考试记录、
              {trainingProgress.length} 条学习进度。
            </div>
            <p>员工账号和飞书配置不会被删除。</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearOpen(false)} disabled={isClearing}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearQuestionBank}
              disabled={isClearing}
            >
              {isClearing ? '清空中...' : '确认清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
