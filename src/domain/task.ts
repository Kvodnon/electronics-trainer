/**
 * Типы Заданий домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Задание, Вопрос, Разбор.
 */
import type { QuantityUnit } from './quantity';
import type { ComponentKind } from './canvas';

/** Идентификатор Варианта ответа. Уникален внутри одного Вопроса. */
export type ChoiceId = string;

/**
 * Лестница Подсказок (CONTEXT.md: Подсказка) — ступени помощи внутри Задания.
 * Ступень 1 — наводящий вопрос, ступень 2 — почти решение; готовый ответ
 * не выдаётся ни на какой ступени (это договорённость о контенте).
 */
export interface TaskHints {
  /** Ступень 1: наводящий вопрос, подталкивающий к нужной мысли. */
  readonly question: string;
  /** Ступень 2: почти решение — путь к ответу без самого ответа. */
  readonly almostSolution: string;
}

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
  /** Лестница Подсказок; без неё Задание показывается без ступени помощи. */
  readonly hints?: TaskHints;
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
  /** Лестница Подсказок; без неё Задание показывается без ступени помощи. */
  readonly hints?: TaskHints;
}

/** Диапазон измерения в базовой единице (А, В, Ом, Вт), границы включительно. */
export interface MeasurementRange {
  readonly from: number;
  readonly to: number;
}

/**
 * Условие Схема-задания: декларативное измерение по решению Симулятора
 * или структурное требование («использован светодиод»). Эквивалентные
 * по физике схемы проходят проверку одинаково — сравнения с эталоном нет
 * (ADR-0001). Условие-измерение выполнено, если его границам отвечает
 * хотя бы один Компонент указанного вида.
 */
export type CircuitCondition =
  | {
      readonly kind: 'component-used';
      readonly componentKind: ComponentKind;
      /** Минимум штук; по умолчанию 1. */
      readonly min?: number;
      /** Максимум штук; по умолчанию не ограничен. */
      readonly max?: number;
    }
  | {
      readonly kind: 'current-through';
      readonly componentKind: ComponentKind;
      /** Ток через Компонент, А. */
      readonly range: MeasurementRange;
    }
  | {
      readonly kind: 'voltage-across';
      readonly componentKind: ComponentKind;
      /** Напряжение на Компоненте, В. */
      readonly range: MeasurementRange;
    }
  | {
      readonly kind: 'power-of';
      readonly componentKind: ComponentKind;
      /** Мощность на Компоненте, Вт. */
      readonly range: MeasurementRange;
    }
  | {
      readonly kind: 'component-active';
      /** Активное состояние: лампочка горит, моторчик крутится. */
      readonly componentKind: 'lamp' | 'motor';
      readonly active: boolean;
    };

/**
 * Схема-задание: ученик собирает схему из Компонентов на Холсте; проверяется
 * Симулятором по измерениям, а не по совпадению с эталоном.
 */
export interface CircuitTask {
  readonly kind: 'circuit-task';
  readonly id: string;
  readonly prompt: string;
  /** Палитра Задания: Компоненты, доступные ученику на Холсте. */
  readonly palette: readonly ComponentKind[];
  /** Условия-измерения: все должны выполняться по решению Симулятора. */
  readonly conditions: readonly CircuitCondition[];
  /**
   * Экзамен: финальное Схема-задание Модуля, объединяющее его темы; закрыто,
   * пока не пройдены все остальные Задания Модуля (правило живёт в домене Курса).
   */
  readonly isExam?: boolean;
  /** Лестница Подсказок; без неё Задание показывается без ступени помощи. */
  readonly hints?: TaskHints;
}

/** Задание — единица работы ученика; виды добавляются по мере Модулей. */
export type Task = ChoiceQuestion | NumericQuestion | CircuitTask;
