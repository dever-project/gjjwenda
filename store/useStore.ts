import { create } from 'zustand';
import type {
  AiTrainingScenario,
  AiTrainingSession,
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
import { DEFAULT_USERS, createEmptyAppData } from '@/lib/appTypes';
import { fetchAppState, saveAppState, saveExamAttempt } from '@/lib/appStateClient';

export type {
  AiTrainingDifficulty,
  AiTrainingDimensionScore,
  AiTrainingDocument,
  AiTrainingMessage,
  AiTrainingMessageRole,
  AiTrainingRedlineHit,
  AiTrainingRedlineRule,
  AiTrainingRedlineSeverity,
  AiTrainingReport,
  AiTrainingRubricItem,
  AiTrainingScenario,
  AiTrainingScenarioStatus,
  AiTrainingSession,
  AiTrainingSessionStatus,
  AnswerRecord,
  AppData,
  Difficulty,
  DynamicApp,
  DynamicAppDefinition,
  DynamicAppField,
  DynamicAppMetric,
  DynamicAppTable,
  DynamicAppView,
  DynamicFieldType,
  ExamAttempt,
  ExamConfig,
  ExamQuestionRule,
  FeishuSource,
  GradingMode,
  KnowledgeArticle,
  KnowledgeCategory,
  PublishedExam,
  Question,
  QuestionType,
  RedlinePolicy,
  SyncRun,
  TrainingProgress,
  User,
} from '@/lib/appTypes';

const CURRENT_USER_ID_KEY = 'training-exam-current-user-id';
const LEGACY_STORE_KEY = 'training-exam-store';

interface AppState extends AppData {
  currentUser: User | null;
  isDataLoaded: boolean;
  isDataLoading: boolean;
  isSaving: boolean;
  dataError: string | null;

  loadData: () => Promise<void>;
  refreshData: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
  setUsers: (users: User[]) => Promise<void>;
  addUser: (user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  setQuestions: (questions: Question[]) => Promise<void>;
  addQuestion: (question: Question) => Promise<void>;
  updateQuestion: (question: Question) => Promise<void>;
  deleteQuestion: (id: string) => Promise<void>;
  clearQuestionBank: () => Promise<void>;
  setExamConfigs: (configs: ExamConfig[]) => Promise<void>;
  deleteExamConfig: (configId: string) => Promise<void>;
  importQuestionData: (questions: Question[], configs: ExamConfig[]) => Promise<void>;
  publishExam: (exam: PublishedExam) => Promise<void>;
  startAttempt: (attempt: ExamAttempt) => Promise<void>;
  updateAttempt: (attempt: ExamAttempt) => Promise<void>;
  completeAttempt: (attempt: ExamAttempt) => Promise<void>;
  markTrainingProgress: (progress: TrainingProgress) => Promise<void>;
  setKnowledgeData: (categories: KnowledgeCategory[], articles: KnowledgeArticle[]) => Promise<void>;
  setSyncRuns: (syncRuns: SyncRun[]) => Promise<void>;
  addDynamicApp: (app: DynamicApp) => Promise<void>;
  deleteDynamicApp: (id: string) => Promise<void>;
  upsertAiTrainingScenario: (scenario: AiTrainingScenario) => Promise<void>;
  deleteAiTrainingScenario: (id: string) => Promise<void>;
  upsertAiTrainingSession: (session: AiTrainingSession) => Promise<void>;
}

type StateUpdater = Partial<AppState> | ((state: AppState) => Partial<AppState>);

let saveQueue: Promise<void> = Promise.resolve();
let pendingSaveCount = 0;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '数据同步失败';
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function rememberCurrentUser(user: User | null) {
  if (!canUseLocalStorage()) {
    return;
  }

  if (user) {
    window.localStorage.setItem(CURRENT_USER_ID_KEY, user.id);
  } else {
    window.localStorage.removeItem(CURRENT_USER_ID_KEY);
  }
}

function readLegacyStoreState() {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(LEGACY_STORE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as { state?: Partial<AppData> & { currentUser?: User | null } };
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

function restoreCurrentUser(users: User[]) {
  if (!canUseLocalStorage()) {
    return null;
  }

  const currentUserId = window.localStorage.getItem(CURRENT_USER_ID_KEY);
  const legacyCurrentUserId = readLegacyStoreState()?.currentUser?.id;
  const matchedUser = users.find((user) => user.id === (currentUserId || legacyCurrentUserId)) ?? null;

  if (matchedUser) {
    rememberCurrentUser(matchedUser);
  }

  return matchedUser;
}

function toAppData(state: AppState): AppData {
  return {
    users: state.users,
    questions: state.questions,
    examConfigs: state.examConfigs,
    publishedExams: state.publishedExams,
    examAttempts: state.examAttempts,
    dynamicApps: state.dynamicApps,
    knowledgeCategories: state.knowledgeCategories,
    knowledgeArticles: state.knowledgeArticles,
    trainingProgress: state.trainingProgress,
    syncRuns: state.syncRuns,
    aiTrainingScenarios: state.aiTrainingScenarios,
    aiTrainingSessions: state.aiTrainingSessions,
  };
}

function hasUserChanges(users: User[]) {
  if (users.length !== DEFAULT_USERS.length) {
    return true;
  }

  return users.some((user) => {
    const defaultUser = DEFAULT_USERS.find((item) => item.id === user.id);
    return (
      !defaultUser ||
      user.username !== defaultUser.username ||
      user.name !== defaultUser.name ||
      user.role !== defaultUser.role ||
      (user.password ?? defaultUser.password) !== defaultUser.password
    );
  });
}

function hasImportedData(data: AppData) {
  return (
    hasUserChanges(data.users) ||
    data.questions.length > 0 ||
    data.examConfigs.length > 0 ||
    data.publishedExams.length > 0 ||
    data.examAttempts.length > 0 ||
    data.dynamicApps.length > 0
    || data.knowledgeArticles.length > 0
    || data.trainingProgress.length > 0
    || data.syncRuns.length > 0
    || data.aiTrainingScenarios.length > 0
    || data.aiTrainingSessions.length > 0
  );
}

function listOrFallback<T>(value: unknown, fallback: T[]) {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function migrateLegacyDataIfNeeded(sqliteData: AppData) {
  const legacyState = readLegacyStoreState();
  if (!legacyState || hasImportedData(sqliteData)) {
    return { data: sqliteData, migrated: false };
  }

  const data: AppData = {
    users: listOrFallback<User>(legacyState.users, sqliteData.users),
    questions: listOrFallback<Question>(legacyState.questions, sqliteData.questions),
    examConfigs: listOrFallback<ExamConfig>(legacyState.examConfigs, sqliteData.examConfigs),
    publishedExams: listOrFallback<PublishedExam>(
      legacyState.publishedExams,
      sqliteData.publishedExams
    ),
    examAttempts: listOrFallback<ExamAttempt>(legacyState.examAttempts, sqliteData.examAttempts),
    dynamicApps: listOrFallback<DynamicApp>(legacyState.dynamicApps, sqliteData.dynamicApps),
    knowledgeCategories: sqliteData.knowledgeCategories,
    knowledgeArticles: sqliteData.knowledgeArticles,
    trainingProgress: sqliteData.trainingProgress,
    syncRuns: sqliteData.syncRuns,
    aiTrainingScenarios: listOrFallback<AiTrainingScenario>(
      legacyState.aiTrainingScenarios,
      sqliteData.aiTrainingScenarios
    ),
    aiTrainingSessions: listOrFallback<AiTrainingSession>(
      legacyState.aiTrainingSessions,
      sqliteData.aiTrainingSessions
    ),
  };

  return { data, migrated: hasImportedData(data) };
}

export const useStore = create<AppState>()((set, get) => {
  const initialData = createEmptyAppData();

  const enqueueSave = (operation: () => Promise<void>) => {
    pendingSaveCount += 1;
    set({ isSaving: true, dataError: null });

    saveQueue = saveQueue
      .catch(() => undefined)
      .then(operation);

    saveQueue
      .then(() => {
        pendingSaveCount = Math.max(0, pendingSaveCount - 1);
        if (pendingSaveCount === 0) {
          set({ isSaving: false });
        }
      })
      .catch((error) => {
        pendingSaveCount = Math.max(0, pendingSaveCount - 1);
        set({
          isSaving: pendingSaveCount > 0,
          dataError: getErrorMessage(error),
        });
        console.error('保存 SQLite 数据失败', error);
      });

    return saveQueue;
  };

  const persistCurrentState = () => {
    const snapshot = toAppData(get());
    return enqueueSave(() => saveAppState(snapshot));
  };

  const persistExamAttempt = (attempt: ExamAttempt) => {
    return enqueueSave(() => saveExamAttempt(attempt));
  };

  const updateAndPersist = (updater: StateUpdater) => {
    set(updater);
    return persistCurrentState();
  };

  return {
    ...initialData,
    currentUser: null,
    isDataLoaded: false,
    isDataLoading: false,
    isSaving: false,
    dataError: null,

    refreshData: async () => {
      if (get().isDataLoading) {
        return;
      }

      set({ isDataLoading: true, dataError: null });

      try {
        const sqliteData = await fetchAppState();
        const { data, migrated } = migrateLegacyDataIfNeeded(sqliteData);
        set({
          ...data,
          currentUser: restoreCurrentUser(data.users),
          isDataLoaded: true,
          isDataLoading: false,
          dataError: null,
        });

        if (migrated) {
          persistCurrentState();
        }
      } catch (error) {
        set({
          isDataLoaded: true,
          isDataLoading: false,
          dataError: getErrorMessage(error),
        });
        console.error('加载 SQLite 数据失败', error);
      }
    },

    loadData: async () => {
      if (get().isDataLoaded) {
        return;
      }

      await get().refreshData();
    },

    setCurrentUser: (user) => {
      rememberCurrentUser(user);
      set({ currentUser: user });
    },
    setUsers: (users) => updateAndPersist({ users }),
    addUser: (user) =>
      updateAndPersist((state) => ({
        users: [...state.users, user],
      })),
    updateUser: (updated) =>
      updateAndPersist((state) => ({
        users: state.users.map((user) => (user.id === updated.id ? updated : user)),
        currentUser: state.currentUser?.id === updated.id ? updated : state.currentUser,
      })),
    setQuestions: (questions) => updateAndPersist({ questions }),
    addQuestion: (question) =>
      updateAndPersist((state) => ({
        questions: [...state.questions, question],
      })),
    updateQuestion: (updated) =>
      updateAndPersist((state) => ({
        questions: state.questions.map((question) =>
          question.id === updated.id ? updated : question
        ),
      })),
    deleteQuestion: (id) =>
      updateAndPersist((state) => ({
        questions: state.questions.filter((question) => question.id !== id),
      })),
    clearQuestionBank: () =>
      updateAndPersist({
        questions: [],
        examConfigs: [],
        publishedExams: [],
        examAttempts: [],
        trainingProgress: [],
      }),
    setExamConfigs: (examConfigs) => updateAndPersist({ examConfigs }),
    deleteExamConfig: (configId) =>
      updateAndPersist((state) => {
        const relatedPublishedExamIds = new Set(
          state.publishedExams
            .filter((exam) => exam.examConfigId === configId)
            .map((exam) => exam.id)
        );

        return {
          examConfigs: state.examConfigs.filter((config) => config.id !== configId),
          publishedExams: state.publishedExams.filter((exam) => exam.examConfigId !== configId),
          examAttempts: state.examAttempts.filter(
            (attempt) => !relatedPublishedExamIds.has(attempt.publishedExamId)
          ),
        };
      }),
    importQuestionData: (questions, examConfigs) =>
      updateAndPersist({ questions, examConfigs }),
    publishExam: (exam) =>
      updateAndPersist((state) => ({
        publishedExams: [
          ...state.publishedExams.map((publishedExam) =>
            publishedExam.examConfigId === exam.examConfigId && publishedExam.status === 'active'
              ? { ...publishedExam, status: 'inactive' as const }
              : publishedExam
          ),
          exam,
        ],
      })),
    startAttempt: (attempt) => {
      set((state) => ({
        examAttempts: [...state.examAttempts, attempt],
      }));
      return persistExamAttempt(attempt);
    },
    updateAttempt: (updated) => {
      set((state) => ({
        examAttempts: state.examAttempts.map((attempt) =>
          attempt.id === updated.id ? updated : attempt
        ),
      }));
      return persistExamAttempt(updated);
    },
    completeAttempt: (updated) => {
      set((state) => ({
        examAttempts: state.examAttempts.map((attempt) =>
          attempt.id === updated.id ? updated : attempt
        ),
      }));
      return persistExamAttempt(updated);
    },
    markTrainingProgress: (progress) =>
      updateAndPersist((state) => {
        const exists = state.trainingProgress.some(
          (item) =>
            item.userId === progress.userId &&
            item.categoryId === progress.categoryId &&
            (item.articleId ?? '') === (progress.articleId ?? '')
        );

        return {
          trainingProgress: exists
            ? state.trainingProgress.map((item) =>
                item.userId === progress.userId &&
                item.categoryId === progress.categoryId &&
                (item.articleId ?? '') === (progress.articleId ?? '')
                  ? progress
                  : item
              )
            : [...state.trainingProgress, progress],
        };
      }),
    setKnowledgeData: (knowledgeCategories, knowledgeArticles) =>
      updateAndPersist({ knowledgeCategories, knowledgeArticles }),
    setSyncRuns: (syncRuns) => updateAndPersist({ syncRuns }),
    addDynamicApp: (app) =>
      updateAndPersist((state) => ({
        dynamicApps: [...state.dynamicApps, app],
      })),
    deleteDynamicApp: (id) =>
      updateAndPersist((state) => ({
        dynamicApps: state.dynamicApps.filter((app) => app.id !== id),
      })),
    upsertAiTrainingScenario: (scenario) =>
      updateAndPersist((state) => {
        const exists = state.aiTrainingScenarios.some((item) => item.id === scenario.id);

        return {
          aiTrainingScenarios: exists
            ? state.aiTrainingScenarios.map((item) => (item.id === scenario.id ? scenario : item))
            : [...state.aiTrainingScenarios, scenario],
        };
      }),
    deleteAiTrainingScenario: (id) =>
      updateAndPersist((state) => ({
        aiTrainingScenarios: state.aiTrainingScenarios.filter((scenario) => scenario.id !== id),
        aiTrainingSessions: state.aiTrainingSessions.filter((session) => session.scenarioId !== id),
      })),
    upsertAiTrainingSession: (session) =>
      updateAndPersist((state) => {
        const exists = state.aiTrainingSessions.some((item) => item.id === session.id);

        return {
          aiTrainingSessions: exists
            ? state.aiTrainingSessions.map((item) => (item.id === session.id ? session : item))
            : [...state.aiTrainingSessions, session],
        };
      }),
  };
});
