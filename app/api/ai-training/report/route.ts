import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { buildReportPrompt, parseReportJson } from '@/lib/ai-training/prompts';
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
  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { error: 'messages 不能为空' };
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
  const message = error instanceof Error ? error.message : 'AI 情景训练报告生成失败';
  return NextResponse.json({ error: `AI 情景训练报告生成失败：${message}` }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const validation = validatePayload(await request.json().catch(() => null));
    if (validation.error || !validation.data) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const scenario = readAppState().aiTrainingScenarios.find(
      (item) => item.id === validation.data?.scenarioId
    );
    if (!scenario) {
      return NextResponse.json({ error: '未找到 AI 情景训练场景' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 GEMINI_API_KEY，无法调用 AI 情景训练' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildReportPrompt(scenario, validation.data.messages),
    });
    const text = response.text?.trim() ?? '';

    return NextResponse.json({ report: parseReportJson(text) });
  } catch (error) {
    return errorResponse(error);
  }
}
