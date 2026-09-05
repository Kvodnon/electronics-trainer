/**
 * Проверка Ответа — главный шов домена: `evaluate(Задание, ответ) → вердикт`.
 * Вердикт содержит всё, что нужно UI: исход и Разбор (или решение).
 */
import type { ChoiceId, ChoiceQuestion, NumericQuestion, Task } from './task';

/** Ответ ученика на Вопрос с выбором варианта. */
export interface ChoiceAnswer {
  readonly kind: 'choice-answer';
  readonly chosenChoiceId: ChoiceId;
}

/** Ответ ученика на числовой Вопрос: уже разобранное парсером значение в базовой единице. */
export interface NumericAnswer {
  readonly kind: 'numeric-answer';
  readonly value: number;
}

/** Ответ ученика на Задание. */
export type Answer = ChoiceAnswer | NumericAnswer;

/** Разбор одного варианта в контексте проверки. */
export interface ChoiceReview {
  readonly choiceId: ChoiceId;
  readonly text: string;
  readonly isCorrect: boolean;
  readonly razbor: string;
}

/** Вердикт проверки Ответа на Вопрос с выбором варианта. */
export interface ChoiceQuestionEvaluation {
  readonly kind: 'choice-question';
  readonly outcome: 'correct' | 'incorrect';
  /** Вариант, который был выбран Ответом. */
  readonly chosenChoiceId: ChoiceId;
  /** Разбор к каждому варианту, не только к выбранному. */
  readonly reviews: readonly ChoiceReview[];
}

/** Вердикт проверки числового Ответа. */
export interface NumericQuestionEvaluation {
  readonly kind: 'numeric-question';
  readonly outcome: 'correct' | 'incorrect';
  /** Ответ ученика в базовой единице. */
  readonly answeredValue: number;
  /** Границы принятого диапазона в базовой единице (включительно). */
  readonly acceptedFrom: number;
  readonly acceptedTo: number;
  /** Эффективный допуск: задан Заданием или взят по умолчанию ±5%. */
  readonly tolerance: number;
  /** Подтверждающий Разбор — показывается при верном ответе. */
  readonly razbor: string;
  /** Пошаговое решение — показывается при неверном ответе. */
  readonly solutionSteps: readonly string[];
}

/** Вердикт проверки Задания. */
export type Evaluation = ChoiceQuestionEvaluation | NumericQuestionEvaluation;

/** Допуск числового Ответа по умолчанию: ±5%, если Задание не задало свой. */
const DEFAULT_TOLERANCE = 0.05;

export function evaluate(task: Task, answer: Answer): Evaluation {
  if (task.kind === 'choice-question' && answer.kind === 'choice-answer') {
    return evaluateChoice(task, answer);
  }
  if (task.kind === 'numeric-question' && answer.kind === 'numeric-answer') {
    return evaluateNumeric(task, answer);
  }
  throw new Error(`Ответ вида «${answer.kind}» не подходит Заданию вида «${task.kind}»`);
}

function evaluateChoice(
  question: ChoiceQuestion,
  answer: ChoiceAnswer,
): ChoiceQuestionEvaluation {
  const chosen = question.choices.find((choice) => choice.id === answer.chosenChoiceId);
  if (!chosen) {
    throw new Error(`Ответ ссылается на неизвестный вариант: «${answer.chosenChoiceId}»`);
  }

  const reviews = question.choices.map((choice) => ({
    choiceId: choice.id,
    text: choice.text,
    isCorrect: choice.id === question.correctChoiceId,
    razbor: choice.razbor,
  }));

  return {
    kind: 'choice-question',
    outcome: chosen.id === question.correctChoiceId ? 'correct' : 'incorrect',
    chosenChoiceId: chosen.id,
    reviews,
  };
}

function evaluateNumeric(
  question: NumericQuestion,
  answer: NumericAnswer,
): NumericQuestionEvaluation {
  const tolerance = question.tolerance ?? DEFAULT_TOLERANCE;
  const acceptedFrom = question.expectedValue * (1 - tolerance);
  const acceptedTo = question.expectedValue * (1 + tolerance);
  const outcome =
    answer.value >= acceptedFrom && answer.value <= acceptedTo ? 'correct' : 'incorrect';

  return {
    kind: 'numeric-question',
    outcome,
    answeredValue: answer.value,
    acceptedFrom,
    acceptedTo,
    tolerance,
    razbor: question.razbor,
    solutionSteps: question.solutionSteps,
  };
}
