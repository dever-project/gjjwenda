import type {
  AppData,
  DynamicApp,
  ExamAttempt,
  ExamConfig,
  KnowledgeArticle,
  KnowledgeCategory,
  PublishedExam,
  Question,
  SyncRun,
  TrainingProgress,
  User,
} from '@/lib/appTypes';
import { DEFAULT_KNOWLEDGE_CATEGORIES, DEFAULT_USERS } from '@/lib/appTypes';
import { getDatabase } from '@/lib/server/sqlite';

type Row = Record<string, unknown>;
interface UpsertUserOptions {
  preserveExistingRole?: boolean;
}

function columnExists(tableName: string, columnName: string) {
  const rows = getDatabase().prepare(`PRAGMA table_info(${tableName})`).all() as Row[];
  return rows.some((row) => row.name === columnName);
}

function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  if (!columnExists(tableName, columnName)) {
    getDatabase().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

export function ensureAppStateSchema() {
  const db = getDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      question_no TEXT NOT NULL,
      exam_group TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      option_a TEXT,
      option_b TEXT,
      option_c TEXT,
      option_d TEXT,
      correct_answer TEXT NOT NULL,
      explanation TEXT,
      knowledge_page TEXT,
      difficulty TEXT,
      is_redline INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS exam_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT,
      suggested_count INTEGER NOT NULL,
      type_combination TEXT,
      pass_score INTEGER NOT NULL,
      knowledge_pages TEXT,
      feishu_usage TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS published_exams (
      id TEXT PRIMARY KEY,
      exam_config_id TEXT NOT NULL,
      name TEXT NOT NULL,
      stage TEXT,
      pass_score INTEGER NOT NULL,
      question_ids TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      published_exam_id TEXT NOT NULL,
      status TEXT NOT NULL,
      answers TEXT NOT NULL,
      score INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      need_retake INTEGER NOT NULL DEFAULT 0,
      redline_wrong_count INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      submitted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS dynamic_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      source_url TEXT,
      schema_preview TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      sort_order INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      article_id TEXT,
      completed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      source_name TEXT,
      status TEXT NOT NULL,
      message TEXT,
      questions_imported INTEGER NOT NULL DEFAULT 0,
      configs_imported INTEGER NOT NULL DEFAULT 0,
      articles_imported INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
  `);

  addColumnIfMissing('questions', 'category_id', 'TEXT');
  addColumnIfMissing('questions', 'score', 'REAL');
  addColumnIfMissing('questions', 'grading_mode', 'TEXT');
  addColumnIfMissing('questions', 'answer_key', 'TEXT');
  addColumnIfMissing('questions', 'rubric', 'TEXT');
  addColumnIfMissing('exam_configs', 'category_ids', 'TEXT');
  addColumnIfMissing('exam_configs', 'question_rules', 'TEXT');
  addColumnIfMissing('exam_configs', 'duration_minutes', 'INTEGER');
  addColumnIfMissing('exam_configs', 'requires_learning', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('exam_configs', 'redline_policy', 'TEXT');
  addColumnIfMissing('published_exams', 'category_ids', 'TEXT');
  addColumnIfMissing('published_exams', 'question_rules', 'TEXT');
  addColumnIfMissing('published_exams', 'total_score', 'REAL');
  addColumnIfMissing('published_exams', 'duration_minutes', 'INTEGER');
  addColumnIfMissing('published_exams', 'requires_learning', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('published_exams', 'redline_policy', 'TEXT');
  addColumnIfMissing('exam_attempts', 'objective_score', 'REAL');
  addColumnIfMissing('exam_attempts', 'subjective_score', 'REAL');
  addColumnIfMissing('exam_attempts', 'grading_status', 'TEXT');
  addColumnIfMissing('exam_attempts', 'current_question_index', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('exam_attempts', 'reviewer_id', 'TEXT');
  addColumnIfMissing('exam_attempts', 'reviewed_at', 'INTEGER');
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return numberValue(value);
}

function booleanValue(value: unknown, fallback = false) {
  if (value === null || value === undefined) {
    return fallback;
  }

  return Boolean(value);
}

function seedDefaultUsers() {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS total FROM users').get() as Row | undefined;

  if (numberValue(row?.total) > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, name, role, password, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  DEFAULT_USERS.forEach((user, index) => {
    insertUser.run(user.id, user.username, user.name, user.role, user.password ?? null, now + index);
  });
}

function seedDefaultKnowledgeCategories() {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS total FROM knowledge_categories').get() as Row | undefined;

  if (numberValue(row?.total) > 0) {
    return;
  }

  const insertCategory = db.prepare(`
    INSERT INTO knowledge_categories (id, name, description, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  DEFAULT_KNOWLEDGE_CATEGORIES.forEach((category) => {
    insertCategory.run(
      category.id,
      category.name,
      category.description ?? null,
      category.sortOrder
    );
  });
}

function selectUsers(): User[] {
  const rows = getDatabase().prepare(`
    SELECT id, username, name, role, password
    FROM users
    ORDER BY created_at ASC, id ASC
  `).all() as Row[];

  return rows.map(rowToUser);
}

function rowToUser(row: Row): User {
  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    role: row.role === 'admin' ? 'admin' : 'student',
    password: optionalString(row.password),
  };
}

function selectUserById(userId: string) {
  const row = getDatabase().prepare(`
    SELECT id, username, name, role, password
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(userId) as Row | undefined;

  return row ? rowToUser(row) : undefined;
}

function selectQuestions(): Question[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM questions
    ORDER BY question_no ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    questionNo: String(row.question_no),
    examGroup: String(row.exam_group),
    categoryId: optionalString(row.category_id),
    type: String(row.type),
    title: String(row.title),
    optionA: optionalString(row.option_a),
    optionB: optionalString(row.option_b),
    optionC: optionalString(row.option_c),
    optionD: optionalString(row.option_d),
    correctAnswer: String(row.correct_answer ?? ''),
    answerKey: optionalString(row.answer_key),
    explanation: optionalString(row.explanation),
    rubric: optionalString(row.rubric),
    knowledgePage: optionalString(row.knowledge_page),
    difficulty: optionalString(row.difficulty),
    score: optionalNumber(row.score),
    gradingMode: row.grading_mode === 'manual' ? 'manual' : optionalString(row.grading_mode) === 'auto' ? 'auto' : undefined,
    isRedline: Boolean(row.is_redline),
  }));
}

function selectExamConfigs(): ExamConfig[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM exam_configs
    ORDER BY created_at ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    stage: optionalString(row.stage),
    categoryIds: parseJson<string[]>(row.category_ids, []),
    questionRules: parseJson(row.question_rules, []),
    suggestedCount: numberValue(row.suggested_count, 20),
    typeCombination: optionalString(row.type_combination),
    passScore: numberValue(row.pass_score, 80),
    durationMinutes: optionalNumber(row.duration_minutes),
    requiresLearning: booleanValue(row.requires_learning, false),
    redlinePolicy: row.redline_policy === 'score_only' ? 'score_only' : 'fail_on_any',
    knowledgePages: optionalString(row.knowledge_pages),
    feishuUsage: optionalString(row.feishu_usage),
    createdAt: numberValue(row.created_at, Date.now()),
  }));
}

function selectPublishedExams(): PublishedExam[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM published_exams
    ORDER BY created_at ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    examConfigId: String(row.exam_config_id),
    name: String(row.name),
    stage: optionalString(row.stage),
    categoryIds: parseJson<string[]>(row.category_ids, []),
    questionRules: parseJson(row.question_rules, []),
    passScore: numberValue(row.pass_score, 80),
    questionIds: parseJson<string[]>(row.question_ids, []),
    totalScore: optionalNumber(row.total_score),
    durationMinutes: optionalNumber(row.duration_minutes),
    requiresLearning: booleanValue(row.requires_learning, false),
    redlinePolicy: row.redline_policy === 'score_only' ? 'score_only' : 'fail_on_any',
    status: row.status === 'inactive' ? 'inactive' : 'active',
    createdAt: numberValue(row.created_at, Date.now()),
  }));
}

function selectExamAttempts(): ExamAttempt[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM exam_attempts
    ORDER BY started_at ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    publishedExamId: String(row.published_exam_id),
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    answers: parseJson(row.answers, {}),
    currentQuestionIndex: numberValue(row.current_question_index, 0),
    score: numberValue(row.score),
    objectiveScore: optionalNumber(row.objective_score),
    subjectiveScore: optionalNumber(row.subjective_score),
    gradingStatus:
      row.grading_status === 'pending'
        ? 'pending'
        : row.grading_status === 'completed'
          ? 'completed'
          : 'not_required',
    passed: Boolean(row.passed),
    needRetake: Boolean(row.need_retake),
    redlineWrongCount: numberValue(row.redline_wrong_count),
    startedAt: numberValue(row.started_at, Date.now()),
    submittedAt: optionalNumber(row.submitted_at),
    reviewerId: optionalString(row.reviewer_id),
    reviewedAt: optionalNumber(row.reviewed_at),
  }));
}

function selectDynamicApps(): DynamicApp[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM dynamic_apps
    ORDER BY created_at ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    sourceUrl: optionalString(row.source_url),
    schemaPreview: parseJson(row.schema_preview, null),
    createdAt: numberValue(row.created_at, Date.now()),
  }));
}

function selectKnowledgeCategories(): KnowledgeCategory[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM knowledge_categories
    ORDER BY sort_order ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    description: optionalString(row.description),
    sortOrder: numberValue(row.sort_order),
  }));
}

function selectKnowledgeArticles(): KnowledgeArticle[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM knowledge_articles
    ORDER BY sort_order ASC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    categoryId: String(row.category_id),
    title: String(row.title),
    content: String(row.content),
    sourceType: row.source_type === 'case' ? 'case' : 'knowledge',
    sourceUrl: optionalString(row.source_url),
    sortOrder: numberValue(row.sort_order),
    updatedAt: numberValue(row.updated_at, Date.now()),
  }));
}

function selectTrainingProgress(): TrainingProgress[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM training_progress
    ORDER BY completed_at DESC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    categoryId: String(row.category_id),
    articleId: optionalString(row.article_id),
    completedAt: numberValue(row.completed_at, Date.now()),
  }));
}

function selectSyncRuns(): SyncRun[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM sync_runs
    ORDER BY started_at DESC, id ASC
    LIMIT 50
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    sourceId: optionalString(row.source_id),
    sourceName: optionalString(row.source_name),
    status: row.status === 'failed' ? 'failed' : row.status === 'running' ? 'running' : 'success',
    message: optionalString(row.message),
    questionsImported: numberValue(row.questions_imported),
    configsImported: numberValue(row.configs_imported),
    articlesImported: numberValue(row.articles_imported),
    startedAt: numberValue(row.started_at, Date.now()),
    finishedAt: optionalNumber(row.finished_at),
  }));
}

export function readAppState(): AppData {
  ensureAppStateSchema();
  seedDefaultUsers();
  seedDefaultKnowledgeCategories();

  return {
    users: selectUsers(),
    questions: selectQuestions(),
    examConfigs: selectExamConfigs(),
    publishedExams: selectPublishedExams(),
    examAttempts: selectExamAttempts(),
    dynamicApps: selectDynamicApps(),
    knowledgeCategories: selectKnowledgeCategories(),
    knowledgeArticles: selectKnowledgeArticles(),
    trainingProgress: selectTrainingProgress(),
    syncRuns: selectSyncRuns(),
  };
}

export function upsertUser(user: User, options: UpsertUserOptions = {}): User {
  ensureAppStateSchema();

  const now = Date.now();
  const roleUpdate = options.preserveExistingRole ? 'role = users.role' : 'role = excluded.role';
  getDatabase().prepare(`
    INSERT INTO users (id, username, name, role, password, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      name = excluded.name,
      ${roleUpdate},
      password = COALESCE(excluded.password, users.password)
  `).run(
    user.id,
    user.username,
    user.name,
    user.role,
    user.password ?? null,
    now
  );

  return selectUserById(user.id) ?? user;
}

export function replaceExamAttempt(attempt: ExamAttempt): ExamAttempt {
  ensureAppStateSchema();

  getDatabase().prepare(`
    INSERT OR REPLACE INTO exam_attempts (
      id, user_id, published_exam_id, status, answers, score, objective_score, subjective_score,
      grading_status, current_question_index, passed, need_retake, redline_wrong_count, started_at, submitted_at,
      reviewer_id, reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    attempt.id,
    attempt.userId,
    attempt.publishedExamId,
    attempt.status,
    stringifyJson(attempt.answers),
    attempt.score,
    attempt.objectiveScore ?? null,
    attempt.subjectiveScore ?? null,
    attempt.gradingStatus ?? 'not_required',
    attempt.currentQuestionIndex ?? 0,
    attempt.passed ? 1 : 0,
    attempt.needRetake ? 1 : 0,
    attempt.redlineWrongCount,
    attempt.startedAt,
    attempt.submittedAt ?? null,
    attempt.reviewerId ?? null,
    attempt.reviewedAt ?? null
  );

  return attempt;
}

export function replaceAppState(data: AppData): AppData {
  ensureAppStateSchema();

  const db = getDatabase();
  const users = data.users.length > 0 ? data.users : DEFAULT_USERS;
  const categories =
    data.knowledgeCategories.length > 0 ? data.knowledgeCategories : DEFAULT_KNOWLEDGE_CATEGORIES;

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, name, role, password, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertQuestion = db.prepare(`
    INSERT INTO questions (
      id, question_no, exam_group, category_id, type, title, option_a, option_b, option_c,
      option_d, correct_answer, answer_key, explanation, rubric, knowledge_page, difficulty,
      score, grading_mode, is_redline
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertExamConfig = db.prepare(`
    INSERT INTO exam_configs (
      id, name, stage, category_ids, question_rules, suggested_count, type_combination,
      pass_score, duration_minutes, requires_learning, redline_policy, knowledge_pages, feishu_usage, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPublishedExam = db.prepare(`
    INSERT INTO published_exams (
      id, exam_config_id, name, stage, category_ids, question_rules, pass_score, question_ids,
      total_score, duration_minutes, requires_learning, redline_policy, status, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertExamAttempt = db.prepare(`
    INSERT INTO exam_attempts (
      id, user_id, published_exam_id, status, answers, score, objective_score, subjective_score,
      grading_status, current_question_index, passed, need_retake, redline_wrong_count, started_at, submitted_at,
      reviewer_id, reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDynamicApp = db.prepare(`
    INSERT INTO dynamic_apps (id, name, description, source_url, schema_preview, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCategory = db.prepare(`
    INSERT INTO knowledge_categories (id, name, description, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const insertArticle = db.prepare(`
    INSERT INTO knowledge_articles (
      id, category_id, title, content, source_type, source_url, sort_order, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProgress = db.prepare(`
    INSERT INTO training_progress (id, user_id, category_id, article_id, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSyncRun = db.prepare(`
    INSERT INTO sync_runs (
      id, source_id, source_name, status, message, questions_imported, configs_imported,
      articles_imported, started_at, finished_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN IMMEDIATE;');
  try {
    db.exec(`
      DELETE FROM exam_attempts;
      DELETE FROM published_exams;
      DELETE FROM exam_configs;
      DELETE FROM questions;
      DELETE FROM dynamic_apps;
      DELETE FROM knowledge_articles;
      DELETE FROM training_progress;
      DELETE FROM sync_runs;
      DELETE FROM knowledge_categories;
      DELETE FROM users;
    `);

    const now = Date.now();
    users.forEach((user, index) => {
      insertUser.run(
        user.id,
        user.username,
        user.name,
        user.role,
        user.password ?? null,
        now + index
      );
    });

    categories.forEach((category) => {
      insertCategory.run(
        category.id,
        category.name,
        category.description ?? null,
        category.sortOrder
      );
    });

    data.questions.forEach((question) => {
      insertQuestion.run(
        question.id,
        question.questionNo,
        question.examGroup,
        question.categoryId ?? null,
        question.type,
        question.title,
        question.optionA ?? null,
        question.optionB ?? null,
        question.optionC ?? null,
        question.optionD ?? null,
        question.correctAnswer,
        question.answerKey ?? null,
        question.explanation ?? null,
        question.rubric ?? null,
        question.knowledgePage ?? null,
        question.difficulty ?? null,
        question.score ?? null,
        question.gradingMode ?? null,
        question.isRedline ? 1 : 0
      );
    });

    data.examConfigs.forEach((config) => {
      insertExamConfig.run(
        config.id,
        config.name,
        config.stage ?? null,
        stringifyJson(config.categoryIds ?? []),
        stringifyJson(config.questionRules ?? []),
        config.suggestedCount,
        config.typeCombination ?? null,
        config.passScore,
        config.durationMinutes ?? null,
        config.requiresLearning ? 1 : 0,
        config.redlinePolicy ?? 'fail_on_any',
        config.knowledgePages ?? null,
        config.feishuUsage ?? null,
        config.createdAt
      );
    });

    data.publishedExams.forEach((exam) => {
      insertPublishedExam.run(
        exam.id,
        exam.examConfigId,
        exam.name,
        exam.stage ?? null,
        stringifyJson(exam.categoryIds ?? []),
        stringifyJson(exam.questionRules ?? []),
        exam.passScore,
        stringifyJson(exam.questionIds),
        exam.totalScore ?? null,
        exam.durationMinutes ?? null,
        exam.requiresLearning ? 1 : 0,
        exam.redlinePolicy ?? 'fail_on_any',
        exam.status,
        exam.createdAt
      );
    });

    data.examAttempts.forEach((attempt) => {
      insertExamAttempt.run(
        attempt.id,
        attempt.userId,
        attempt.publishedExamId,
        attempt.status,
        stringifyJson(attempt.answers),
        attempt.score,
        attempt.objectiveScore ?? null,
        attempt.subjectiveScore ?? null,
        attempt.gradingStatus ?? 'not_required',
        attempt.currentQuestionIndex ?? 0,
        attempt.passed ? 1 : 0,
        attempt.needRetake ? 1 : 0,
        attempt.redlineWrongCount,
        attempt.startedAt,
        attempt.submittedAt ?? null,
        attempt.reviewerId ?? null,
        attempt.reviewedAt ?? null
      );
    });

    data.dynamicApps.forEach((app) => {
      insertDynamicApp.run(
        app.id,
        app.name,
        app.description,
        app.sourceUrl ?? null,
        stringifyJson(app.schemaPreview ?? null),
        app.createdAt
      );
    });

    data.knowledgeArticles.forEach((article) => {
      insertArticle.run(
        article.id,
        article.categoryId,
        article.title,
        article.content,
        article.sourceType,
        article.sourceUrl ?? null,
        article.sortOrder,
        article.updatedAt
      );
    });

    data.trainingProgress.forEach((progress) => {
      insertProgress.run(
        progress.id,
        progress.userId,
        progress.categoryId,
        progress.articleId ?? null,
        progress.completedAt
      );
    });

    data.syncRuns.forEach((syncRun) => {
      insertSyncRun.run(
        syncRun.id,
        syncRun.sourceId ?? null,
        syncRun.sourceName ?? null,
        syncRun.status,
        syncRun.message ?? null,
        syncRun.questionsImported,
        syncRun.configsImported,
        syncRun.articlesImported,
        syncRun.startedAt,
        syncRun.finishedAt ?? null
      );
    });

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  return readAppState();
}
