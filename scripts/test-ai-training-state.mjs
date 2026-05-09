const baseUrl = process.env.APP_BASE_URL ?? 'http://localhost:3000';
const endpoint = new URL('/api/app-state', baseUrl);

async function readAppState() {
  const response = await fetch(endpoint, { method: 'GET' });
  return parseResponse(response);
}

async function writeAppState(data) {
  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return parseResponse(response);
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const scenarioId = `smoke-ai-training-scenario-${runId}`;
const legacyScenarioId = `smoke-ai-training-legacy-scenario-${runId}`;
const sessionId = `smoke-ai-training-session-${runId}`;
const legacySessionId = `smoke-ai-training-legacy-session-${runId}`;
const now = Date.now();
const createdScenarioIds = new Set([scenarioId, legacyScenarioId]);
const createdSessionIds = new Set([sessionId, legacySessionId]);

async function cleanupSmokeData() {
  const currentState = await readAppState();

  await writeAppState({
    ...currentState,
    aiTrainingScenarios: (currentState.aiTrainingScenarios ?? []).filter(
      (scenario) => !createdScenarioIds.has(scenario.id)
    ),
    aiTrainingSessions: (currentState.aiTrainingSessions ?? []).filter(
      (session) => !createdSessionIds.has(session.id)
    ),
  });
}

try {
  const currentState = await readAppState();

  const scenario = {
    id: scenarioId,
    name: 'Smoke Test AI Training Scenario',
    stage: 'Smoke Test Stage',
    description: 'Verifies AI training scenario persistence.',
    difficulty: '基础',
    aiRole: 'Act as a customer in a training conversation.',
    traineeTask: 'Collect customer context and avoid redline phrases.',
    openingMessage: 'Hello, I need help understanding my case options.',
    scoringRubric: [
      {
        id: 'smoke-rubric',
        name: 'Context collection',
        description: 'Asks relevant context questions.',
        maxScore: 10,
      },
    ],
    redlineRules: [
      {
        id: 'smoke-redline',
        title: 'No guarantee',
        description: 'Must not promise guaranteed outcomes.',
        severity: 'high',
      },
    ],
    documents: [
      {
        id: 'smoke-document',
        fileName: 'Smoke Test Reference.md',
        fileType: 'md',
        text: 'Use this document to verify JSON persistence.',
        uploadedAt: now,
      },
    ],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };

  const session = {
    id: sessionId,
    scenarioId,
    userId: 'u1',
    status: 'completed',
    messages: [
      {
        id: 'smoke-message',
        role: 'trainee',
        content: '您好，我想先了解一下您的基本情况。',
        createdAt: now,
      },
    ],
    report: {
      totalScore: 8,
      dimensionScores: [
        {
          rubricItemId: 'smoke-rubric',
          name: 'Context collection',
          score: 8,
          maxScore: 10,
          reason: 'Asked useful opening questions.',
          evidence: '您好，我想先了解一下您的基本情况。',
        },
      ],
      redlineHits: [],
      strengths: ['Asked a clear opening question.'],
      issues: ['Need more detail in follow-up questions.'],
      suggestedPhrases: ['我先确认几个关键信息，避免误判。'],
      summary: 'Smoke test report.',
      generatedAt: now,
    },
    startedAt: now,
    completedAt: now,
  };
  const legacyScenario = {
    id: legacyScenarioId,
    title: 'Legacy AI Training Scenario',
    description: 'Legacy opening text doubles as the opening message.',
    difficulty: '高',
    status: 'published',
    rolePrompt: 'Legacy customer role prompt.',
    traineeGoal: 'Legacy trainee goal.',
    scoringRubric: [
      {
        id: 'legacy-rubric',
        title: 'Legacy rubric title',
        description: 'Legacy rubric description.',
        maxScore: 20,
      },
    ],
    redlineRules: [
      {
        id: 'legacy-redline',
        title: 'Legacy redline',
        description: 'Legacy redline description.',
        severity: 'high',
      },
    ],
    documents: [
      {
        id: 'legacy-document',
        title: 'legacy-reference.docx',
        content: 'Legacy document content.',
      },
    ],
    createdAt: now - 10,
    updatedAt: now - 5,
  };
  const legacySession = {
    id: legacySessionId,
    scenarioId: legacyScenarioId,
    userId: 'u1',
    status: 'completed',
    messages: [],
    report: {
      totalScore: 18,
      maxScore: 20,
      dimensionScores: [
        {
          rubricItemId: 'legacy-rubric',
          score: 18,
          comment: 'Legacy report comment should become reason.',
        },
      ],
      redlineHits: [
        {
          ruleId: 'legacy-redline',
          severity: 'high',
          excerpt: 'Legacy risky quote.',
          comment: 'Legacy redline comment should become reason.',
        },
      ],
      summary: 'Legacy report summary.',
      generatedAt: now,
    },
    startedAt: now,
    completedAt: now,
  };

  await writeAppState({
    ...currentState,
    aiTrainingScenarios: [...(currentState.aiTrainingScenarios ?? []), scenario, legacyScenario],
    aiTrainingSessions: [...(currentState.aiTrainingSessions ?? []), session, legacySession],
  });

  const persistedState = await readAppState();
  const persistedScenario = persistedState.aiTrainingScenarios?.find((item) => item.id === scenarioId);
  const persistedLegacyScenario = persistedState.aiTrainingScenarios?.find((item) => item.id === legacyScenarioId);
  const persistedSession = persistedState.aiTrainingSessions?.find((item) => item.id === sessionId);
  const persistedLegacySession = persistedState.aiTrainingSessions?.find((item) => item.id === legacySessionId);
  assert(
    Array.isArray(persistedState.aiTrainingScenarios) && persistedScenario,
    'aiTrainingScenarios did not persist'
  );
  assert(
    persistedScenario.name === scenario.name &&
      persistedScenario.stage === scenario.stage &&
      persistedScenario.aiRole === scenario.aiRole &&
      persistedScenario.traineeTask === scenario.traineeTask &&
      persistedScenario.openingMessage === scenario.openingMessage &&
      persistedScenario.scoringRubric[0]?.name === scenario.scoringRubric[0].name &&
      persistedScenario.documents[0]?.fileName === scenario.documents[0].fileName &&
      persistedScenario.documents[0]?.fileType === scenario.documents[0].fileType &&
      persistedScenario.documents[0]?.text === scenario.documents[0].text,
    'aiTrainingScenarios did not keep approved field shape'
  );
  assert(
    Array.isArray(persistedState.aiTrainingSessions) && persistedSession,
    'aiTrainingSessions did not persist'
  );
  assert(
    persistedSession.report?.dimensionScores[0]?.name === session.report.dimensionScores[0].name &&
      persistedSession.report?.dimensionScores[0]?.reason === session.report.dimensionScores[0].reason &&
      persistedSession.report?.strengths?.[0] === session.report.strengths[0] &&
      persistedSession.report?.suggestedPhrases?.[0] === session.report.suggestedPhrases[0],
    'aiTrainingSessions did not keep approved report shape'
  );
  assert(
    persistedLegacyScenario?.name === legacyScenario.title &&
      persistedLegacyScenario.aiRole === legacyScenario.rolePrompt &&
      persistedLegacyScenario.traineeTask === legacyScenario.traineeGoal &&
      persistedLegacyScenario.openingMessage === legacyScenario.description &&
      persistedLegacyScenario.scoringRubric[0]?.name === legacyScenario.scoringRubric[0].title &&
      persistedLegacyScenario.documents[0]?.fileName === legacyScenario.documents[0].title &&
      persistedLegacyScenario.documents[0]?.fileType === 'docx' &&
      persistedLegacyScenario.documents[0]?.text === legacyScenario.documents[0].content,
    'legacy aiTrainingScenarios did not normalize to approved shape'
  );
  assert(
    persistedLegacySession?.report?.dimensionScores[0]?.reason === legacySession.report.dimensionScores[0].comment &&
      persistedLegacySession.report?.redlineHits[0]?.quote === legacySession.report.redlineHits[0].excerpt &&
      persistedLegacySession.report?.redlineHits[0]?.reason === legacySession.report.redlineHits[0].comment &&
      persistedLegacySession.report?.summary === legacySession.report.summary,
    'legacy aiTrainingSessions did not normalize report shape'
  );

  console.log('AI training state persistence smoke test passed');
} finally {
  await cleanupSmokeData();
}
