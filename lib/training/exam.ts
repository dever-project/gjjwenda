import type {
  AnswerRecord,
  AttemptGradingStatus,
  ExamAttempt,
  ExamConfig,
  PublishedExam,
  Question,
  RedlinePolicy,
} from '@/lib/appTypes';

const MANUAL_TYPES = new Set(['简答', '情景', '论述', '话术改写']);
const REFERENCE_LABEL_PATTERN = /(答案要点|评分标准|参考答案|推荐改写|解析)[：:：]*/g;
const KEYWORD_PREFIX_PATTERN = /^([A-Da-d][.、．]\s*|[0-9一二三四五六七八九十]+[.、）)]\s*)/;
const AUTO_REVIEWER_ID = 'system_auto';

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeSearchText(value: unknown) {
  return normalizeText(value).replace(/\s+/g, '').toLowerCase();
}

function normalizeChoice(value: unknown) {
  return normalizeText(value).replace(/[^A-Da-d]/g, '').toUpperCase();
}

function normalizeMultiChoice(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(normalizeChoice).join('').split('').sort().join('');
  }

  return normalizeChoice(value).split('').sort().join('');
}

function normalizeJudge(value: unknown) {
  const text = normalizeText(value).toLowerCase();
  if (['a', '对', '正确', 'true', 'yes', '是'].includes(text)) return 'true';
  if (['b', '错', '错误', 'false', 'no', '否'].includes(text)) return 'false';
  return text;
}

export function isManualQuestion(question: Question) {
  return question.gradingMode === 'manual' || MANUAL_TYPES.has(String(question.type));
}

export function getQuestionRawScore(question: Question, fallback = 1) {
  return typeof question.score === 'number' && Number.isFinite(question.score) && question.score > 0
    ? question.score
    : fallback;
}

export function getExamQuestions(exam: PublishedExam, questions: Question[]) {
  return exam.questionIds
    .map((id) => questions.find((question) => question.id === id))
    .filter(Boolean) as Question[];
}

export function getExamRawTotal(examQuestions: Question[]) {
  const total = examQuestions.reduce((sum, question) => sum + getQuestionRawScore(question), 0);
  return total > 0 ? total : examQuestions.length || 1;
}

function scaleScore(rawScore: number, rawTotal: number) {
  if (rawTotal <= 0) {
    return 0;
  }

  return Math.round((rawScore / rawTotal) * 100);
}

export function getQuestionScaledScore(question: Question, rawTotal: number) {
  return (getQuestionRawScore(question) / rawTotal) * 100;
}

export function isObjectiveAnswerCorrect(question: Question, userAnswer: string | string[] | undefined) {
  if (userAnswer === undefined || userAnswer === null || userAnswer === '') {
    return false;
  }

  const correctAnswer = question.correctAnswer || question.answerKey || '';
  const type = String(question.type);

  if (type === '多选') {
    return normalizeMultiChoice(userAnswer) === normalizeMultiChoice(correctAnswer);
  }

  if (type === '判断') {
    return normalizeJudge(userAnswer) === normalizeJudge(correctAnswer);
  }

  if (type === '填空') {
    return normalizeText(userAnswer) === normalizeText(correctAnswer);
  }

  return normalizeChoice(userAnswer) === normalizeChoice(correctAnswer);
}

function isAnswerFilled(answer: string | string[] | undefined) {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }

  return typeof answer === 'string' && answer.trim().length > 0;
}

function hasChoiceOptions(question: Question) {
  return Boolean(question.optionA || question.optionB || question.optionC || question.optionD);
}

function canScoreAsChoice(question: Question) {
  const answer = normalizeChoice(question.correctAnswer || question.answerKey || '');
  return hasChoiceOptions(question) && answer.length > 0 && /^[A-D]+$/.test(answer);
}

function getManualReferenceText(question: Question) {
  return normalizeText(question.answerKey || question.rubric || question.correctAnswer || question.explanation);
}

function readReferenceKeywords(question: Question) {
  const reference = getManualReferenceText(question);
  if (!reference) {
    return [];
  }

  return Array.from(
    new Set(
      reference
        .replace(REFERENCE_LABEL_PATTERN, '\n')
        .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '\n')
        .split(/[\n\r,，;；。.!！?？、|\/]+/)
        .map((item) => item.replace(KEYWORD_PREFIX_PATTERN, '').trim())
        .filter((item) => item.length >= 2)
    )
  ).slice(0, 16);
}

function roundScore(score: number) {
  return Math.round(score * 10) / 10;
}

function autoGradeManualAnswer(question: Question, userAnswer: string | string[] | undefined, maxScore: number) {
  if (!isAnswerFilled(userAnswer)) {
    return {
      score: 0,
      isCorrect: false,
      comment: '系统自动评分：未作答，记 0 分。',
    };
  }

  if (canScoreAsChoice(question)) {
    const isCorrect = isObjectiveAnswerCorrect(question, userAnswer);
    return {
      score: isCorrect ? maxScore : 0,
      isCorrect,
      comment: '系统自动评分：按选项答案自动判定。',
    };
  }

  const keywords = readReferenceKeywords(question);
  if (keywords.length === 0) {
    return null;
  }

  const answerText = normalizeSearchText(Array.isArray(userAnswer) ? userAnswer.join(' ') : userAnswer);
  const matchedKeywords = keywords.filter((keyword) => answerText.includes(normalizeSearchText(keyword)));
  const coverage = matchedKeywords.length / keywords.length;
  const score = roundScore(maxScore * coverage);

  return {
    score,
    isCorrect: score >= maxScore,
    comment: `系统自动评分：命中 ${matchedKeywords.length}/${keywords.length} 个参考要点。`,
  };
}

function pickQuestions(pool: Question[], count: number) {
  return [...pool].sort(() => 0.5 - Math.random()).slice(0, Math.max(0, count));
}

export function selectQuestionsForExam(config: ExamConfig, questions: Question[]) {
  const selected = new Map<string, Question>();

  if (config.questionRules && config.questionRules.length > 0) {
    config.questionRules.forEach((rule) => {
      const pool = questions.filter((question) => {
        const categoryMatched = !rule.categoryId || question.categoryId === rule.categoryId;
        const typeMatched = !rule.questionType || question.type === rule.questionType;
        return categoryMatched && typeMatched;
      });

      pickQuestions(pool, rule.count).forEach((question) => selected.set(question.id, question));
    });
  }

  if (selected.size === 0) {
    let pool = questions;

    if (config.categoryIds && config.categoryIds.length > 0) {
      pool = pool.filter((question) => question.categoryId && config.categoryIds?.includes(question.categoryId));
    }

    const groupMatched = pool.filter(
      (question) =>
        config.name.includes(question.examGroup) ||
        question.examGroup.includes(config.name.replace(/测$/, '').replace(/综合$/, ''))
    );

    if (groupMatched.length > 0) {
      pool = groupMatched;
    }

    if (config.typeCombination && !['综合', '所有'].includes(config.typeCombination)) {
      const allowedTypes = config.typeCombination.split('+').map((item) => item.trim());
      pool = pool.filter((question) => allowedTypes.includes(String(question.type)));
    }

    pickQuestions(pool, config.suggestedCount || pool.length).forEach((question) =>
      selected.set(question.id, question)
    );
  }

  return [...selected.values()];
}

export function createPublishedExam(config: ExamConfig, questions: Question[]): PublishedExam | null {
  const selectedQuestions = selectQuestionsForExam(config, questions);
  if (selectedQuestions.length === 0) {
    return null;
  }

  return {
    id: `pe_${Date.now()}`,
    examConfigId: config.id,
    name: config.name,
    stage: config.stage,
    categoryIds: config.categoryIds ?? [],
    questionRules: config.questionRules ?? [],
    passScore: config.passScore,
    questionIds: selectedQuestions.map((question) => question.id),
    totalScore: 100,
    durationMinutes: config.durationMinutes,
    requiresLearning: false,
    redlinePolicy: config.redlinePolicy ?? 'fail_on_any',
    status: 'active',
    createdAt: Date.now(),
  };
}

export function gradeAttempt(
  attempt: ExamAttempt,
  exam: PublishedExam,
  questions: Question[],
  policy: RedlinePolicy = exam.redlinePolicy ?? 'fail_on_any'
): ExamAttempt {
  const examQuestions = getExamQuestions(exam, questions);
  const rawTotal = getExamRawTotal(examQuestions);
  let objectiveRawScore = 0;
  let subjectiveScore = 0;
  let redlineWrongCount = 0;
  let hasPendingManualQuestions = false;
  let hasAutoReviewedManualQuestions = false;
  const answers: Record<string, AnswerRecord> = { ...attempt.answers };

  examQuestions.forEach((question) => {
    const existingAnswer = answers[question.id];
    const userAnswer = existingAnswer?.userAnswer;
    const maxScore = getQuestionScaledScore(question, rawTotal);

    if (isManualQuestion(question)) {
      const autoReview = autoGradeManualAnswer(question, userAnswer, maxScore);
      if (!autoReview) {
        hasPendingManualQuestions = true;
        answers[question.id] = {
          questionId: question.id,
          userAnswer: userAnswer ?? '',
          isCorrect: false,
          score: 0,
          maxScore,
          gradingMode: 'manual',
          isRedlineWrong: false,
        };
        return;
      }

      hasAutoReviewedManualQuestions = true;
      subjectiveScore += autoReview.score;
      if (!autoReview.isCorrect && question.isRedline) {
        redlineWrongCount += 1;
      }

      answers[question.id] = {
        questionId: question.id,
        userAnswer: userAnswer ?? '',
        isCorrect: autoReview.isCorrect,
        score: autoReview.score,
        maxScore,
        gradingMode: 'manual',
        reviewerScore: autoReview.score,
        reviewerComment: autoReview.comment,
        isRedlineWrong: !autoReview.isCorrect && question.isRedline,
      };
      return;
    }

    const isCorrect = isObjectiveAnswerCorrect(question, userAnswer);
    if (isCorrect) {
      objectiveRawScore += getQuestionRawScore(question);
    } else if (question.isRedline) {
      redlineWrongCount += 1;
    }

    answers[question.id] = {
      questionId: question.id,
      userAnswer: userAnswer ?? '',
      isCorrect,
      score: isCorrect ? maxScore : 0,
      maxScore,
      gradingMode: 'auto',
      isRedlineWrong: !isCorrect && question.isRedline,
    };
  });

  const objectiveScore = scaleScore(objectiveRawScore, rawTotal);
  const gradingStatus: AttemptGradingStatus = hasPendingManualQuestions ? 'pending' : 'completed';
  const score = Math.min(100, Math.round(objectiveScore + subjectiveScore));
  const redlineFailed = policy === 'fail_on_any' && redlineWrongCount > 0;

  return {
    ...attempt,
    status: 'completed' as const,
    answers,
    score,
    objectiveScore,
    subjectiveScore: Math.round(subjectiveScore),
    gradingStatus,
    passed: gradingStatus === 'completed' && !redlineFailed && score >= exam.passScore,
    needRetake: redlineFailed || (gradingStatus === 'completed' && score < exam.passScore),
    redlineWrongCount,
    submittedAt: Date.now(),
    reviewerId: gradingStatus === 'completed' && hasAutoReviewedManualQuestions ? AUTO_REVIEWER_ID : attempt.reviewerId,
    reviewedAt: gradingStatus === 'completed' && hasAutoReviewedManualQuestions ? Date.now() : attempt.reviewedAt,
  };
}

export function finalizeManualReview(
  attempt: ExamAttempt,
  exam: PublishedExam,
  questions: Question[],
  reviewerId: string,
  reviewedAnswers: Record<string, { score: number; comment?: string }>
) {
  const examQuestions = getExamQuestions(exam, questions);
  let subjectiveScore = 0;
  let redlineWrongCount = 0;
  const answers: Record<string, AnswerRecord> = { ...attempt.answers };

  examQuestions.forEach((question) => {
    const answer = answers[question.id];
    if (!answer) {
      return;
    }

    if (isManualQuestion(question)) {
      const maxScore = answer.maxScore ?? getQuestionScaledScore(question, getExamRawTotal(examQuestions));
      const reviewed = reviewedAnswers[question.id] ?? { score: 0 };
      const safeScore = Math.min(maxScore, Math.max(0, reviewed.score || 0));
      subjectiveScore += safeScore;
      const isCorrect = safeScore >= maxScore;
      if (!isCorrect && question.isRedline) {
        redlineWrongCount += 1;
      }

      answers[question.id] = {
        ...answer,
        isCorrect,
        score: safeScore,
        reviewerScore: safeScore,
        reviewerComment: reviewed.comment,
        isRedlineWrong: !isCorrect && question.isRedline,
      };
    } else if (answer.isRedlineWrong) {
      redlineWrongCount += 1;
    }
  });

  const objectiveScore = attempt.objectiveScore ?? 0;
  const score = Math.min(100, Math.round(objectiveScore + subjectiveScore));
  const redlineFailed = (exam.redlinePolicy ?? 'fail_on_any') === 'fail_on_any' && redlineWrongCount > 0;

  return {
    ...attempt,
    answers,
    score,
    objectiveScore,
    subjectiveScore: Math.round(subjectiveScore),
    gradingStatus: 'completed' as const,
    passed: !redlineFailed && score >= exam.passScore,
    needRetake: redlineFailed || score < exam.passScore,
    redlineWrongCount,
    reviewerId,
    reviewedAt: Date.now(),
  };
}
