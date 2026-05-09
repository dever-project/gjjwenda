const baseUrl = process.env.APP_BASE_URL ?? process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const appStateEndpoint = new URL('/api/app-state', baseUrl);

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
}

async function readAppState() {
  const result = await readJson(await fetch(appStateEndpoint, { method: 'GET' }));
  if (!result.ok) {
    throw new Error('failed to read app state');
  }

  return result.payload;
}

async function writeAppState(data) {
  const result = await readJson(await fetch(appStateEndpoint, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }));
  if (!result.ok) {
    throw new Error('failed to write app state');
  }
}

async function expectInvalidPayloadError(path) {
  const result = await readJson(await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ scenarioId: '', sessionId: '', messages: [] }),
  }));

  if (result.ok || !result.payload?.error) {
    throw new Error(`${path} should reject invalid payload with an error message`);
  }
}

async function expectContractError(path, body, message) {
  const result = await readJson(await fetch(new URL(path, baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }));

  if (result.ok || !result.payload?.error) {
    throw new Error(message);
  }
}

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const scenarioId = `smoke-ai-training-flow-scenario-${runId}`;
const mismatchScenarioId = `smoke-ai-training-flow-mismatch-scenario-${runId}`;
const mismatchSessionId = `smoke-ai-training-flow-session-${runId}`;
const now = Date.now();
const validMessages = [
  {
    id: `smoke-ai-training-flow-message-${runId}`,
    role: 'trainee',
    content: '我想先了解一下您的基本情况。',
    createdAt: now,
  },
];

function createScenario(id) {
  return {
    id,
    name: 'Smoke Test AI Training Flow Scenario',
    stage: 'Smoke Test',
    description: 'Verifies AI training API contract errors.',
    difficulty: '基础',
    aiRole: 'Act as a customer in a training conversation.',
    traineeTask: 'Collect context.',
    openingMessage: 'I need help understanding my case.',
    scoringRubric: [
      {
        id: 'smoke-rubric',
        name: 'Context collection',
        description: 'Asks relevant context questions.',
        maxScore: 100,
      },
    ],
    redlineRules: [],
    documents: [],
    status: 'published',
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  await expectInvalidPayloadError('/api/ai-training/chat');
  await expectInvalidPayloadError('/api/ai-training/report');

  const currentState = await readAppState();

  try {
    await writeAppState({
      ...currentState,
      aiTrainingScenarios: [
        ...(currentState.aiTrainingScenarios ?? []),
        createScenario(scenarioId),
        createScenario(mismatchScenarioId),
      ],
      aiTrainingSessions: [
        ...(currentState.aiTrainingSessions ?? []),
        {
          id: mismatchSessionId,
          scenarioId: mismatchScenarioId,
          userId: 'u1',
          status: 'in_progress',
          messages: validMessages,
          startedAt: now,
        },
      ],
    });

    for (const path of ['/api/ai-training/chat', '/api/ai-training/report']) {
      await expectContractError(
        path,
        { scenarioId, sessionId: `missing-session-${runId}`, messages: validMessages },
        `${path} should reject missing session before checking GEMINI_API_KEY`
      );
      await expectContractError(
        path,
        { scenarioId, sessionId: mismatchSessionId, messages: validMessages },
        `${path} should reject mismatched session before checking GEMINI_API_KEY`
      );
    }

    console.log('AI training API contract smoke test passed');
  } finally {
    const latestState = await readAppState();
    await writeAppState({
      ...latestState,
      aiTrainingScenarios: (latestState.aiTrainingScenarios ?? []).filter(
        (scenario) => scenario.id !== scenarioId && scenario.id !== mismatchScenarioId
      ),
      aiTrainingSessions: (latestState.aiTrainingSessions ?? []).filter(
        (session) => session.id !== mismatchSessionId
      ),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
