import type { AppData, FeishuSource, KnowledgeArticle, SyncRun } from '@/lib/appTypes';
import { DEFAULT_KNOWLEDGE_CATEGORIES } from '@/lib/appTypes';
import {
  extractFeishuToken,
  readFeishuBitableRows,
  readFeishuDocText,
  readFeishuSheetRows,
} from '@/lib/server/feishuClient';
import {
  insertSyncRun,
  readFeishuCredentials,
  readFeishuSettings,
  updateSourceSyncedAt,
} from '@/lib/server/feishuRepository';
import { readAppState, replaceAppState } from '@/lib/server/appStateRepository';
import { inferCategoryId, parseConfigRows, parseQuestionRows } from '@/lib/training/questionImport';

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitDocIntoArticles(text: string, source: FeishuSource) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headingPattern =
    source.sourceType === 'case_doc'
      ? /^C\d{2}[｜|]/i
      : /^(第[一二三四五六七八九十百0-9]+章|附录|[一二三四五六七八九十]+、)/;
  const sections: Array<{ title: string; lines: string[] }> = [];

  lines.forEach((line) => {
    if (headingPattern.test(line) || sections.length === 0) {
      sections.push({ title: line.slice(0, 80), lines: [line] });
      return;
    }

    sections[sections.length - 1].lines.push(line);
  });

  return sections.map<KnowledgeArticle>((section, index) => ({
    id: `${source.id}_${index}`,
    categoryId:
      source.sourceType === 'case_doc'
        ? 'cat_case'
        : inferCategoryId(section.title, section.lines.slice(0, 8).join(' ')),
    title: section.title,
    content: section.lines.join('\n\n'),
    sourceType: source.sourceType === 'case_doc' ? 'case' : 'knowledge',
    sourceUrl: source.resourceUrl,
    sortOrder: index + 1,
    updatedAt: Date.now(),
  }));
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

function replaceSourceArticles(current: KnowledgeArticle[], source: FeishuSource, incoming: KnowledgeArticle[]) {
  return [
    ...current.filter((article) => article.sourceUrl !== source.resourceUrl && !article.id.startsWith(`${source.id}_`)),
    ...incoming,
  ];
}

async function syncOneSource(source: FeishuSource, state: AppData) {
  const credentials = readFeishuCredentials();
  const startedAt = Date.now();
  let questionsImported = 0;
  let configsImported = 0;
  let articlesImported = 0;

  try {
    if (source.sourceType === 'knowledge_doc' || source.sourceType === 'case_doc') {
      const content = await readFeishuDocText(credentials, source);
      const articles = splitDocIntoArticles(content, source);
      state.knowledgeArticles = replaceSourceArticles(state.knowledgeArticles, source, articles);
      articlesImported = articles.length;
    } else {
      const rows =
        source.resourceType === 'bitable'
          ? await readFeishuBitableRows(credentials, source)
          : await readFeishuSheetRows(credentials, source);

      if (source.sourceType === 'question_table') {
        const questions = parseQuestionRows(rows, source.id);
        state.questions = mergeById(state.questions, questions);
        questionsImported = questions.length;
      } else if (source.sourceType === 'config_table') {
        const configs = parseConfigRows(rows, source.id);
        state.examConfigs = mergeById(state.examConfigs, configs);
        configsImported = configs.length;
      }
    }

    const finishedAt = Date.now();
    const syncRun: SyncRun = {
      id: createId('sync'),
      sourceId: source.id,
      sourceName: source.name,
      status: 'success',
      message: '同步成功',
      questionsImported,
      configsImported,
      articlesImported,
      startedAt,
      finishedAt,
    };
    state.syncRuns = [syncRun, ...state.syncRuns].slice(0, 50);
    updateSourceSyncedAt(source.id, finishedAt);
    insertSyncRun(syncRun);
  } catch (error) {
    const syncRun: SyncRun = {
      id: createId('sync'),
      sourceId: source.id,
      sourceName: source.name,
      status: 'failed',
      message: error instanceof Error ? error.message : '同步失败',
      questionsImported,
      configsImported,
      articlesImported,
      startedAt,
      finishedAt: Date.now(),
    };
    state.syncRuns = [syncRun, ...state.syncRuns].slice(0, 50);
    insertSyncRun(syncRun);
  }
}

export async function runFeishuSync() {
  const settings = readFeishuSettings();
  const state = readAppState();
  state.knowledgeCategories =
    state.knowledgeCategories.length > 0 ? state.knowledgeCategories : DEFAULT_KNOWLEDGE_CATEGORIES;

  const enabledSources = settings.sources
    .filter((source) => source.enabled)
    .map((source) => ({
      ...source,
      resourceToken: source.resourceToken || extractFeishuToken(source.resourceUrl),
    }));

  if (enabledSources.length === 0) {
    throw new Error('暂无可用飞书同步配置');
  }

  for (const source of enabledSources) {
    await syncOneSource(source, state);
  }

  replaceAppState(state);
  return readFeishuSettings();
}
