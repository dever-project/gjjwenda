import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { buildReportPrompt, hasValidAiTrainingMessages, parseReportJson } from '@/lib/ai-training/prompts';
import { readAppState } from '@/lib/server/appStateRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ValidPayload {
  scenarioId: string;
  sessionId: string;
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validatePayload(payload: unknown): { data?: ValidPayload; error?: string } {
  if (!isObject(payload)) {
    return { error: '请求体必须是 JSON 对象' };
  }

  const scenarioId = readText(payload.scenarioId);
  const sessionId = readText(payload.sessionId);

  if (!scenarioId) return { error: '缺少 scenarioId' };
  if (!sessionId) return { error: '缺少 sessionId' };

  return {
    data: {
      scenarioId,
      sessionId,
    },
  };
}

function errorResponse(error: unknown) {
  console.error('AI training report generation failed', error);
  return NextResponse.json({ error: '训练报告生成失败，请稍后重试' }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const validation = validatePayload(await request.json().catch(() => null));
    if (validation.error || !validation.data) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const state = readAppState();
    const scenario = state.aiTrainingScenarios.find(
      (item) => item.id === validation.data?.scenarioId
    );
    if (!scenario) {
      return NextResponse.json({ error: '未找到 AI 情景训练场景' }, { status: 400 });
    }

    // Current AppData persistence is the source of truth for training sessions;
    // server-owned session mutation would require replacing the existing client PUT flow.
    const session = state.aiTrainingSessions.find((item) => item.id === validation.data?.sessionId);
    if (!session) {
      return NextResponse.json({ error: '未找到 AI 情景训练会话' }, { status: 400 });
    }
    if (session.scenarioId !== validation.data.scenarioId) {
      return NextResponse.json({ error: 'AI 情景训练会话与场景不匹配' }, { status: 400 });
    }
    if (!hasValidAiTrainingMessages(session.messages)) {
      return NextResponse.json({ error: 'AI 情景训练会话消息无效' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 GEMINI_API_KEY，无法调用 AI 情景训练' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = buildReportPrompt(scenario, session.messages);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt.contents,
      config: {
        systemInstruction: prompt.systemInstruction,
        responseMimeType: 'application/json',
      },
    });
    const text = response.text?.trim() ?? '';
    if (!text) {
      throw new Error('AI_REPORT_EMPTY_RESPONSE');
    }

    return NextResponse.json({ report: parseReportJson(text) });
  } catch (error) {
    return errorResponse(error);
  }
}
