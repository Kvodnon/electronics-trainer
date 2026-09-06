/**
 * Проверка Ответа — главный шов домена: `evaluate(Задание, ответ) → вердикт`.
 * Вердикт содержит всё, что нужно UI: исход и Разбор (или решение).
 */
import type { ChoiceId, ChoiceQuestion, CircuitTask, NumericQuestion, Task } from './task';
import type { CanvasState } from './canvas';
import { checkConditions, type ConditionCheck } from './circuitConditions';
import { solveDc, type DcSolution } from './simulator';

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

/** Ответ ученика на Схема-задание: собранная на Холсте схема. */
export interface CircuitAnswer {
  readonly kind: 'circuit-answer';
  readonly canvas: CanvasState;
}

/** Ответ ученика на Задание. */
export type Answer = ChoiceAnswer | NumericAnswer | CircuitAnswer;

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

/**
 * Вердикт проверки Схема-задания: все условия по решению Симулятора.
 * Разбор каждого условия — строка с измеренными числами расчёта.
 */
export interface CircuitTaskEvaluation {
  readonly kind: 'circuit-task';
  readonly outcome: 'correct' | 'incorrect';
  readonly conditionChecks: readonly ConditionCheck[];
  /** Расчёт, на котором построен вердикт: токи и напряжения собранной схемы. */
  readonly solution: DcSolution;
}

/** Вердикт проверки Задания. */
export type Evaluation = ChoiceQuestionEvaluation | NumericQuestionEvaluation | CircuitTaskEvaluation;

/**
 * Вердикт указанного вида или null. Вызывающий знает вид Задания, а TypeScript
 * не выводит вид вердикта из вида Задания — это единое место сужения типа.
 */
export function evaluationOfKind<K extends Evaluation['kind']>(
  evaluation: Evaluation | null,
  kind: K,
): Extract<Evaluation, K> | null {
  return evaluation !== null && evaluation.kind === kind
    ? (evaluation as Extract<Evaluation, K>)
    : null;
}

/** Допуск числового Ответа по умолчанию: ±5%, если Задание не задало свой. */
const DEFAULT_TOLERANCE = 0.05;

export function evaluate(task: Task, answer: Answer): Evaluation {
  if (task.kind === 'choice-question' && answer.kind === 'choice-answer') {
    return evaluateChoice(task, answer);
  }
  if (task.kind === 'numeric-question' && answer.kind === 'numeric-answer') {
    return evaluateNumeric(task, answer);
  }
  if (task.kind === 'circuit-task' && answer.kind === 'circuit-answer') {
    return evaluateCircuit(task, answer);
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

/**
 * Проверка Схема-задания: Симулятор считает токи и напряжения, условия
 * проверяются по решению. Эквивалентные схемы дают одинаковый исход.
 */
function evaluateCircuit(task: CircuitTask, answer: CircuitAnswer): CircuitTaskEvaluation {
  const solution = solveDc(answer.canvas);
  const conditionChecks = checkConditions(answer.canvas, solution, task.conditions);
  return {
    kind: 'circuit-task',
    outcome: conditionChecks.every((check) => check.passed) ? 'correct' : 'incorrect',
    conditionChecks,
    solution,
  };
}
