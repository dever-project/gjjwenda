import { NextResponse } from 'next/server';
import type { ExamAttempt } from '@/lib/appTypes';
import { replaceExamAttempt } from '@/lib/server/appStateRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeExamAttempt(payload: unknown, attemptId: string): ExamAttempt {
  const data = payload && typeof payload === 'object' ? (payload as Partial<ExamAttempt>) : {};

  return {
    id: attemptId,
    userId: String(data.userId ?? ''),
    publishedExamId: String(data.publishedExamId ?? ''),
    status: data.status === 'completed' ? 'completed' : 'in_progress',
    answers: data.answers && typeof data.answers === 'object' ? (data.answers as ExamAttempt['answers']) : {},
    currentQuestionIndex:
      typeof data.currentQuestionIndex === 'number' && Number.isFinite(data.currentQuestionIndex)
        ? data.currentQuestionIndex
        : 0,
    score: typeof data.score === 'number' && Number.isFinite(data.score) ? data.score : 0,
    objectiveScore:
      typeof data.objectiveScore === 'number' && Number.isFinite(data.objectiveScore)
        ? data.objectiveScore
        : undefined,
    subjectiveScore:
      typeof data.subjectiveScore === 'number' && Number.isFinite(data.subjectiveScore)
        ? data.subjectiveScore
        : undefined,
    gradingStatus:
      data.gradingStatus === 'pending' || data.gradingStatus === 'completed'
        ? data.gradingStatus
        : 'not_required',
    passed: Boolean(data.passed),
    needRetake: Boolean(data.needRetake),
    redlineWrongCount:
      typeof data.redlineWrongCount === 'number' && Number.isFinite(data.redlineWrongCount)
        ? data.redlineWrongCount
        : 0,
    startedAt: typeof data.startedAt === 'number' && Number.isFinite(data.startedAt) ? data.startedAt : Date.now(),
    submittedAt:
      typeof data.submittedAt === 'number' && Number.isFinite(data.submittedAt) ? data.submittedAt : undefined,
    reviewerId: typeof data.reviewerId === 'string' && data.reviewerId.length > 0 ? data.reviewerId : undefined,
    reviewedAt: typeof data.reviewedAt === 'number' && Number.isFinite(data.reviewedAt) ? data.reviewedAt : undefined,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '考试记录保存失败';
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  try {
    const { attemptId } = await params;
    const payload = await request.json();
    const attempt = normalizeExamAttempt(payload, attemptId);
    return NextResponse.json(replaceExamAttempt(attempt));
  } catch (error) {
    return errorResponse(error);
  }
}
