/**
 * Типы Заданий домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Задание, Вопрос, Разбор.
 */
import type { QuantityUnit } from './quantity';
import type { ComponentKind } from './canvas';
import type { Bit } from './booleanEngine';
import type { DigitalKind } from './digitalCanvas';

/** Идентификатор Варианта ответа. Уникален внутри одного Вопроса. */
export type ChoiceId = string;

/**
 * Лестница Подсказок (CONTEXT.md: Подсказка) — ступени помощи внутри Задания.
 * Ступень 1 — наводящий вопрос, ступень 2 — почти решение; готовый ответ
 * не выдаётся ни на какой ступени (это договорённость о контенте).
 */
export interface TaskHints {
  readonly question: string;
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
  readonly hints?: TaskHints;
}

/**
 * Диапазон измерения в базовой единице (А, В, Ом, Вт, с, Ф), границы включительно.
 */
export interface MeasurementRange {
  readonly from: number;
  readonly to: number;
}

/**
 * План переходного Симулятора (CONTEXT.md: Симулятор): сколько секунд
 * моделируется и когда переключаются коммутаторы. До switchToggleTime
 * выключатели и ключи стоят в нарисованном состоянии; в этот момент каждый
 * переключается — разомкнутый замыкается, замкнутый размыкается.
 * Конденсаторы стартуют незаряженными.
 */
export interface TransientPlan {
  /** Длительность моделирования, с. */
  readonly duration: number;
  /** Момент переключения всех коммутаторов, с; нет — коммутаторы не трогаются. */
  readonly switchToggleTime?: number;
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
      /** Активное состояние: лампочка горит, моторчик крутится, светодиод светится, зуммер звучит. */
      readonly componentKind: 'lamp' | 'motor' | 'led' | 'buzzer';
      readonly active: boolean;
    }
  | {
      /** Напряжение на движке потенциометра (относительно вывода 2), В — выход делителя. */
      readonly kind: 'wiper-voltage';
      readonly componentKind: 'potentiometer';
      readonly range: MeasurementRange;
    }
  | {
      /** Постоянная времени RC-цепи, с: измеряется переходным Симулятором. */
      readonly kind: 'rc-time-constant';
      readonly componentKind: 'capacitor';
      readonly range: MeasurementRange;
    }
  | {
      /** Напряжение на конденсаторе в момент времени, В (из кривой Симуляции). */
      readonly kind: 'capacitor-voltage-at';
      readonly componentKind: 'capacitor';
      /** Момент от начала Симуляции, с. */
      readonly time: number;
      readonly range: MeasurementRange;
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
   * План переходного режима: Задание проверяется во времени (кривые
   * напряжения конденсаторов), а условия-измерения во времени сверяются
   * с ним. Без плана Задание проверяется по установившемуся режиму.
   */
  readonly transient?: TransientPlan;
  /**
   * Экзамен: финальное Схема-задание Модуля, объединяющее его темы; закрыто,
   * пока не пройдены все остальные Задания Модуля (правило живёт в домене Курса).
   */
  readonly isExam?: boolean;
  readonly hints?: TaskHints;
}

/**
 * Строка требуемой таблицы истинности: набор входов и ожидаемые уровни
 * выходов. Биты стоят в порядке Кнопок-входов и Индикаторов-выходов.
 */
export interface LogicTableRow {
  readonly inputs: readonly Bit[];
  readonly outputs: readonly Bit[];
}

/**
 * Цифровое Схема-задание: ученик собирает логику из Компонентов цифрового
 * Холста; проверка прогоняет схему по всем строкам требуемой таблицы
 * истинности (ADR-0002), поэтому эквивалентные схемы проходят одинаково.
 * Входы — Кнопки в порядке установки, выходы — Индикаторы; проверка
 * требует их ровно по числу в Задании.
 */
export interface LogicTask {
  readonly kind: 'logic-task';
  readonly id: string;
  readonly prompt: string;
  /** Палитра Задания: цифровые Компоненты, доступные ученику. */
  readonly palette: readonly DigitalKind[];
  /** Число входов (Кнопок) и выходов (Индикаторов). */
  readonly inputs: number;
  readonly outputs: number;
  /**
   * Требуемая таблица истинности. У комбинационной схемы строки перебирают
   * все наборы входов; у триггера набор может повторяться — «держит»
   * проверяется от состояния предыдущей строки, поэтому порядок строк значим.
   */
  readonly truthTable: readonly LogicTableRow[];
  /**
   * Экзамен: финальное цифровое Схема-задание Модуля (как у аналогового,
   * правило открытия живёт в домене Курса).
   */
  readonly isExam?: boolean;
  readonly hints?: TaskHints;
}

/** Задание — единица работы ученика; виды добавляются по мере Модулей. */
export type Task = ChoiceQuestion | NumericQuestion | CircuitTask | LogicTask;
