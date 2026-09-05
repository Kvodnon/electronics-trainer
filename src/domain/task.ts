/**
 * Типы Заданий домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Задание, Вопрос, Разбор.
 */
import type { QuantityUnit } from './quantity';

/** Идентификатор Варианта ответа. Уникален внутри одного Вопроса. */
export type ChoiceId = string;

/**
 * Вариант ответа Вопроса с выбором.
 * `razbor` — Разбор: для верного варианта — почему он верен,
 * для неверного — какая ошибка мышления за ним стоит.
 */
export interface Choice {
  readonly id: ChoiceId;
  readonly text: string;
  readonly razbor: string;
}

/**
 * Вопрос с выбором варианта — Задание с ответом без сборки схемы.
 * Числовой ввод — отдельный вид `NumericQuestion`.
 */
export interface ChoiceQuestion {
  readonly kind: 'choice-question';
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly Choice[];
  readonly correctChoiceId: ChoiceId;
}

/**
 * Вопрос с числовым ответом («посчитай ток»).
 * `expectedValue` — эталон в базовой единице `unit`;
 * `tolerance` — относительный допуск (0.05 = ±5%), по умолчанию ±5%;
 * `razbor` — подтверждающий Разбор после верного ответа;
 * `solutionSteps` — пошаговое решение после неверного.
 */
export interface NumericQuestion {
  readonly kind: 'numeric-question';
  readonly id: string;
  readonly prompt: string;
  readonly unit: QuantityUnit;
  readonly expectedValue: number;
  readonly tolerance?: number;
  readonly razbor: string;
  readonly solutionSteps: readonly string[];
}

/** Задание — единица работы ученика; виды добавляются по мере Модулей. */
export type Task = ChoiceQuestion | NumericQuestion;
