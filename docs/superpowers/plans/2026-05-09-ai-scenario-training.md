# AI Scenario Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first complete AI 情景训练 loop: admins create document-backed scenarios, employees practice with an AI role, and the system saves feedback-only reports.

**Architecture:** Add AI training as a separate module beside the existing exam flow. Persist scenarios and sessions through the existing `AppData` + SQLite pattern, keep local document parsing client-side, and put Gemini interaction behind two focused API routes.

**Tech Stack:** Next.js App Router, React client pages, Zustand store, SQLite repository, shadcn/base-ui components, `@google/genai`, local DOCX/TXT/MD parsing.

---

## Scope Check

The design is one coherent vertical slice: training scenario management, employee chat, report generation, and training records. It touches data, UI, and AI routes, but each layer supports the same single workflow, so this plan keeps it as one implementation plan.

The existing worktree already contains unrelated dirty files. Every task must stage only the files listed in that task.

## File Structure

Create:

- `lib/ai-training/defaults.ts` - default rubric, default redline rule helpers, score validation.
- `lib/ai-training/documents.ts` - client-safe DOCX/TXT/MD extraction and file validation.
- `lib/ai-training/prompts.ts` - server-side prompt builders and response parsers for chat/report.
- `app/api/ai-training/chat/route.ts` - role-play response API.
- `app/api/ai-training/report/route.ts` - structured report API.
- `app/admin/ai-training/page.tsx` - admin scenario list and create/edit dialog.
- `app/admin/ai-training/records/page.tsx` - admin training records list.
- `app/student/ai-training/page.tsx` - employee scenario list.
- `app/student/ai-training/[sessionId]/page.tsx` - chat session.
- `app/student/ai-training/[sessionId]/report/page.tsx` - employee report view.
- `scripts/test-ai-training-state.mjs` - HTTP smoke test for AppData persistence.
- `scripts/test-ai-training-flow.mjs` - HTTP smoke test for AI API contracts with mocked/offline fallback not required; validates error behavior without API key.

Modify:

- `lib/appTypes.ts` - add AI training types and `AppData` arrays.
- `lib/server/appStateRepository.ts` - add SQLite schema, selectors, and replace logic.
- `app/api/app-state/route.ts` - normalize AI training arrays.
- `store/useStore.ts` - expose scenario/session mutators.
- `components/ClientLayout.tsx` - add navigation and warmup paths.
- `package.json` - add smoke test scripts.

## Task 1: Data Model And Persistence

**Files:**
- Modify: `lib/appTypes.ts`
- Modify: `lib/server/appStateRepository.ts`
- Modify: `app/api/app-state/route.ts`
- Modify: `store/useStore.ts`
- Create: `scripts/test-ai-training-state.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing persistence smoke test**

Create `scripts/test-ai-training-state.mjs`:

```js
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function getState() {
  return readJson(await fetch(`${baseUrl}/api/app-state`, { cache: 'no-store' }));
}

async function putState(state) {
  return readJson(await fetch(`${baseUrl}/api/app-state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  }));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const original = await getState();
  const scenarioId = `scenario_test_${Date.now()}`;
  const sessionId = `session_test_${Date.now()}`;

  const scenario = {
    id: scenarioId,
    name: '租赁权异议处理训练',
    stage: '新人',
    difficulty: '中等',
    description: '客户质疑租赁权是否真实。',
    aiRole: '谨慎且抗拒的客户，懂一点法律。',
    traineeTask: '解释租赁权论证逻辑并识别风险。',
    openingMessage: '你们这个租赁权是不是临时做出来的？',
    scoringRubric: [
      { id: 'business_understanding', name: '业务理解', description: '识别客户顾虑与场景风险。', maxScore: 20 },
      { id: 'knowledge_usage', name: '资料运用', description: '转化资料中的关键依据。', maxScore: 20 },
      { id: 'conversation_progress', name: '沟通推进', description: '澄清、安抚并推进下一步。', maxScore: 20 },
      { id: 'expression', name: '话术表达', description: '表达清楚专业。', maxScore: 20 },
      { id: 'compliance', name: '合规安全', description: '避开红线和越界承诺。', maxScore: 20 },
    ],
    redlineRules: [
      { id: 'no_guarantee', title: '禁止承诺司法结果', description: '不能保证不拍卖、撤拍或保房。', severity: 'high' },
    ],
    documents: [
      { id: 'doc_test', fileName: 'training.md', fileType: 'md', text: '租赁权论证需要关注交付、占有、备案、租金流水。', uploadedAt: Date.now() },
    ],
    status: 'published',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const session = {
    id: sessionId,
    scenarioId,
    userId: 'u2',
    status: 'completed',
    messages: [
      { id: 'm1', role: 'ai', content: scenario.openingMessage, createdAt: Date.now() },
      { id: 'm2', role: 'trainee', content: '需要结合材料和司法节点判断，不能承诺结果。', createdAt: Date.now() },
    ],
    report: {
      totalScore: 82,
      dimensionScores: [
        { rubricItemId: 'compliance', name: '合规安全', score: 18, maxScore: 20, reason: '未承诺结果。', evidence: '不能承诺结果' },
      ],
      strengths: ['能主动规避绝对化承诺。'],
      issues: ['证据链展开不够完整。'],
      redlineHits: [],
      suggestedPhrases: ['我们需要结合材料、占有事实和司法节点综合判断。'],
      summary: '继续加强证据链表达。',
      generatedAt: Date.now(),
    },
    startedAt: Date.now(),
    endedAt: Date.now(),
  };

  const nextState = {
    ...original,
    aiTrainingScenarios: [scenario],
    aiTrainingSessions: [session],
  };

  await putState(nextState);
  const saved = await getState();
  assert(Array.isArray(saved.aiTrainingScenarios), 'aiTrainingScenarios should be an array');
  assert(Array.isArray(saved.aiTrainingSessions), 'aiTrainingSessions should be an array');
  assert(saved.aiTrainingScenarios.some((item) => item.id === scenarioId), 'scenario was not persisted');
  assert(saved.aiTrainingSessions.some((item) => item.id === sessionId), 'session was not persisted');

  await putState(original);
  console.log('AI training state persistence smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add the package script**

In `package.json`, add:

```json
"test:ai-training-state": "node scripts/test-ai-training-state.mjs"
```

- [ ] **Step 3: Run test and verify it fails before implementation**

Run a dev server in another terminal:

```bash
npm run dev
```

Then run:

```bash
npm run test:ai-training-state
```

Expected before implementation: FAIL because `/api/app-state` drops `aiTrainingScenarios` and `aiTrainingSessions`.

- [ ] **Step 4: Add AI training types**

In `lib/appTypes.ts`, add these types after `TrainingProgress`:

```ts
export type AiTrainingDifficulty = '基础' | '中等' | '高';
export type AiTrainingScenarioStatus = 'draft' | 'published' | 'archived';
export type AiTrainingSessionStatus = 'in_progress' | 'completed';
export type AiTrainingMessageRole = 'ai' | 'trainee';
export type AiTrainingRedlineSeverity = 'low' | 'medium' | 'high';

export interface AiTrainingDocument {
  id: string;
  fileName: string;
  fileType: 'docx' | 'txt' | 'md';
  text: string;
  uploadedAt: number;
}

export interface AiTrainingRubricItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
}

export interface AiTrainingRedlineRule {
  id: string;
  title: string;
  description: string;
  severity: AiTrainingRedlineSeverity;
}

export interface AiTrainingScenario {
  id: string;
  name: string;
  stage?: string;
  difficulty: AiTrainingDifficulty;
  description: string;
  aiRole: string;
  traineeTask: string;
  openingMessage: string;
  scoringRubric: AiTrainingRubricItem[];
  redlineRules: AiTrainingRedlineRule[];
  documents: AiTrainingDocument[];
  status: AiTrainingScenarioStatus;
  createdAt: number;
  updatedAt: number;
}

export interface AiTrainingMessage {
  id: string;
  role: AiTrainingMessageRole;
  content: string;
  createdAt: number;
}

export interface AiTrainingDimensionScore {
  rubricItemId: string;
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  evidence: string;
}

export interface AiTrainingRedlineHit {
  ruleId?: string;
  title: string;
  severity: AiTrainingRedlineSeverity;
  quote: string;
  reason: string;
  suggestion: string;
}

export interface AiTrainingReport {
  totalScore: number;
  dimensionScores: AiTrainingDimensionScore[];
  strengths: string[];
  issues: string[];
  redlineHits: AiTrainingRedlineHit[];
  suggestedPhrases: string[];
  summary: string;
  generatedAt: number;
}

export interface AiTrainingSession {
  id: string;
  scenarioId: string;
  userId: string;
  status: AiTrainingSessionStatus;
  messages: AiTrainingMessage[];
  report?: AiTrainingReport;
  startedAt: number;
  endedAt?: number;
}
```

Extend `AppData`:

```ts
  aiTrainingScenarios: AiTrainingScenario[];
  aiTrainingSessions: AiTrainingSession[];
```

Extend `createEmptyAppData()`:

```ts
    aiTrainingScenarios: [],
    aiTrainingSessions: [],
```

- [ ] **Step 5: Persist AI training state in SQLite**

In `lib/server/appStateRepository.ts`, import the new types. Add tables in `ensureAppStateSchema()`:

```sql
CREATE TABLE IF NOT EXISTS ai_training_scenarios (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT,
  difficulty TEXT NOT NULL,
  description TEXT NOT NULL,
  ai_role TEXT NOT NULL,
  trainee_task TEXT NOT NULL,
  opening_message TEXT NOT NULL,
  scoring_rubric TEXT NOT NULL,
  redline_rules TEXT NOT NULL,
  documents TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_training_sessions (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  messages TEXT NOT NULL,
  report TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
```

Add selectors:

```ts
function selectAiTrainingScenarios(): AiTrainingScenario[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM ai_training_scenarios
    ORDER BY updated_at DESC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    stage: optionalString(row.stage),
    difficulty: row.difficulty === '高' ? '高' : row.difficulty === '基础' ? '基础' : '中等',
    description: String(row.description ?? ''),
    aiRole: String(row.ai_role ?? ''),
    traineeTask: String(row.trainee_task ?? ''),
    openingMessage: String(row.opening_message ?? ''),
    scoringRubric: parseJson(row.scoring_rubric, []),
    redlineRules: parseJson(row.redline_rules, []),
    documents: parseJson(row.documents, []),
    status: row.status === 'published' ? 'published' : row.status === 'archived' ? 'archived' : 'draft',
    createdAt: numberValue(row.created_at, Date.now()),
    updatedAt: numberValue(row.updated_at, Date.now()),
  }));
}

function selectAiTrainingSessions(): AiTrainingSession[] {
  const rows = getDatabase().prepare(`
    SELECT *
    FROM ai_training_sessions
    ORDER BY started_at DESC, id ASC
  `).all() as Row[];

  return rows.map((row) => ({
    id: String(row.id),
    scenarioId: String(row.scenario_id),
    userId: String(row.user_id),
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    messages: parseJson(row.messages, []),
    report: parseJson(row.report, undefined),
    startedAt: numberValue(row.started_at, Date.now()),
    endedAt: optionalNumber(row.ended_at),
  }));
}
```

Return both arrays from `readAppState()`.

In `replaceAppState()`, add insert statements:

```ts
const insertAiTrainingScenario = db.prepare(`
  INSERT INTO ai_training_scenarios (
    id, name, stage, difficulty, description, ai_role, trainee_task, opening_message,
    scoring_rubric, redline_rules, documents, status, created_at, updated_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAiTrainingSession = db.prepare(`
  INSERT INTO ai_training_sessions (
    id, scenario_id, user_id, status, messages, report, started_at, ended_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
```

Add deletes inside the transaction before deleting users:

```sql
DELETE FROM ai_training_sessions;
DELETE FROM ai_training_scenarios;
```

Insert scenario/session rows:

```ts
data.aiTrainingScenarios.forEach((scenario) => {
  insertAiTrainingScenario.run(
    scenario.id,
    scenario.name,
    scenario.stage ?? null,
    scenario.difficulty,
    scenario.description,
    scenario.aiRole,
    scenario.traineeTask,
    scenario.openingMessage,
    stringifyJson(scenario.scoringRubric),
    stringifyJson(scenario.redlineRules),
    stringifyJson(scenario.documents),
    scenario.status,
    scenario.createdAt,
    scenario.updatedAt
  );
});

data.aiTrainingSessions.forEach((session) => {
  insertAiTrainingSession.run(
    session.id,
    session.scenarioId,
    session.userId,
    session.status,
    stringifyJson(session.messages),
    session.report ? stringifyJson(session.report) : null,
    session.startedAt,
    session.endedAt ?? null
  );
});
```

- [ ] **Step 6: Normalize AppData and store actions**

In `app/api/app-state/route.ts`, include:

```ts
    aiTrainingScenarios: asArray(data.aiTrainingScenarios),
    aiTrainingSessions: asArray(data.aiTrainingSessions),
```

In `store/useStore.ts`, import/export the new types and extend `toAppData()`, `hasImportedData()`, `migrateLegacyDataIfNeeded()`, and the initial state fields. Add actions:

```ts
  upsertAiTrainingScenario: (scenario: AiTrainingScenario) => Promise<void>;
  deleteAiTrainingScenario: (id: string) => Promise<void>;
  upsertAiTrainingSession: (session: AiTrainingSession) => Promise<void>;
```

Implement them with `updateAndPersist`:

```ts
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
        aiTrainingScenarios: state.aiTrainingScenarios.filter((item) => item.id !== id),
        aiTrainingSessions: state.aiTrainingSessions.filter((item) => item.scenarioId !== id),
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
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm run test:ai-training-state
npm run lint
```

Expected: both PASS.

Commit only this task's files:

```bash
git add lib/appTypes.ts lib/server/appStateRepository.ts app/api/app-state/route.ts store/useStore.ts scripts/test-ai-training-state.mjs package.json package-lock.json
git commit -m "feat: persist ai training state"
```

## Task 2: Domain Defaults And Document Parsing

**Files:**
- Create: `lib/ai-training/defaults.ts`
- Create: `lib/ai-training/documents.ts`
- Modify: `app/admin/questions/page.tsx`

- [ ] **Step 1: Create reusable default helpers**

Create `lib/ai-training/defaults.ts`:

```ts
import type { AiTrainingRedlineRule, AiTrainingRubricItem } from '@/lib/appTypes';

export const DEFAULT_AI_TRAINING_RUBRIC: AiTrainingRubricItem[] = [
  { id: 'business_understanding', name: '业务理解', description: '识别客户问题、业务背景和关键风险点。', maxScore: 20 },
  { id: 'knowledge_usage', name: '资料运用', description: '准确转化场景资料中的核心知识。', maxScore: 20 },
  { id: 'conversation_progress', name: '沟通推进', description: '通过澄清、安抚、追问推进下一步。', maxScore: 20 },
  { id: 'expression', name: '话术表达', description: '表达清楚、专业、自然，适合真实业务场景。', maxScore: 20 },
  { id: 'compliance', name: '合规安全', description: '避开红线、禁语和越界承诺。', maxScore: 20 },
];

export const DEFAULT_AI_TRAINING_REDLINES: AiTrainingRedlineRule[] = [
  { id: 'no_judicial_guarantee', title: '禁止承诺司法结果', description: '不得承诺撤拍、保房、一定不被拍卖或法院结果。', severity: 'high' },
  { id: 'no_fake_lease', title: '禁止诱导虚假租赁', description: '不得建议补做、倒签、虚构租约或伪造占有事实。', severity: 'high' },
  { id: 'no_relationship_claim', title: '禁止关系型承诺', description: '不得暗示公司与法院、法官、拍辅机构存在特殊关系。', severity: 'high' },
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
```

- [ ] **Step 2: Extract shared document parsing**

Create `lib/ai-training/documents.ts`:

```ts
import type { AiTrainingDocument } from '@/lib/appTypes';
import { createId } from '@/lib/ai-training/defaults';
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_SCENARIO_TEXT_LENGTH = 80_000;

export function getAiTrainingFileType(fileName: string): AiTrainingDocument['fileType'] | null {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.docx')) return 'docx';
  if (lowerName.endsWith('.txt')) return 'txt';
  if (lowerName.endsWith('.md')) return 'md';
  return null;
}

export function truncateScenarioDocuments(documents: AiTrainingDocument[]) {
  let used = 0;
  return documents.map((document) => {
    const remaining = Math.max(0, MAX_SCENARIO_TEXT_LENGTH - used);
    const text = document.text.slice(0, remaining);
    used += text.length;
    return { ...document, text };
  });
}

export function extractDocxText(buffer: ArrayBuffer) {
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

export async function readAiTrainingDocument(file: File): Promise<AiTrainingDocument> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('文件不能超过 5MB');
  }

  const fileType = getAiTrainingFileType(file.name);
  if (!fileType) {
    throw new Error('仅支持 DOCX、TXT、MD 文件');
  }

  const text = fileType === 'docx'
    ? extractDocxText(await file.arrayBuffer())
    : await file.text();

  if (!text.trim()) {
    throw new Error('未从文件中解析到文本');
  }

  return {
    id: createId('aitdoc'),
    fileName: file.name,
    fileType,
    text: text.trim(),
    uploadedAt: Date.now(),
  };
}
```

- [ ] **Step 3: Reuse the shared DOCX parser in question import**

In `app/admin/questions/page.tsx`, remove the local `extractDocxText` function and import:

```ts
import { extractDocxText } from '@/lib/ai-training/documents';
```

Leave `handleDocxUpload` behavior unchanged.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run lint
```

Expected: PASS.

Commit:

```bash
git add lib/ai-training/defaults.ts lib/ai-training/documents.ts app/admin/questions/page.tsx
git commit -m "feat: add ai training document helpers"
```

## Task 3: Admin Scenario Management

**Files:**
- Create: `app/admin/ai-training/page.tsx`
- Modify: `components/ClientLayout.tsx`

- [ ] **Step 1: Add admin navigation and route warmup**

In `components/ClientLayout.tsx`, add warmup paths:

```ts
  '/admin/ai-training',
  '/admin/ai-training/records',
```

Add `MessagesSquare` to the `lucide-react` import. In the admin AI group, add:

```ts
        { name: '情景训练', href: '/admin/ai-training', icon: MessagesSquare },
        { name: '训练记录', href: '/admin/ai-training/records', icon: ClipboardList },
```

- [ ] **Step 2: Build the admin scenario page**

Create `app/admin/ai-training/page.tsx`. The page should:

- Read `aiTrainingScenarios`, `upsertAiTrainingScenario`, and `deleteAiTrainingScenario` from `useStore`.
- Show scenarios in a table with name, stage, difficulty, status, document count, updated time.
- Use one dialog for create/edit.
- Use `readAiTrainingDocument()` for uploads.
- Use `DEFAULT_AI_TRAINING_RUBRIC`, `DEFAULT_AI_TRAINING_REDLINES`, `createId()`, and `isValidRubricTotal()`.
- Block publishing if rubric total is not 100.

Use this scenario factory in the file:

```ts
function createEmptyScenario(): AiTrainingScenario {
  const now = Date.now();
  return {
    id: createId('scenario'),
    name: '',
    stage: '',
    difficulty: '中等',
    description: '',
    aiRole: '',
    traineeTask: '',
    openingMessage: '',
    scoringRubric: DEFAULT_AI_TRAINING_RUBRIC.map((item) => ({ ...item })),
    redlineRules: DEFAULT_AI_TRAINING_REDLINES.map((item) => ({ ...item })),
    documents: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}
```

Use this save guard:

```ts
function validateScenario(scenario: AiTrainingScenario, publish: boolean) {
  if (!scenario.name.trim()) return '请填写场景名称';
  if (!scenario.aiRole.trim()) return '请填写 AI 扮演角色';
  if (!scenario.traineeTask.trim()) return '请填写员工任务';
  if (!scenario.openingMessage.trim()) return '请填写 AI 开场白';
  if (publish && !isValidRubricTotal(scenario.scoringRubric)) return '评分维度总分必须等于 100';
  return '';
}
```

The save handler should set `updatedAt: Date.now()` and set `status` to `'published'` only when the publish button was clicked.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npm run lint
```

Expected: PASS.

Manual check:

1. Open `/admin/ai-training`.
2. Create a draft with DOCX/TXT/MD upload.
3. Try to publish with rubric total not equal to 100 and confirm it blocks.
4. Restore total to 100 and publish.

Commit:

```bash
git add app/admin/ai-training/page.tsx components/ClientLayout.tsx
git commit -m "feat: add ai training scenario management"
```

## Task 4: AI Chat And Report APIs

**Files:**
- Create: `lib/ai-training/prompts.ts`
- Create: `app/api/ai-training/chat/route.ts`
- Create: `app/api/ai-training/report/route.ts`
- Create: `scripts/test-ai-training-flow.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write API contract smoke test**

Create `scripts/test-ai-training-flow.mjs`:

```js
const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

async function main() {
  const chat = await readJson(await fetch(`${baseUrl}/api/ai-training/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId: '', sessionId: '', messages: [] }),
  }));
  if (chat.ok || !chat.payload?.error) {
    throw new Error('chat route should reject invalid payload with an error message');
  }

  const report = await readJson(await fetch(`${baseUrl}/api/ai-training/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioId: '', sessionId: '', messages: [] }),
  }));
  if (report.ok || !report.payload?.error) {
    throw new Error('report route should reject invalid payload with an error message');
  }

  console.log('AI training API contract smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`:

```json
"test:ai-training-flow": "node scripts/test-ai-training-flow.mjs"
```

- [ ] **Step 2: Create prompt helpers**

Create `lib/ai-training/prompts.ts`:

```ts
import type { AiTrainingMessage, AiTrainingReport, AiTrainingScenario } from '@/lib/appTypes';

function compact(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function getScenarioKnowledge(scenario: AiTrainingScenario) {
  return scenario.documents
    .map((document) => `【${document.fileName}】\n${document.text}`)
    .join('\n\n')
    .slice(0, 80_000);
}

export function buildChatPrompt(scenario: AiTrainingScenario, messages: AiTrainingMessage[]) {
  return [
    '你正在进行企业内部 AI 情景训练。',
    '你必须扮演场景角色，不要暴露评分标准，不要以老师口吻讲答案。',
    `场景名称：${scenario.name}`,
    `场景简介：${scenario.description}`,
    `AI角色：${scenario.aiRole}`,
    `员工任务：${scenario.traineeTask}`,
    `资料依据：${getScenarioKnowledge(scenario) || '暂无资料'}`,
    '最近对话：',
    messages.map((message) => `${message.role === 'ai' ? 'AI角色' : '员工'}：${message.content}`).join('\n'),
    '请输出 AI 角色的下一句回复。回复要自然、具体，可以追问、反驳、施压或要求澄清。只输出角色回复文本。',
  ].join('\n\n');
}

export function buildReportPrompt(scenario: AiTrainingScenario, messages: AiTrainingMessage[]) {
  return [
    '你是企业内部训练官，需要基于完整对话生成训练报告。',
    '只输出 JSON，不要输出 Markdown，不要包裹代码块。',
    `场景名称：${scenario.name}`,
    `员工任务：${scenario.traineeTask}`,
    `评分维度：${JSON.stringify(scenario.scoringRubric)}`,
    `红线规则：${JSON.stringify(scenario.redlineRules)}`,
    `资料依据：${getScenarioKnowledge(scenario) || '暂无资料'}`,
    `完整对话：${messages.map((message) => `${message.role === 'ai' ? 'AI角色' : '员工'}：${message.content}`).join('\n')}`,
    'JSON 字段必须是：totalScore, dimensionScores, strengths, issues, redlineHits, suggestedPhrases, summary, generatedAt。',
    'dimensionScores 每项必须包含 rubricItemId, name, score, maxScore, reason, evidence。',
    'redlineHits 每项必须包含 ruleId, title, severity, quote, reason, suggestion。',
    '总分为 0 到 100，仅作训练反馈；不要输出通过或不通过。',
  ].join('\n\n');
}

export function parseReportJson(text: string): AiTrainingReport {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(cleaned) as AiTrainingReport;
  return {
    totalScore: Math.max(0, Math.min(100, Math.round(Number(parsed.totalScore) || 0))),
    dimensionScores: Array.isArray(parsed.dimensionScores) ? parsed.dimensionScores : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(compact) : [],
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(compact) : [],
    redlineHits: Array.isArray(parsed.redlineHits) ? parsed.redlineHits : [],
    suggestedPhrases: Array.isArray(parsed.suggestedPhrases) ? parsed.suggestedPhrases.map(compact) : [],
    summary: compact(parsed.summary || ''),
    generatedAt: Date.now(),
  };
}
```

- [ ] **Step 3: Implement Gemini route helpers in each API route**

Both routes should:

- Use `readAppState()` to load the scenario.
- Validate `scenarioId`, `sessionId`, and `messages`.
- Return `400` for invalid input or missing scenario.
- Return `500` with a clear message if `GEMINI_API_KEY` is missing.
- Use `GoogleGenAI` from `@google/genai`.

Use this Gemini call shape:

```ts
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: prompt,
});
const text = response.text?.trim() ?? '';
```

`app/api/ai-training/chat/route.ts` should return:

```ts
return NextResponse.json({
  message: {
    id: `msg_${Date.now()}`,
    role: 'ai',
    content: text,
    createdAt: Date.now(),
  },
});
```

`app/api/ai-training/report/route.ts` should return:

```ts
return NextResponse.json({ report: parseReportJson(text) });
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run test:ai-training-flow
npm run lint
```

Expected: smoke test PASS without needing a real API key because it only sends invalid payloads; lint PASS.

Commit:

```bash
git add lib/ai-training/prompts.ts app/api/ai-training/chat/route.ts app/api/ai-training/report/route.ts scripts/test-ai-training-flow.mjs package.json package-lock.json
git commit -m "feat: add ai training api routes"
```

## Task 5: Employee Scenario List And Chat Session

**Files:**
- Create: `app/student/ai-training/page.tsx`
- Create: `app/student/ai-training/[sessionId]/page.tsx`
- Modify: `components/ClientLayout.tsx`

- [ ] **Step 1: Add employee navigation**

In `components/ClientLayout.tsx`, add warmup paths:

```ts
  '/student/ai-training',
  '/student/ai-training/__warmup__',
  '/student/ai-training/__warmup__/report',
```

In `studentNavGroups`, add:

```ts
        { name: 'AI情景训练', href: '/student/ai-training', icon: MessagesSquare },
```

In the admin training exam group, also add a self-use employee entry:

```ts
        { name: 'AI情景训练', href: '/student/ai-training', icon: MessagesSquare },
```

- [ ] **Step 2: Build employee scenario list**

Create `app/student/ai-training/page.tsx`. It should:

- Read `aiTrainingScenarios`, `aiTrainingSessions`, `currentUser`, and `upsertAiTrainingSession`.
- Filter scenarios to `status === 'published'`.
- Show cards with scenario name, stage, difficulty, description, trainee task, document count, and latest score for the current user.
- On start, create a session with the opening AI message and navigate to `/student/ai-training/${session.id}`.

Use this start handler:

```ts
const handleStart = async (scenario: AiTrainingScenario) => {
  if (!currentUser) return;
  const now = Date.now();
  const session: AiTrainingSession = {
    id: createId('aitsession'),
    scenarioId: scenario.id,
    userId: currentUser.id,
    status: 'in_progress',
    messages: [
      {
        id: createId('aitmsg'),
        role: 'ai',
        content: scenario.openingMessage,
        createdAt: now,
      },
    ],
    startedAt: now,
  };
  await upsertAiTrainingSession(session);
  router.push(`/student/ai-training/${session.id}`);
};
```

- [ ] **Step 3: Build chat session page**

Create `app/student/ai-training/[sessionId]/page.tsx`. It should:

- Resolve `sessionId` with `React.use(params)` like the existing dynamic pages.
- Find the session and scenario from store.
- Block users from viewing sessions not owned by them unless current user is admin.
- Render messages in a scrollable conversation area.
- Add a textarea input and send button.
- Add an end-training button.

Use this send flow:

```ts
const traineeMessage: AiTrainingMessage = {
  id: createId('aitmsg'),
  role: 'trainee',
  content: input.trim(),
  createdAt: Date.now(),
};
const optimisticSession = {
  ...session,
  messages: [...session.messages, traineeMessage],
};
await upsertAiTrainingSession(optimisticSession);
const response = await fetch('/api/ai-training/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenarioId: scenario.id,
    sessionId: session.id,
    messages: optimisticSession.messages,
  }),
});
const payload = await response.json();
if (!response.ok) throw new Error(payload?.error || 'AI 回复失败');
await upsertAiTrainingSession({
  ...optimisticSession,
  messages: [...optimisticSession.messages, payload.message],
});
```

Use this end flow:

```ts
const response = await fetch('/api/ai-training/report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    scenarioId: scenario.id,
    sessionId: session.id,
    messages: session.messages,
  }),
});
const payload = await response.json();
if (!response.ok) throw new Error(payload?.error || '训练报告生成失败');
await upsertAiTrainingSession({
  ...session,
  status: 'completed',
  report: payload.report,
  endedAt: Date.now(),
});
router.push(`/student/ai-training/${session.id}/report`);
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run lint
```

Manual check with a published scenario:

1. Open `/student/ai-training`.
2. Start a scenario.
3. Confirm the opening message appears.
4. Send a message. If no API key exists, confirm the page shows an error toast and keeps the trainee message.
5. Confirm “结束训练” also keeps the session if report generation fails.

Commit:

```bash
git add app/student/ai-training/page.tsx app/student/ai-training/[sessionId]/page.tsx components/ClientLayout.tsx
git commit -m "feat: add employee ai training chat"
```

## Task 6: Report Views And Training Records

**Files:**
- Create: `app/student/ai-training/[sessionId]/report/page.tsx`
- Create: `app/admin/ai-training/records/page.tsx`

- [ ] **Step 1: Build employee report page**

Create `app/student/ai-training/[sessionId]/report/page.tsx`. It should:

- Find session, scenario, and current user.
- Block non-owner access unless admin.
- Show a friendly “报告尚未生成” state when `session.report` is missing.
- Render total score, dimension scores, strengths, issues, redline hits, suggested phrases, and summary.
- Provide buttons back to `/student/ai-training` and back to the session chat page.

Use redline badges:

```ts
const severityClass = {
  low: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  medium: 'border-orange-200 bg-orange-50 text-orange-700',
  high: 'border-red-200 bg-red-50 text-red-700',
};
```

- [ ] **Step 2: Build admin training records page**

Create `app/admin/ai-training/records/page.tsx`. It should:

- Read all `aiTrainingSessions`, `aiTrainingScenarios`, and `users`.
- Show completed sessions first, sorted by `endedAt || startedAt` descending.
- Include search by employee name, username, or scenario name.
- Show employee, scenario, status, total score, redline count, start/end time.
- Link to `/student/ai-training/${session.id}/report` for report details; admins are allowed to view these.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npm run lint
```

Manual check:

1. Employee can view only their report.
2. Admin can view all reports from the admin records list.
3. Training score does not appear in `/student/records` or `/admin/records`.

Commit:

```bash
git add app/student/ai-training/[sessionId]/report/page.tsx app/admin/ai-training/records/page.tsx
git commit -m "feat: add ai training reports"
```

## Task 7: Final Verification And Release Notes

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run full verification**

Run with a dev server available:

```bash
npm run test:ai-training-state
npm run test:ai-training-flow
npm run lint
npm run build
```

Expected:

- State smoke test PASS.
- API contract smoke test PASS.
- Lint PASS.
- Build PASS.

- [ ] **Step 2: Manual acceptance checklist**

Run through this checklist and record results:

```text
Admin can create draft scenario.
Admin can upload DOCX/TXT/MD.
Admin cannot upload PDF.
Admin cannot publish if rubric total is not 100.
Admin can publish scenario.
Employee sees only published scenarios.
Employee starts a session and sees opening AI message.
Employee chat failures keep local transcript.
Employee can generate or retry report.
Admin sees all training records.
Employee sees only own training records/report.
Training score does not affect exam score/pass/retake.
```

- [ ] **Step 3: Add progress note**

Append to `progress.md`:

```md

# 进度记录：AI 情景训练

- 已实现管理员 AI 情景训练场景管理，支持 DOCX/TXT/MD 本地资料上传。
- 已新增员工 AI 情景训练入口，可选择已发布场景进入多轮对话。
- 已新增 AI 聊天与结构化训练报告接口，报告分数只做训练反馈，不影响考试成绩或重考状态。
- 已新增管理员训练记录和员工报告页。
- 已验证：状态持久化、API 合同、lint、build。
```

- [ ] **Step 4: Final commit**

Commit any final docs/verification updates:

```bash
git add progress.md
git commit -m "docs: record ai training implementation progress"
```

## Self-Review

- Spec coverage: scenarios, local DOCX/TXT/MD upload, employee chat, reports, admin records, feedback-only scoring, and no PDF support are covered by Tasks 1-7.
- Placeholder scan: this plan contains no unresolved placeholders. The implementation steps define exact file paths, commands, expected outcomes, and key code blocks.
- Type consistency: type names use the `AiTraining*` prefix consistently across `lib/appTypes.ts`, store actions, API routes, and pages.
