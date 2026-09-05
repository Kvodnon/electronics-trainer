/**
 * Типы Заданий домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Задание, Вопрос, Разбор.
 */

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
 * Вопрос — Задание с ответом без сборки схемы.
 * Этот вид — выбор варианта; числовой ввод появится отдельным типом Задания.
 */
export interface ChoiceQuestion {
  readonly kind: 'choice-question';
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly Choice[];
  readonly correctChoiceId: ChoiceId;
}
