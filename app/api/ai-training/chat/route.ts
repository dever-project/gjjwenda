import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { buildChatPrompt, hasValidAiTrainingMessages } from '@/lib/ai-training/prompts';
import type { AiTrainingMessage } from '@/lib/appTypes';
import { readAppState } from '@/lib/server/appStateRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ValidPayload {
  scenarioId: string;
  sessionId: string;
  messages: AiTrainingMessage[];
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
  if (!hasValidAiTrainingMessages(payload.messages)) {
    return { error: 'messages 必须包含有效的 ai 或 trainee 消息' };
  }

  return {
    data: {
      scenarioId,
      sessionId,
      messages: payload.messages as AiTrainingMessage[],
    },
  };
}

function errorResponse(error: unknown) {
  console.error('AI training chat generation failed', error);
  return NextResponse.json({ error: 'AI 回复生成失败，请稍后重试' }, { status: 500 });
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
    const prompt = buildChatPrompt(scenario, session.messages);
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt.contents,
      config: {
        systemInstruction: prompt.systemInstruction,
      },
    });
    const content = response.text?.trim() ?? '';
    if (!content) {
      throw new Error('AI_CHAT_EMPTY_RESPONSE');
    }
    const createdAt = Date.now();

    return NextResponse.json({
      message: {
        id: `msg_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
        role: 'ai',
        content,
        createdAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
