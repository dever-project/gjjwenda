'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_AI_TRAINING_REDLINES,
  DEFAULT_AI_TRAINING_RUBRIC,
  createId,
  getRubricTotal,
  isValidRubricTotal,
} from '@/lib/ai-training/defaults';
import { readAiTrainingDocument, truncateScenarioDocuments } from '@/lib/ai-training/documents';
import type {
  AiTrainingDifficulty,
  AiTrainingRedlineSeverity,
  AiTrainingScenario,
  AiTrainingScenarioStatus,
} from '@/lib/appTypes';
import { useStore } from '@/store/useStore';
import { Archive, ClipboardList, FileText, MessagesSquare, Pencil, Plus, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';

const DIFFICULTY_OPTIONS: AiTrainingDifficulty[] = ['基础', '中等', '高'];

const STATUS_META: Record<AiTrainingScenarioStatus, { label: string; className: string }> = {
  draft: { label: '草稿', className: 'bg-slate-100 text-slate-600 hover:bg-slate-100' },
  published: { label: '已发布', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  archived: { label: '已归档', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
};

const SEVERITY_META: Record<AiTrainingRedlineSeverity, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

function getCurrentTimestamp() {
  return new Date().getTime();
}

function scenarioField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function createEmptyScenario(): AiTrainingScenario {
  const now = getCurrentTimestamp();
  return {
    id: createId('scenario'),
    name: '',
    stage: '',
    description: '',
    difficulty: '中等',
    aiRole: '',
    traineeRole: '',
    traineeTask: '',
    trainingBoundaries: '',
    openingMessage: '',
    scoringRubric: DEFAULT_AI_TRAINING_RUBRIC.map((item) => ({ ...item })),
    redlineRules: DEFAULT_AI_TRAINING_REDLINES.map((item) => ({ ...item })),
    documents: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function cloneScenario(scenario: AiTrainingScenario): AiTrainingScenario {
  return {
    ...scenario,
    traineeRole: scenario.traineeRole || '员工',
    trainingBoundaries: scenario.trainingBoundaries || '',
    scoringRubric: scenario.scoringRubric.map((item) => ({ ...item })),
    redlineRules: scenario.redlineRules.map((item) => ({ ...item })),
    documents: scenario.documents.map((item) => ({ ...item })),
  };
}

function validateScenario(scenario: AiTrainingScenario, publish: boolean) {
  if (!scenarioField(scenario.name)) return '请填写场景名称';
  if (!scenarioField(scenario.aiRole)) return '请填写 AI 扮演角色';
  if (!scenarioField(scenario.traineeRole)) return '请填写员工扮演角色';
  if (!scenarioField(scenario.traineeTask)) return '请填写员工训练目标';
  if (!scenarioField(scenario.openingMessage)) return '请填写 AI 开场白';
  if (publish && !isValidRubricTotal(scenario.scoringRubric)) return '评分维度总分必须等于 100';
  return '';
}

function withTruncatedDocuments(scenario: AiTrainingScenario): AiTrainingScenario {
  return {
    ...scenario,
    traineeRole: scenario.traineeRole || '员工',
    trainingBoundaries: scenario.trainingBoundaries || '',
    documents: truncateScenarioDocuments(scenario.documents),
  };
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
}

export default function AiTrainingAdminPage() {
  const { aiTrainingScenarios, upsertAiTrainingScenario, deleteAiTrainingScenario } = useStore();
  const router = useRouter();
  const [editingScenario, setEditingScenario] = useState<AiTrainingScenario | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const sortedScenarios = useMemo(
    () => [...aiTrainingScenarios].sort((a, b) => b.updatedAt - a.updatedAt),
    [aiTrainingScenarios]
  );
  const rubricTotal = editingScenario ? getRubricTotal(editingScenario.scoringRubric) : 0;
  const isRubricTotalValid = editingScenario ? isValidRubricTotal(editingScenario.scoringRubric) : true;

  const updateScenario = (changes: Partial<AiTrainingScenario>) => {
    setEditingScenario((scenario) => (scenario ? { ...scenario, ...changes } : scenario));
  };

  const updateRubricItem = (
    itemId: string,
    changes: Partial<AiTrainingScenario['scoringRubric'][number]>
  ) => {
    setEditingScenario((scenario) => scenario
      ? {
          ...scenario,
          scoringRubric: scenario.scoringRubric.map((item) =>
            item.id === itemId ? { ...item, ...changes } : item
          ),
        }
      : scenario
    );
  };

  const updateRedlineRule = (
    ruleId: string,
    changes: Partial<AiTrainingScenario['redlineRules'][number]>
  ) => {
    setEditingScenario((scenario) => scenario
      ? {
          ...scenario,
          redlineRules: scenario.redlineRules.map((rule) =>
            rule.id === ruleId ? { ...rule, ...changes } : rule
          ),
        }
      : scenario
    );
  };

  const openCreateDialog = () => setEditingScenario(createEmptyScenario());
  const openEditDialog = (scenario: AiTrainingScenario) => setEditingScenario(cloneScenario(scenario));

  const handleSave = async (publish = false) => {
    if (!editingScenario) {
      return;
    }

    const errorMessage = validateScenario(editingScenario, publish);
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    setIsSaving(true);
    try {
      const scenarioToSave = withTruncatedDocuments(editingScenario);
      await upsertAiTrainingScenario({
        ...scenarioToSave,
        status: publish ? 'published' : scenarioToSave.status || 'draft',
        updatedAt: getCurrentTimestamp(),
      });
      toast.success(publish ? '情景训练已发布' : '情景训练已保存');
      setEditingScenario(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (scenario: AiTrainingScenario, status: AiTrainingScenarioStatus) => {
    const errorMessage = status === 'published' ? validateScenario(scenario, true) : '';
    if (errorMessage) {
      toast.error(errorMessage);
      return;
    }

    try {
      await upsertAiTrainingScenario(withTruncatedDocuments({
        ...scenario,
        status,
        updatedAt: getCurrentTimestamp(),
      }));
      toast.success(status === 'published' ? '情景训练已发布' : '情景训练已归档');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '状态更新失败');
    }
  };

  const handleDelete = async (scenario: AiTrainingScenario) => {
    if (!window.confirm(`确认删除情景训练“${scenario.name}”？相关训练记录也会被删除。`)) {
      return;
    }

    try {
      await deleteAiTrainingScenario(scenario.id);
      toast.success('情景训练已删除');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) {
      return;
    }

    setIsUploading(true);
    try {
      const results = await Promise.allSettled(files.map((file) => readAiTrainingDocument(file)));
      const documents = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      const errors = results.flatMap((result, index) =>
        result.status === 'rejected'
          ? [`${files[index].name}：${result.reason instanceof Error ? result.reason.message : '解析失败'}`]
          : []
      );

      if (documents.length > 0) {
        setEditingScenario((scenario) => scenario
          ? { ...scenario, documents: truncateScenarioDocuments([...scenario.documents, ...documents]) }
          : scenario
        );
        toast.success(`已上传 ${documents.length} 份资料`);
      }
      errors.forEach((message) => toast.error(message));
    } finally {
      setIsUploading(false);
    }
  };

  const removeDocument = (documentId: string) => {
    setEditingScenario((scenario) => scenario
      ? {
          ...scenario,
          documents: scenario.documents.filter((document) => document.id !== documentId),
        }
      : scenario
    );
  };

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessagesSquare className="h-5 w-5 text-orange-500" />
            情景训练
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500">管理 AI 对练场景、资料、评分维度和红线规则</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/ai-training/records')}>
            <ClipboardList className="mr-2 h-4 w-4" />
            训练记录
          </Button>
          <Button onClick={openCreateDialog} className="bg-orange-600 hover:bg-orange-700">
            <Plus className="mr-2 h-4 w-4" />
            新建场景
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-6">
        <div className="app-scrollbar flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-slate-50 font-semibold text-slate-500">
              <TableRow>
                <TableHead>场景名称</TableHead>
                <TableHead className="w-28">阶段</TableHead>
                <TableHead className="w-24">难度</TableHead>
                <TableHead className="w-24">状态</TableHead>
                <TableHead className="w-24">资料数</TableHead>
                <TableHead className="w-40">更新时间</TableHead>
                <TableHead className="w-72 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedScenarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-slate-500">
                    暂无情景训练场景，请先新建一个场景
                  </TableCell>
                </TableRow>
              ) : (
                sortedScenarios.map((scenario) => (
                  <TableRow key={scenario.id}>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium text-slate-900" title={scenario.name}>
                        {scenario.name}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-slate-500" title={scenario.traineeTask}>
                        员工：{scenario.traineeRole || '员工'} · {scenario.traineeTask || '未填写训练目标'}
                      </div>
                    </TableCell>
                    <TableCell>{scenario.stage || '-'}</TableCell>
                    <TableCell>{scenario.difficulty}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_META[scenario.status].className}>
                        {STATUS_META[scenario.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>{scenario.documents.length} 份</TableCell>
                    <TableCell>{formatDate(scenario.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {scenario.status !== 'published' && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(scenario, 'published')}>
                            发布
                          </Button>
                        )}
                        {scenario.status !== 'archived' && (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(scenario, 'archived')}>
                            <Archive className="mr-1 h-4 w-4" />
                            下线
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(scenario)}>
                          <Pencil className="mr-1 h-4 w-4" />
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(scenario)}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!editingScenario} onOpenChange={(open) => !open && setEditingScenario(null)}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[960px]">
          <DialogHeader>
            <DialogTitle>{editingScenario?.name ? '编辑情景训练' : '新建情景训练'}</DialogTitle>
          </DialogHeader>

          {editingScenario && (
            <div className="app-scrollbar max-h-[68vh] space-y-6 overflow-y-auto pr-2">
              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>场景名称</Label>
                  <Input
                    value={editingScenario.name}
                    onChange={(event) => updateScenario({ name: event.target.value })}
                    placeholder="例如：法拍房咨询接待"
                  />
                </div>
                <div className="space-y-2">
                  <Label>适用阶段</Label>
                  <Input
                    value={editingScenario.stage ?? ''}
                    onChange={(event) => updateScenario({ stage: event.target.value })}
                    placeholder="例如：J 节点面谈"
                  />
                </div>
                <div className="space-y-2">
                  <Label>难度</Label>
                  <select
                    value={editingScenario.difficulty}
                    onChange={(event) => updateScenario({ difficulty: event.target.value as AiTrainingDifficulty })}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-950/10"
                  >
                    {DIFFICULTY_OPTIONS.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>{difficulty}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>场景说明</Label>
                  <Textarea
                    value={editingScenario.description}
                    onChange={(event) => updateScenario({ description: event.target.value })}
                    placeholder="说明训练背景、业务上下文或适用对象"
                    className="min-h-20"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>AI 开场白</Label>
                  <Textarea
                    value={editingScenario.openingMessage}
                    onChange={(event) => updateScenario({ openingMessage: event.target.value })}
                    placeholder="AI 在训练开始时说出的第一句话"
                    className="min-h-20"
                  />
                </div>
                <div className="space-y-2">
                  <Label>AI 扮演角色</Label>
                  <Textarea
                    value={editingScenario.aiRole}
                    onChange={(event) => updateScenario({ aiRole: event.target.value })}
                    placeholder="例如：有购买意向但预算有限的客户、销售顾问、面试官"
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>员工扮演角色</Label>
                  <Textarea
                    value={editingScenario.traineeRole}
                    onChange={(event) => updateScenario({ traineeRole: event.target.value })}
                    placeholder="例如：销售顾问、客户、客服、面试候选人"
                    className="min-h-24"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>员工训练目标</Label>
                  <Textarea
                    value={editingScenario.traineeTask}
                    onChange={(event) => updateScenario({ traineeTask: event.target.value })}
                    placeholder="说明员工在这个角色下需要完成的目标，例如识别需求、提出异议、促成购买或判断销售表达是否合规"
                    className="min-h-24"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">场景资料与边界</h3>
                    <p className="text-xs text-slate-500">边界单独生效；资料用于提供案例、话术和业务知识。</p>
                  </div>
                  <label className="inline-flex h-9 cursor-pointer items-center rounded-md bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800">
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {isUploading ? '上传中...' : '上传资料'}
                    <input
                      type="file"
                      multiple
                      accept=".docx,.txt,.md"
                      onChange={handleUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <Label>训练边界</Label>
                  <Textarea
                    value={editingScenario.trainingBoundaries}
                    onChange={(event) => updateScenario({ trainingBoundaries: event.target.value })}
                    placeholder="说明角色边界、沟通范围、禁止越界内容。例如：AI 不主动给标准答案；员工不得跳出客户身份；不得承诺司法结果。"
                    className="min-h-20"
                  />
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  {editingScenario.documents.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-500">暂无上传资料</p>
                  ) : (
                    editingScenario.documents.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate text-xs font-medium text-slate-800">
                            <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                            {document.fileName}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {document.fileType.toUpperCase()} · {document.text.length} 字
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeDocument(document.id)}
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          移除
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">评分维度</h3>
                  <span className={`text-xs font-semibold ${isRubricTotalValid ? 'text-green-700' : 'text-red-600'}`}>
                    当前总分：{rubricTotal} / 100
                  </span>
                </div>
                <div className={`space-y-3 rounded-lg border p-3 ${isRubricTotalValid ? 'border-slate-200' : 'border-red-200 bg-red-50/40'}`}>
                  {editingScenario.scoringRubric.map((item) => (
                    <div key={item.id} className="grid gap-2 rounded-md bg-white p-3 md:grid-cols-[1fr_2fr_100px]">
                      <Input
                        value={item.name}
                        onChange={(event) => updateRubricItem(item.id, { name: event.target.value })}
                        placeholder="维度名称"
                      />
                      <Input
                        value={item.description}
                        onChange={(event) => updateRubricItem(item.id, { description: event.target.value })}
                        placeholder="评分说明"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={item.maxScore}
                        onChange={(event) => updateRubricItem(item.id, { maxScore: Number(event.target.value) })}
                        placeholder="分值"
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">红线规则</h3>
                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  {editingScenario.redlineRules.map((rule) => (
                    <div key={rule.id} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_2fr_110px]">
                      <Input
                        value={rule.title}
                        onChange={(event) => updateRedlineRule(rule.id, { title: event.target.value })}
                        placeholder="红线标题"
                      />
                      <Input
                        value={rule.description}
                        onChange={(event) => updateRedlineRule(rule.id, { description: event.target.value })}
                        placeholder="红线说明"
                      />
                      <select
                        value={rule.severity}
                        onChange={(event) => updateRedlineRule(rule.id, { severity: event.target.value as AiTrainingRedlineSeverity })}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-slate-950/10"
                      >
                        {Object.entries(SEVERITY_META).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingScenario(null)} disabled={isSaving}>
              取消
            </Button>
            <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
              {isSaving ? '保存中...' : '保存草稿'}
            </Button>
            <Button onClick={() => handleSave(true)} className="bg-orange-600 hover:bg-orange-700" disabled={isSaving}>
              发布
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
