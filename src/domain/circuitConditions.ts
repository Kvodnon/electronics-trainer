/**
 * Проверка условий Схема-задания по решению Симулятора (ADR-0001): каждое
 * условие-измерение превращается в строку Разбора с измеренными числами.
 * Эквивалентные схемы проходят одинаково — сравнивается физика, не эталон.
 * Чистый TypeScript без DOM.
 */
import type { CanvasState } from './canvas';
import type { CircuitCondition } from './task';
import { formatQuantity, formatQuantityRange, type QuantityUnit } from './quantity';
import { COMPONENT_LEXIS, cap, type ComponentLexis } from './componentLexis';
import {
  LAMP_LIT_POWER,
  LED_LIT_CURRENT,
  MOTOR_SPIN_POWER,
  isLampLit,
  isLedLit,
  isMotorSpinning,
  readingsOfKind,
  type ComponentReading,
  type DcSolution,
} from './simulator';

/**
 * Проверка одного условия: исход и готовая строка Разбора с числами расчёта.
 * `componentId`/`measured` — Компонент, на показании которого построена строка,
 * и само измерение: по ним Диагноз указывает место ошибки для подсветки.
 */
export interface ConditionCheck {
  readonly condition: CircuitCondition;
  readonly passed: boolean;
  readonly text: string;
  readonly componentId?: string;
  readonly measured?: number;
}

/**
 * Проверяет все условия Задания. Схема без Компонентов честно проваливает
 * любое условие — Разбор объяснит, чего не хватает.
 */
export function checkConditions(
  canvas: CanvasState,
  solution: DcSolution,
  conditions: readonly CircuitCondition[],
): readonly ConditionCheck[] {
  return conditions.map((condition) => {
    switch (condition.kind) {
      case 'component-used':
        return checkComponentUsed(canvas, condition);
      case 'current-through':
      case 'voltage-across':
      case 'power-of':
        return checkMeasurement(solution, condition, MEASUREMENT_TRAITS[condition.kind]);
      case 'component-active':
        return checkComponentActive(solution, condition);
    }
  });
}

/** Какое показание Компонента сверяется с диапазоном и как оно называется в Разборе. */
interface MeasurementTraits {
  /** Поле показания Компонента. */
  readonly field: 'current' | 'voltage' | 'power';
  /** Единица величины для записи с приставкой. */
  readonly unit: QuantityUnit;
  /** Заголовок измерения по лексике вида. */
  readonly title: (lexis: ComponentLexis) => string;
}

const MEASUREMENT_TRAITS: Record<'current-through' | 'voltage-across' | 'power-of', MeasurementTraits> = {
  'current-through': {
    field: 'current',
    unit: 'А',
    title: (lexis) => `Ток через ${lexis.accusative}`,
  },
  'voltage-across': {
    field: 'voltage',
    unit: 'В',
    title: (lexis) => `Напряжение на ${lexis.prepositional}`,
  },
  'power-of': {
    field: 'power',
    unit: 'Вт',
    title: (lexis) => `Мощность ${lexis.genitive}`,
  },
};

/** «Использован Компонент»: количество штук в границах [min, max]. */
function checkComponentUsed(
  canvas: CanvasState,
  condition: Extract<CircuitCondition, { kind: 'component-used' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const count = canvas.components.filter((c) => c.kind === condition.componentKind).length;
  const min = condition.min ?? 1;
  const max = condition.max ?? Number.POSITIVE_INFINITY;
  const phrase =
    min === max
      ? `ровно ${min} шт.`
      : max === Number.POSITIVE_INFINITY
        ? `не менее ${min} шт.`
        : min === 0
          ? `не более ${max} шт.`
          : `от ${min} до ${max} шт.`;
  return {
    condition,
    passed: count >= min && count <= max,
    text: `${cap(lexis.nominative)} на схеме: ${count} шт. (по условию: ${phrase})`,
  };
}

/** Проверка условия-измерения: годится любой Компонент вида в границах. */
function checkMeasurement(
  solution: DcSolution,
  condition: Extract<CircuitCondition, { kind: 'current-through' | 'voltage-across' | 'power-of' }>,
  traits: MeasurementTraits,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const readings = readingsOfKind(solution, condition.componentKind);

  if (readings.length === 0) {
    return {
      condition,
      passed: false,
      text: `${traits.title(lexis)} не измерен: на схеме нет ${lexis.genitivePlural}.`,
    };
  }

  // Компоненты М1 симметричны: знак тока и напряжения — артефакт ориентации
  // символа на Холсте, условие проверяет модуль величины
  const valueOf = (reading: ComponentReading): number => Math.abs(reading[traits.field]);
  const inRange = (reading: ComponentReading): boolean => {
    const value = valueOf(reading);
    return value >= condition.range.from && value <= condition.range.to;
  };
  // в Разбор — попавшее в границы показание; если таких нет, ближайшее к границам
  const distance = (reading: ComponentReading): number => {
    const value = valueOf(reading);
    if (value < condition.range.from) return condition.range.from - value;
    if (value > condition.range.to) return value - condition.range.to;
    return 0;
  };
  const candidate =
    readings.find(inRange) ?? readings.reduce((best, reading) => (distance(reading) < distance(best) ? reading : best));

  const bounds = formatQuantityRange(condition.range.from, condition.range.to, traits.unit);
  return {
    condition,
    passed: readings.some(inRange),
    text: `${traits.title(lexis)} — ${formatQuantity(valueOf(candidate), traits.unit)}, ${
      inRange(candidate) ? 'в границах' : 'вне границ'
    } условия (${bounds}).`,
    componentId: candidate.componentId,
    measured: valueOf(candidate),
  };
}

/** Какая величина и какой порог стоят за активным состоянием Компонента. */
interface ActiveTraits {
  /** Показание, которое сверяется с порогом (у светодиода — прямой ток). */
  readonly valueOf: (reading: ComponentReading) => number;
  /** Единица величины для записи с приставкой. */
  readonly unit: QuantityUnit;
  /** Имя величины в строке Разбора. */
  readonly valueName: string;
  /** Порог срабатывания. */
  readonly threshold: number;
  /** Глагол активного состояния. */
  readonly verb: string;
  readonly isActive: (reading: ComponentReading) => boolean;
}

/** Порог и глагол активного состояния по виду Компонента. */
const ACTIVE_TRAITS: Record<'lamp' | 'motor' | 'led', ActiveTraits> = {
  lamp: {
    valueOf: (reading) => reading.power,
    unit: 'Вт',
    valueName: 'мощность',
    threshold: LAMP_LIT_POWER,
    verb: 'горит',
    isActive: isLampLit,
  },
  motor: {
    valueOf: (reading) => reading.power,
    unit: 'Вт',
    valueName: 'мощность',
    threshold: MOTOR_SPIN_POWER,
    verb: 'крутится',
    isActive: isMotorSpinning,
  },
  led: {
    valueOf: (reading) => reading.current,
    unit: 'А',
    valueName: 'ток',
    threshold: LED_LIT_CURRENT,
    verb: 'светится',
    isActive: isLedLit,
  },
};

/** Проверка активного состояния: лампочка горит / моторчик крутится / светодиод светится. */
function checkComponentActive(
  solution: DcSolution,
  condition: Extract<CircuitCondition, { kind: 'component-active' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const { valueOf, unit, valueName, threshold, verb, isActive } = ACTIVE_TRAITS[condition.componentKind];
  const readings = readingsOfKind(solution, condition.componentKind);

  if (readings.length === 0) {
    return {
      condition,
      passed: false,
      text: `${cap(lexis.nominative)} на схеме нет — состояние проверить не на чем.`,
    };
  }

  const anyActive = readings.some(isActive);
  const candidate = readings.find(isActive) ?? readings[0];
  const value = formatQuantity(valueOf(candidate), unit);
  const passed = condition.active ? anyActive : !anyActive;
  const fact = anyActive
    ? `${cap(lexis.nominative)} ${verb}: ${valueName} ${value} не ниже порога ${formatQuantity(threshold, unit)}.`
    : `${cap(lexis.nominative)} не ${verb}: ${valueName} ${value} ниже порога ${formatQuantity(threshold, unit)}.`;

  if (condition.active || !anyActive) {
    return { condition, passed, text: fact, componentId: candidate.componentId, measured: valueOf(candidate) };
  }
  // требуется «не активен», а Компонент активен
  return {
    condition,
    passed,
    text: `${fact} По условию ${lexis.nominative} активной быть не должна.`,
    componentId: candidate.componentId,
    measured: valueOf(candidate),
  };
}
