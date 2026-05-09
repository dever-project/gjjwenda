import type { AiTrainingRedlineRule, AiTrainingRubricItem } from '@/lib/appTypes';

export const DEFAULT_AI_TRAINING_RUBRIC: AiTrainingRubricItem[] = [
  {
    id: 'business_understanding',
    name: '业务理解',
    description: '识别客户问题、业务背景和关键风险点。',
    maxScore: 20,
  },
  {
    id: 'knowledge_usage',
    name: '资料运用',
    description: '准确转化场景资料中的核心知识。',
    maxScore: 20,
  },
  {
    id: 'conversation_progress',
    name: '沟通推进',
    description: '通过澄清、安抚、追问推进下一步。',
    maxScore: 20,
  },
  {
    id: 'expression',
    name: '话术表达',
    description: '表达清楚、专业、自然，适合真实业务场景。',
    maxScore: 20,
  },
  {
    id: 'compliance',
    name: '合规安全',
    description: '避开红线、禁语和越界承诺。',
    maxScore: 20,
  },
];

export const DEFAULT_AI_TRAINING_REDLINES: AiTrainingRedlineRule[] = [
  {
    id: 'no_judicial_guarantee',
    title: '禁止承诺司法结果',
    description: '不得承诺撤拍、保房、一定不被拍卖或法院结果。',
    severity: 'high',
  },
  {
    id: 'no_fake_lease',
    title: '禁止诱导虚假租赁',
    description: '不得建议补做、倒签、虚构租约或伪造占有事实。',
    severity: 'high',
  },
  {
    id: 'no_relationship_claim',
    title: '禁止关系型承诺',
    description: '不得暗示公司与法院、法官、拍辅机构存在特殊关系。',
    severity: 'high',
  },
];

export function getRubricTotal(rubric: AiTrainingRubricItem[]) {
  return rubric.reduce((sum, item) => sum + (Number.isFinite(item.maxScore) ? item.maxScore : 0), 0);
}

export function isValidRubricTotal(rubric: AiTrainingRubricItem[]) {
  return getRubricTotal(rubric) === 100;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
