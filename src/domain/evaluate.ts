/**
 * Проверка Ответа — главный шов домена: `evaluate(Задание, ответ) → вердикт`.
 * Вердикт содержит всё, что нужно UI: исход и Разбор к каждому варианту.
 */
import type { ChoiceId, ChoiceQuestion } from './task';

/** Ответ ученика на Вопрос с выбором варианта. */
export interface ChoiceAnswer {
  readonly chosenChoiceId: ChoiceId;
}

/** Разбор одного варианта в контексте проверки. */
export interface ChoiceReview {
  readonly choiceId: ChoiceId;
  readonly text: string;
  readonly isCorrect: boolean;
  readonly explanation: string;
}

/** Вердикт проверки Ответа на Вопрос с выбором. */
export interface ChoiceQuestionEvaluation {
  readonly outcome: 'correct' | 'incorrect';
  /** Разбор к каждому варианту, не только к выбранному. */
  readonly reviews: readonly ChoiceReview[];
}

export function evaluate(
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
    explanation: choice.explanation,
  }));

  return {
    outcome: chosen.id === question.correctChoiceId ? 'correct' : 'incorrect',
    reviews,
  };
}
