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
    title: 'Smoke Test AI Training Scenario',
    description: 'Verifies AI training scenario persistence.',
    difficulty: '基础',
    status: 'draft',
    rolePrompt: 'Act as a customer in a training conversation.',
    traineeGoal: 'Collect customer context and avoid redline phrases.',
    scoringRubric: [
      {
        id: 'smoke-rubric',
        title: 'Context collection',
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
        title: 'Smoke Test Reference',
        content: 'Use this document to verify JSON persistence.',
      },
    ],
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
      maxScore: 10,
      dimensionScores: [
        {
          rubricItemId: 'smoke-rubric',
          score: 8,
          comment: 'Asked useful opening questions.',
        },
      ],
      redlineHits: [],
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
  assert(
    Array.isArray(persistedState.aiTrainingScenarios) &&
      persistedState.aiTrainingScenarios.some((item) => item.id === scenarioId),
    'aiTrainingScenarios did not persist'
  );
  assert(
    Array.isArray(persistedState.aiTrainingSessions) &&
      persistedState.aiTrainingSessions.some((item) => item.id === sessionId),
    'aiTrainingSessions did not persist'
  );

  console.log('AI training state persistence smoke test passed');
} finally {
  await cleanupSmokeData();
}
