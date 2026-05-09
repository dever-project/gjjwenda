const baseUrl = process.env.APP_BASE_URL ?? process.env.TEST_BASE_URL ?? 'http://localhost:3000';

async function readJson(response) {
  const payload = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, payload };
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

async function main() {
  await expectInvalidPayloadError('/api/ai-training/chat');
  await expectInvalidPayloadError('/api/ai-training/report');

  console.log('AI training API contract smoke test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
