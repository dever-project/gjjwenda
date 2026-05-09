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
const sessionId = `smoke-ai-training-session-${runId}`;
const now = Date.now();
const createdScenarioIds = new Set([scenarioId]);
const createdSessionIds = new Set([sessionId]);

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

  await writeAppState({
    ...currentState,
    aiTrainingScenarios: [...(currentState.aiTrainingScenarios ?? []), scenario],
    aiTrainingSessions: [...(currentState.aiTrainingSessions ?? []), session],
  });

  const persistedState = await readAppState();
  const persistedScenario = persistedState.aiTrainingScenarios?.find((item) => item.id === scenarioId);
  const persistedSession = persistedState.aiTrainingSessions?.find((item) => item.id === sessionId);
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

  console.log('AI training state persistence smoke test passed');
} finally {
  await cleanupSmokeData();
}
