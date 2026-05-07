export type QuestionType =
  | '单选'
  | '多选'
  | '判断'
  | '填空'
  | '简答'
  | '情景'
  | '论述'
  | '话术改写';
export type Difficulty = '基础' | '中等' | '高';
export type GradingMode = 'auto' | 'manual';
export type AttemptGradingStatus = 'not_required' | 'pending' | 'completed';
export type RedlinePolicy = 'fail_on_any' | 'score_only';

export interface Question {
  id: string;
  questionNo: string;
  examGroup: string;
  categoryId?: string;
  type: QuestionType | string;
  title: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctAnswer: string;
  answerKey?: string;
  explanation?: string;
  rubric?: string;
  knowledgePage?: string;
  difficulty?: Difficulty | string;
  score?: number;
  gradingMode?: GradingMode;
  isRedline: boolean;
}

export interface ExamQuestionRule {
  categoryId?: string;
  questionType?: QuestionType | string;
  count: number;
  score?: number;
}

export interface ExamConfig {
  id: string;
  name: string;
  stage?: string;
  categoryIds?: string[];
  questionRules?: ExamQuestionRule[];
  suggestedCount: number;
  typeCombination?: string;
  passScore: number;
  durationMinutes?: number;
  requiresLearning?: boolean;
  redlinePolicy?: RedlinePolicy;
  knowledgePages?: string;
  feishuUsage?: string;
  createdAt: number;
}

export interface PublishedExam {
  id: string;
  examConfigId: string;
  name: string;
  stage?: string;
  categoryIds?: string[];
  questionRules?: ExamQuestionRule[];
  passScore: number;
  questionIds: string[];
  totalScore?: number;
  durationMinutes?: number;
  requiresLearning?: boolean;
  redlinePolicy?: RedlinePolicy;
  status: 'active' | 'inactive';
  createdAt: number;
}

export interface AnswerRecord {
  questionId: string;
  userAnswer: string | string[];
  isCorrect: boolean;
  score: number;
  maxScore?: number;
  gradingMode?: GradingMode;
  reviewerScore?: number;
  reviewerComment?: string;
  isRedlineWrong: boolean;
}

export interface ExamAttempt {
  id: string;
  userId: string;
  publishedExamId: string;
  status: 'in_progress' | 'completed';
  answers: Record<string, AnswerRecord>;
  currentQuestionIndex?: number;
  score: number;
  objectiveScore?: number;
  subjectiveScore?: number;
  gradingStatus?: AttemptGradingStatus;
  passed: boolean;
  needRetake: boolean;
  redlineWrongCount: number;
  startedAt: number;
  submittedAt?: number;
  reviewerId?: string;
  reviewedAt?: number;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'student';
  password?: string;
}

export type DynamicFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiSelect'
  | 'user'
  | 'url'
  | 'attachment'
  | 'unknown';

export interface DynamicFieldOption {
  id?: string;
  name: string;
  color?: string;
}

export interface DynamicAppField {
  fieldId: string;
  key: string;
  name: string;
  title: string;
  type: DynamicFieldType;
  rawType?: string;
  visible: boolean;
  editable: boolean;
  options?: DynamicFieldOption[];
}

export interface DynamicAppSource {
  type: 'feishu_bitable';
  sourceUrl: string;
  appToken: string;
  tableId: string;
  viewId?: string;
}

export interface DynamicAppTable {
  id: string;
  name: string;
  source: DynamicAppSource;
  fields: DynamicAppField[];
  primaryFieldKey?: string;
  sampleRecordCount: number;
}

export interface DynamicAppMetric {
  id: string;
  title: string;
  type: 'count' | 'filled';
  tableId: string;
  fieldKey?: string;
}

export interface DynamicTableView {
  id: string;
  name: string;
  type: 'table';
  tableId: string;
  fieldKeys: string[];
}

export interface DynamicDashboardView {
  id: string;
  name: string;
  type: 'dashboard';
  tableId: string;
  metrics: DynamicAppMetric[];
}

export type DynamicAppView = DynamicTableView | DynamicDashboardView;

export interface DynamicAppDefinition {
  version: 1;
  name: string;
  description: string;
  sourceUrl?: string;
  generatedAt: number;
  tables: DynamicAppTable[];
  views: DynamicAppView[];
}

export interface DynamicApp {
  id: string;
  name: string;
  description: string;
  sourceUrl?: string;
  schemaPreview?: DynamicAppDefinition | Record<string, unknown> | null;
  createdAt: number;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
}

export interface KnowledgeArticle {
  id: string;
  categoryId: string;
  title: string;
  content: string;
  sourceType: 'knowledge' | 'case';
  sourceUrl?: string;
  sortOrder: number;
  updatedAt: number;
}

export interface TrainingProgress {
  id: string;
  userId: string;
  categoryId: string;
  articleId?: string;
  completedAt: number;
}

export interface FeishuSource {
  id: string;
  name: string;
  sourceType: 'knowledge_doc' | 'case_doc' | 'question_table' | 'config_table';
  resourceType: 'docx' | 'bitable' | 'sheet';
  resourceUrl: string;
  resourceToken?: string;
  tableId?: string;
  sheetId?: string;
  enabled: boolean;
  lastSyncedAt?: number;
}

export interface SyncRun {
  id: string;
  sourceId?: string;
  sourceName?: string;
  status: 'success' | 'failed' | 'running';
  message?: string;
  questionsImported: number;
  configsImported: number;
  articlesImported: number;
  startedAt: number;
  finishedAt?: number;
}

export interface AppData {
  users: User[];
  questions: Question[];
  examConfigs: ExamConfig[];
  publishedExams: PublishedExam[];
  examAttempts: ExamAttempt[];
  dynamicApps: DynamicApp[];
  knowledgeCategories: KnowledgeCategory[];
  knowledgeArticles: KnowledgeArticle[];
  trainingProgress: TrainingProgress[];
  syncRuns: SyncRun[];
}

export const DEFAULT_USERS: User[] = [
  { id: 'u1', username: 'admin', name: '管理员老师', role: 'admin', password: 'admin123' },
  { id: 'u2', username: 'user', name: '入职新人', role: 'student', password: 'user123' },
];

export const DEFAULT_KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  { id: 'cat_business', name: '业务基础', description: '业务定义、客户价值与主链路基础。', sortOrder: 10 },
  { id: 'cat_mkt', name: 'MKT客资', description: '线索来源、客资字段与首呼前信息质量。', sortOrder: 20 },
  { id: 'cat_npl', name: 'NPL诊断', description: '六问、十一维、客户画像与转化边界。', sortOrder: 30 },
  { id: 'cat_jnode', name: 'J节点司法时钟', description: 'J0-J9节点、文书核验与后段止损。', sortOrder: 40 },
  { id: 'cat_lease', name: '租赁权论证', description: '真实租赁、查封窗口、交付与证据链。', sortOrder: 50 },
  { id: 'cat_pm', name: 'PM/律师交付', description: 'PM会审、律师协作、客户维护与风险留痕。', sortOrder: 60 },
  { id: 'cat_ala', name: 'ALA租赁运营', description: '验房、挂牌、出租、首期到账与在租质量。', sortOrder: 70 },
  { id: 'cat_finance', name: '绩效财务', description: '有效腾房、服务系数、抵销和回拨。', sortOrder: 80 },
  { id: 'cat_compliance', name: '合规红线', description: '禁语、熔断、虚假租赁和越界承诺。', sortOrder: 90 },
  { id: 'cat_case', name: '案例复盘/情景', description: '案例拆解、训练官追问和情景判断。', sortOrder: 100 },
];

export function createEmptyAppData(): AppData {
  return {
    users: DEFAULT_USERS.map((user) => ({ ...user })),
    questions: [],
    examConfigs: [],
    publishedExams: [],
    examAttempts: [],
    dynamicApps: [],
    knowledgeCategories: DEFAULT_KNOWLEDGE_CATEGORIES.map((category) => ({ ...category })),
    knowledgeArticles: [],
    trainingProgress: [],
    syncRuns: [],
  };
}
