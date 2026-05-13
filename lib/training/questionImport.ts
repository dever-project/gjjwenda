import type { ExamConfig, ExamQuestionRule, GradingMode, Question, QuestionType } from '@/lib/appTypes';
import { DEFAULT_KNOWLEDGE_CATEGORIES } from '@/lib/appTypes';

type AnyRow = Record<string, unknown>;

const MANUAL_TYPES = new Set(['简答', '情景', '论述', '话术改写']);
const OBJECTIVE_TYPES = new Set(['单选', '多选', '判断', '填空']);

export const QUESTION_EXAM_GROUPS = ['新人考题', '岗位考题', '知识考题'];

const CATEGORY_KEYWORDS: Array<{ categoryId: string; keywords: string[] }> = [
  { categoryId: 'cat_mkt', keywords: ['MKT', '客资', '线索', '来源平台'] },
  { categoryId: 'cat_npl', keywords: ['NPL', '六问', '十一维', '首呼', '客户画像', '有效腾房'] },
  { categoryId: 'cat_jnode', keywords: ['J0', 'J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'J7', 'J8', 'J9', '司法', '拍卖公告', '查封'] },
  { categoryId: 'cat_lease', keywords: ['租赁权', '租约', '备案', '占有', '交付', '租客', '服务费置换'] },
  { categoryId: 'cat_pm', keywords: ['PM', '律师', '会审', '维护专家', '工单'] },
  { categoryId: 'cat_ala', keywords: ['ALA', '出租', '房源', '首期到账', '在租', '挂牌'] },
  { categoryId: 'cat_finance', keywords: ['绩效', '财务', '抵销', '回拨', '结算', '实收租金'] },
  { categoryId: 'cat_compliance', keywords: ['红线', '禁语', '熔断', '越界', '法院有关系', '保房', '撤拍', '借名回拍'] },
  { categoryId: 'cat_case', keywords: ['案例', '情景', '训练官', '复盘'] },
];

const DOCX_EXAM_GROUP_ORDER = QUESTION_EXAM_GROUPS;

const DOCX_LABEL_CATEGORIES: Array<{ categoryId: string; keywords: string[] }> = [
  { categoryId: 'cat_mkt', keywords: ['MKT'] },
  { categoryId: 'cat_npl', keywords: ['NPL'] },
  { categoryId: 'cat_pm', keywords: ['PM'] },
  { categoryId: 'cat_ala', keywords: ['ALA'] },
  { categoryId: 'cat_lease', keywords: ['租赁权', '租约'] },
  { categoryId: 'cat_jnode', keywords: ['查封', '司法', 'J节点'] },
  { categoryId: 'cat_finance', keywords: ['绩效', '财务'] },
  { categoryId: 'cat_compliance', keywords: ['红线', '合规'] },
  { categoryId: 'cat_business', keywords: ['新人', '协同', '飞书', '知识'] },
];

function readString(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function readNumber(row: AnyRow, keys: string[], fallback?: number) {
  const raw = readString(row, keys);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(row: AnyRow, keys: string[], fallback = false) {
  const value = readString(row, keys).toLowerCase();
  if (!value) {
    return fallback;
  }

  return ['是', 'true', '1', 'yes', '红线'].includes(value);
}

export function normalizeQuestionType(type: string): QuestionType {
  const value = type.trim();
  if (value.includes('多')) return '多选';
  if (value.includes('单')) return '单选';
  if (value.includes('判')) return '判断';
  if (value.includes('填')) return '填空';
  if (value.includes('简')) return '简答';
  if (value.includes('论')) return '论述';
  if (value.includes('情景') || value.includes('场景')) return '情景';
  if (value.includes('话术')) return '话术改写';
  return '单选';
}

export function inferCategoryId(...texts: Array<string | undefined>) {
  const content = texts.filter(Boolean).join(' ');
  const matched = CATEGORY_KEYWORDS.find((entry) =>
    entry.keywords.some((keyword) => content.includes(keyword))
  );

  return matched?.categoryId ?? 'cat_business';
}

function inferLabelCategoryId(label?: string) {
  if (!label) {
    return undefined;
  }

  return DOCX_LABEL_CATEGORIES.find((entry) =>
    entry.keywords.some((keyword) => label.includes(keyword))
  )?.categoryId;
}

function parseCategoryIds(value: string) {
  if (!value) {
    return [];
  }

  const names = value.split(/[、,，|/]/).map((item) => item.trim()).filter(Boolean);
  return names
    .map((name) => {
      const matched = DEFAULT_KNOWLEDGE_CATEGORIES.find(
        (category) => category.id === name || category.name === name || name.includes(category.name)
      );
      return matched?.id;
    })
    .filter(Boolean) as string[];
}

function defaultScore(type: string) {
  if (type === '多选') return 2;
  if (type === '简答') return 4;
  if (type === '情景') return 5;
  if (type === '论述') return 10;
  return 1;
}

function normalizeDocxLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function getSectionType(line: string): QuestionType | '专题' | undefined {
  if (line.includes('单选题')) return '单选';
  if (line.includes('多选题')) return '多选';
  if (line.includes('判断题')) return '判断';
  if (line.includes('填空题')) return '填空';
  if (line.includes('简答题')) return '简答';
  if (line.includes('情景题')) return '情景';
  if (line.includes('论述题')) return '论述';
  if (line.includes('话术改写题')) return '话术改写';
  if (line.includes('租赁权论证专题')) return '专题';
  return undefined;
}

function getSectionName(type?: string) {
  if (!type) return '教师版题库';
  if (type === '专题') return '租赁权论证专题';
  return `${type}题`;
}

function getDocxSection(line: string) {
  const examGroup = line.match(/^第[一二三四五六七八九十]+部分[｜|]\s*(.+)$/);
  if (examGroup) {
    return {
      sectionName: examGroup[1].trim(),
      sectionType: undefined,
    };
  }

  const sectionType = getSectionType(line);
  if (!sectionType) {
    return undefined;
  }

  return {
    sectionName: getSectionName(sectionType),
    sectionType,
  };
}

function parseDocxQuestionLine(line: string) {
  const matchedQuestion = line.match(/^(\d+)[.．、]\s*(.+)$/);
  if (!matchedQuestion) {
    return undefined;
  }

  const marker = matchedQuestion[2].trim().match(/^【([^】]+)】\s*(.+)$/);

  return {
    questionNo: matchedQuestion[1],
    label: marker?.[1]?.trim(),
    title: (marker?.[2] ?? matchedQuestion[2]).trim(),
  };
}

function parseChoiceOption(line: string) {
  const option = line.match(/^(?:[•·\-]\s*)?[（(]?([A-Da-d])[）).．、]\s*(.+)$/);
  if (!option) {
    return undefined;
  }

  return {
    key: option[1].toUpperCase(),
    value: option[2].trim(),
  };
}

function stripQuestionPrefix(title: string) {
  return title
    .replace(/^【[^】]+】\s*/, '')
    .replace(/^(简答|情景题?|论述|话术改写)[：:]\s*/, '')
    .trim();
}

function normalizeDocxAnswer(answer: string, type: string) {
  const value = answer.trim();
  if (type === '判断') {
    if (value === '对' || value === '正确') return '对';
    if (value === '错' || value === '错误') return '错';
  }

  if (type === '多选' || type === '单选') {
    return value.replace(/[^A-Da-d]/g, '').toUpperCase();
  }

  return value;
}

function inferDocxQuestionType(
  title: string,
  sectionType: QuestionType | '专题' | undefined,
  optionCount: number,
  answer: string,
  label?: string
): QuestionType {
  if (label) {
    return normalizeQuestionType(label);
  }

  if (/^简答[：:]/.test(title)) return '简答';
  if (/^情景题?[：:]/.test(title)) return '情景';
  if (/^论述[：:]/.test(title)) return '论述';
  if (/^话术改写[：:]/.test(title)) return '话术改写';
  if (sectionType && sectionType !== '专题') return sectionType;
  if (optionCount > 0) {
    return answer.replace(/[^A-Da-d]/g, '').length > 1 ? '多选' : '单选';
  }

  return '简答';
}

function isDocxRedlineQuestion(...texts: string[]) {
  const content = texts.join(' ');
  return [
    '红线',
    '倒签',
    '虚构',
    '借名回拍',
    '串标',
    '保证撤拍',
    '保证房',
    '肯定不会被拍',
    '法院有关系',
    '内部关系',
    '补做租约',
    '虚假租赁',
  ].some((keyword) => content.includes(keyword));
}

function hasBlankPlaceholder(title: string) {
  return /_{2,}|＿{2,}|[（(]\s*[）)]/.test(title);
}

function splitAnswerParts(answer: string) {
  return answer
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJudgeAnswerToken(answer: string) {
  const value = answer.replace(/[。.!！?？\s]/g, '').toLowerCase();
  if (value === '对' || value === '正确' || value === 'true' || value === '是') return '对';
  if (value === '错' || value === '错误' || value === 'false' || value === '否') return '错';
  return '';
}

function splitJudgeAnswerTokens(answer: string) {
  return splitAnswerParts(answer)
    .map(normalizeJudgeAnswerToken)
    .filter(Boolean);
}

interface DocxQuestionBlock {
  questionNo: string;
  label?: string;
  title: string;
  sectionType?: QuestionType | '专题';
  sectionName: string;
  lines: string[];
}

interface ParsedQuestionFields {
  options: Record<string, string>;
  answer: string;
  answerKey: string;
  explanation: string;
  bodyLines: string[];
}

function parseQuestionBlockFields(lines: string[]): ParsedQuestionFields {
  const options: Record<string, string> = {};
  const bodyLines: string[] = [];
  let answer = '';
  let answerKey = '';
  let explanation = '';
  let activeField: 'answer' | 'answerKey' | 'explanation' | undefined;

  lines.forEach((line) => {
    const option = parseChoiceOption(line);
    if (option) {
      options[option.key] = option.value;
      activeField = undefined;
      return;
    }

    const answerLine = line.match(/^(?:标准)?答案[：:；;]\s*(.*)$/);
    if (answerLine) {
      answer = answerLine[1].trim();
      activeField = 'answer';
      return;
    }

    const answerKeyLine = line.match(/^答案要点[：:]\s*(.*)$/);
    if (answerKeyLine) {
      answerKey = answerKeyLine[1].trim();
      activeField = 'answerKey';
      return;
    }

    const rewriteLine = line.match(/^推荐改写[：:]\s*(.*)$/);
    if (rewriteLine) {
      answerKey = rewriteLine[1].trim();
      activeField = 'answerKey';
      return;
    }

    const explanationLine = line.match(/^解析[：:]\s*(.*)$/);
    if (explanationLine) {
      explanation = explanationLine[1].trim();
      activeField = 'explanation';
      return;
    }

    if (activeField === 'answer') {
      answer = `${answer} ${line}`.trim();
    } else if (activeField === 'answerKey') {
      answerKey = `${answerKey} ${line}`.trim();
    } else if (activeField === 'explanation') {
      explanation = `${explanation} ${line}`.trim();
    } else {
      bodyLines.push(line);
    }
  });

  return { options, answer, answerKey, explanation, bodyLines };
}

function isUsableQuestion(question: Question) {
  if (!question.title) return false;
  if (MANUAL_TYPES.has(String(question.type))) {
    return Boolean(question.answerKey || question.rubric);
  }

  if (OBJECTIVE_TYPES.has(String(question.type))) {
    return Boolean(question.correctAnswer);
  }

  return true;
}

function createImportedQuestion({
  id,
  questionNo,
  examGroup,
  label,
  title,
  type,
  options,
  answer,
  answerKey,
  explanation,
  categoryTexts,
}: {
  id: string;
  questionNo: string;
  examGroup: string;
  label?: string;
  title: string;
  type: QuestionType;
  options: Record<string, string>;
  answer: string;
  answerKey: string;
  explanation: string;
  categoryTexts: string[];
}): Question {
  const normalizedAnswer = normalizeDocxAnswer(answer, type);
  const manual = MANUAL_TYPES.has(type);
  const gradingMode: GradingMode = manual ? 'manual' : 'auto';
  const categoryId =
    inferLabelCategoryId(label) ??
    inferCategoryId(...categoryTexts, title, explanation, answerKey, answer);

  return {
    id,
    questionNo,
    examGroup,
    categoryId,
    type,
    title,
    optionA: options.A,
    optionB: options.B,
    optionC: options.C,
    optionD: options.D,
    correctAnswer: manual ? '' : normalizedAnswer,
    answerKey: manual ? answerKey || answer : answerKey || undefined,
    explanation: explanation || undefined,
    rubric: manual ? answerKey || answer || undefined : undefined,
    difficulty: '基础',
    score: defaultScore(type),
    gradingMode,
    isRedline: isDocxRedlineQuestion(title, answer, answerKey, explanation),
  };
}

function splitDocxQuestionBlocks(text: string) {
  const blocks: DocxQuestionBlock[] = [];
  let sectionType: QuestionType | '专题' | undefined;
  let sectionName = getSectionName();
  let current: DocxQuestionBlock | null = null;

  normalizeDocxLines(text).forEach((line) => {
    const questionLine = parseDocxQuestionLine(line);
    if (questionLine) {
      current = {
        questionNo: sectionType === '专题' ? `专题-${questionLine.questionNo}` : questionLine.questionNo,
        label: questionLine.label,
        title: questionLine.title,
        sectionType,
        sectionName,
        lines: [],
      };
      blocks.push(current);
      return;
    }

    const nextSection = getDocxSection(line);
    if (nextSection) {
      sectionType = nextSection.sectionType;
      sectionName = nextSection.sectionName;
      return;
    }

    current?.lines.push(line);
  });

  return blocks;
}

export function parseTeacherDocxQuestions(text: string, idPrefix = `docx_${Date.now()}`): Question[] {
  return splitDocxQuestionBlocks(text)
    .map((block, index): Question => {
      const { options, answer, answerKey, explanation } = parseQuestionBlockFields(block.lines);

      const type = inferDocxQuestionType(
        block.title,
        block.sectionType,
        Object.keys(options).length,
        answer,
        block.label
      );
      const title = stripQuestionPrefix(block.title);

      return createImportedQuestion({
        id: `${idPrefix}_${index + 1}`,
        questionNo: block.questionNo,
        examGroup: block.sectionName,
        label: block.label,
        type,
        title,
        options,
        answer,
        answerKey,
        explanation,
        categoryTexts: [block.label ?? '', block.sectionName],
      });
    })
    .filter(isUsableQuestion);
}

function splitPlainTextQuestionBlocks(text: string, examGroup: string): DocxQuestionBlock[] {
  const blocks: DocxQuestionBlock[] = [];
  let current: DocxQuestionBlock | null = null;

  normalizeDocxLines(text).forEach((line) => {
    const questionLine = parseDocxQuestionLine(line);
    if (questionLine) {
      current = {
        questionNo: questionLine.questionNo,
        label: questionLine.label,
        title: questionLine.title,
        sectionName: examGroup,
        lines: [],
      };
      blocks.push(current);
      return;
    }

    current?.lines.push(line);
  });

  return blocks;
}

function inferPlainTextQuestionType(title: string, optionCount: number, answer: string): QuestionType {
  const compactTitle = title.replace(/\s+/g, '');
  const choiceAnswerLength = answer.replace(/[^A-Da-d]/g, '').length;
  const judgeAnswerCount = splitJudgeAnswerTokens(answer).length;

  if (compactTitle.includes('多选')) return '多选';
  if (compactTitle.includes('单选')) return '单选';
  if (compactTitle.includes('判断') && judgeAnswerCount <= 1) return '判断';
  if (compactTitle.includes('问答题') || compactTitle.includes('简答')) return '简答';

  if (optionCount > 0) {
    return choiceAnswerLength > 1 ? '多选' : '单选';
  }

  if (judgeAnswerCount === 1) return '判断';
  if (hasBlankPlaceholder(title)) return '填空';

  return answer.length > 18 ? '简答' : '填空';
}

function getPlainTextQuestionTitle(block: DocxQuestionBlock, bodyLines: string[]) {
  return stripQuestionPrefix([block.title, ...bodyLines].join(' ').replace(/\s+/g, ' ').trim());
}

function parseSubQuestionLine(line: string) {
  const subQuestion = line.match(/^[（(]?([0-9一二三四五六七八九十]+)[）).、]\s*(.+)$/);
  if (!subQuestion) {
    return undefined;
  }

  return {
    questionNo: subQuestion[1],
    title: subQuestion[2].replace(/[（(]\s*[）)]\s*$/, '').trim(),
  };
}

function createPlainTextJudgementQuestions({
  block,
  fields,
  idPrefix,
  nextIndex,
}: {
  block: DocxQuestionBlock;
  fields: ParsedQuestionFields;
  idPrefix: string;
  nextIndex: () => number;
}) {
  if (!block.title.includes('判断')) {
    return [];
  }

  const answerTokens = splitJudgeAnswerTokens(fields.answer);
  const subQuestions = fields.bodyLines.map(parseSubQuestionLine).filter(Boolean) as Array<{
    questionNo: string;
    title: string;
  }>;

  if (subQuestions.length === 0 || answerTokens.length < subQuestions.length) {
    return [];
  }

  return subQuestions.map((subQuestion, index) =>
    createImportedQuestion({
      id: `${idPrefix}_${nextIndex()}`,
      questionNo: `${block.questionNo}-${subQuestion.questionNo}`,
      examGroup: block.sectionName,
      label: block.label,
      type: '判断',
      title: subQuestion.title,
      options: {},
      answer: answerTokens[index],
      answerKey: '',
      explanation: fields.explanation,
      categoryTexts: [block.label ?? '', block.sectionName],
    })
  );
}

export function parsePlainTextQuestions(
  text: string,
  {
    idPrefix = `txt_${Date.now()}`,
    examGroup = QUESTION_EXAM_GROUPS[0],
  }: {
    idPrefix?: string;
    examGroup?: string;
  } = {}
): Question[] {
  let questionIndex = 0;
  const nextIndex = () => {
    questionIndex += 1;
    return questionIndex;
  };

  return splitPlainTextQuestionBlocks(text, examGroup)
    .flatMap((block) => {
      const fields = parseQuestionBlockFields(block.lines);
      const judgementQuestions = createPlainTextJudgementQuestions({
        block,
        fields,
        idPrefix,
        nextIndex,
      });

      if (judgementQuestions.length > 0) {
        return judgementQuestions;
      }

      const title = getPlainTextQuestionTitle(block, fields.bodyLines);
      const type = inferPlainTextQuestionType(title, Object.keys(fields.options).length, fields.answer);

      return createImportedQuestion({
        id: `${idPrefix}_${nextIndex()}`,
        questionNo: block.questionNo,
        examGroup: block.sectionName,
        label: block.label,
        type,
        title,
        options: fields.options,
        answer: fields.answer,
        answerKey: fields.answerKey,
        explanation: fields.explanation,
        categoryTexts: [block.label ?? '', block.sectionName],
      });
    })
    .filter(isUsableQuestion);
}

function getFileBaseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '');
}

function getUniqueCategoryIds(questions: Question[]) {
  return Array.from(
    new Set(questions.map((question) => question.categoryId).filter(Boolean))
  ) as string[];
}

function hasKnownDocxExamGroups(questions: Question[]) {
  return questions.some((question) => DOCX_EXAM_GROUP_ORDER.includes(question.examGroup));
}

function sortDocxExamGroups(groupA: string, groupB: string) {
  const indexA = DOCX_EXAM_GROUP_ORDER.indexOf(groupA);
  const indexB = DOCX_EXAM_GROUP_ORDER.indexOf(groupB);

  if (indexA !== -1 || indexB !== -1) {
    return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) -
      (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
  }

  return groupA.localeCompare(groupB, 'zh-CN');
}

function createImportedExamConfig(
  name: string,
  stage: string,
  questions: Question[],
  id: string,
  feishuUsage: string
): ExamConfig {
  return {
    id,
    name,
    stage,
    categoryIds: getUniqueCategoryIds(questions),
    questionRules: [],
    suggestedCount: questions.length,
    typeCombination: '综合',
    passScore: 85,
    durationMinutes: 90,
    requiresLearning: false,
    redlinePolicy: 'fail_on_any',
    knowledgePages: '飞书知识库主教材、案例库、教师版题库',
    feishuUsage,
    createdAt: Date.now(),
  };
}

export function createDocxExamConfigs(
  fileName: string,
  questions: Question[],
  idPrefix = `ec_docx_${Date.now()}`
): ExamConfig[] {
  if (questions.length === 0) {
    return [];
  }

  if (!hasKnownDocxExamGroups(questions)) {
    return [
      createImportedExamConfig(
        `${getFileBaseName(fileName)}_综合认证`,
        '考试阶段',
        questions,
        idPrefix,
        '从教师版 DOCX 题库导入生成'
      ),
    ];
  }

  const groups = new Map<string, Question[]>();
  questions.forEach((question) => {
    groups.set(question.examGroup, [...(groups.get(question.examGroup) ?? []), question]);
  });

  return [...groups.entries()]
    .sort(([groupA], [groupB]) => sortDocxExamGroups(groupA, groupB))
    .map(([groupName, groupQuestions], index) =>
      createImportedExamConfig(
        `${groupName}认证`,
        groupName,
        groupQuestions,
        `${idPrefix}_${index + 1}`,
        '从教师版 DOCX 题库导入生成'
      )
    );
}

export function createPlainTextExamConfig(
  examGroup: string,
  questions: Question[],
  id = `ec_txt_${Date.now()}`
): ExamConfig {
  return createImportedExamConfig(
    `${examGroup}认证`,
    examGroup,
    questions,
    id,
    '从 TXT 题库导入生成'
  );
}

function createRules(typeCombination: string, suggestedCount: number, categoryIds: string[]): ExamQuestionRule[] {
  if (!typeCombination || typeCombination === '综合' || typeCombination === '所有') {
    return [] as ExamQuestionRule[];
  }

  const types = typeCombination.split('+').map((item) => normalizeQuestionType(item)).filter(Boolean);
  if (types.length === 0) {
    return [];
  }

  const countPerType = Math.max(1, Math.floor(suggestedCount / types.length));
  return types.flatMap((questionType) => {
    if (categoryIds.length === 0) {
      return [{ questionType, count: countPerType, score: defaultScore(questionType) }];
    }

    return categoryIds.map((categoryId) => ({
      categoryId,
      questionType,
      count: countPerType,
      score: defaultScore(questionType),
    }));
  });
}

export function parseQuestionRows(rows: AnyRow[], idPrefix = `q_${Date.now()}`): Question[] {
  return rows
    .map((row, index): Question => {
      const type = normalizeQuestionType(readString(row, ['题型', '类型', 'questionType', 'type']));
      const title = readString(row, ['题目', '问题', '标题', 'title']);
      const examGroup = readString(row, ['问卷分组', '分组', '考试分组', 'examGroup']) || '默认分组';
      const knowledgePage = readString(row, ['关联知识页', '知识页', '知识点', 'knowledgePage']);
      const categoryId =
        parseCategoryIds(readString(row, ['知识分类', '分类', 'category', 'categoryId']))[0] ??
        inferCategoryId(examGroup, knowledgePage, title);
      const gradingMode: GradingMode = MANUAL_TYPES.has(type) ? 'manual' : 'auto';

      return {
        id: readString(row, ['ID', 'id']) || `${idPrefix}_${index}`,
        questionNo: readString(row, ['题号', '编号', 'questionNo']) || `${index + 1}`,
        examGroup,
        categoryId,
        type,
        title,
        optionA: readString(row, ['选项A', 'A', 'optionA']) || undefined,
        optionB: readString(row, ['选项B', 'B', 'optionB']) || undefined,
        optionC: readString(row, ['选项C', 'C', 'optionC']) || undefined,
        optionD: readString(row, ['选项D', 'D', 'optionD']) || undefined,
        correctAnswer: readString(row, ['正确答案', '答案', 'correctAnswer', 'answer']),
        answerKey: readString(row, ['答案要点', 'answerKey']) || undefined,
        explanation: readString(row, ['解析', 'explanation']) || undefined,
        rubric: readString(row, ['评分标准', 'rubric']) || undefined,
        knowledgePage: knowledgePage || undefined,
        difficulty: readString(row, ['难度', 'difficulty']) || undefined,
        score: readNumber(row, ['分值', 'score'], defaultScore(type)),
        gradingMode,
        isRedline: readBoolean(row, ['是否红线题', '红线题', 'isRedline']),
      };
    })
    .filter((question) => question.title && (question.correctAnswer || question.answerKey || question.gradingMode === 'manual'));
}

export function parseConfigRows(rows: AnyRow[], idPrefix = `ec_${Date.now()}`): ExamConfig[] {
  return rows
    .map((row, index): ExamConfig => {
      const name = readString(row, ['问卷名称', '考试名称', 'name']) || '未命名问卷';
      const suggestedCount = readNumber(row, ['题数建议', '题数', 'suggestedCount'], 20) ?? 20;
      const typeCombination = readString(row, ['题型组合', 'typeCombination']);
      const categoryIds = parseCategoryIds(readString(row, ['知识分类', '关联分类', '分类', 'categoryIds']));
      const passScore = readNumber(row, ['通过标准', '通过分', 'passScore'], 80) ?? 80;
      const durationMinutes =
        readNumber(row, ['考试时长', '时长', '限时分钟', 'durationMinutes'], 90) ?? 90;

      return {
        id: readString(row, ['ID', 'id']) || `${idPrefix}_${index}`,
        name,
        stage: readString(row, ['适用阶段', '阶段', 'stage']) || '考试阶段',
        categoryIds,
        questionRules: createRules(typeCombination, suggestedCount, categoryIds),
        suggestedCount,
        typeCombination: typeCombination || '综合',
        passScore,
        durationMinutes,
        requiresLearning: readBoolean(row, ['是否要求学习', 'requiresLearning'], false),
        redlinePolicy: readString(row, ['红线规则', 'redlinePolicy']) === 'score_only' ? 'score_only' : 'fail_on_any',
        knowledgePages: readString(row, ['关联知识页', 'knowledgePages']) || undefined,
        feishuUsage: readString(row, ['飞书使用方式', 'feishuUsage']) || undefined,
        createdAt: Date.now(),
      };
    })
    .filter((config) => config.name);
}
