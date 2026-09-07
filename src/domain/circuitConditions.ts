/**
 * Проверка условий Схема-задания по решению Симулятора (ADR-0001): каждое
 * условие-измерение превращается в строку Разбора с измеренными числами.
 * Эквивалентные схемы проходят одинаково — сравнивается физика, не эталон.
 * Чистый TypeScript без DOM.
 */
import { pinKey, type CanvasState } from './canvas';
import type { CircuitCondition } from './task';
import { formatQuantity, formatQuantityRange, type QuantityUnit } from './quantity';
import { COMPONENT_LEXIS, cap, type ComponentLexis } from './componentLexis';
import { voltageAt, type TransientSolution } from './transient';
import {
  BUZZER_SOUND_CURRENT,
  LAMP_LIT_POWER,
  LED_LIT_CURRENT,
  MOTOR_SPIN_POWER,
  isBuzzerSounding,
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
 * любое условие — Разбор объяснит, чего не хватает. Условия во времени
 * сверяются с решением переходного режима, когда оно есть в Задании.
 */
export function checkConditions(
  canvas: CanvasState,
  solution: DcSolution,
  conditions: readonly CircuitCondition[],
  transient?: TransientSolution,
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
      case 'wiper-voltage':
        return checkWiperVoltage(solution, condition);
      case 'rc-time-constant':
        return checkTimeConstant(transient, condition);
      case 'capacitor-voltage-at':
        return checkVoltageAtMoment(transient, condition);
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
  /** Как сказать про Компонент, что активным ему быть не положено. */
  readonly inactiveNote: string;
  readonly isActive: (reading: ComponentReading) => boolean;
}

/** Порог и глагол активного состояния по виду Компонента. */
const ACTIVE_TRAITS: Record<'lamp' | 'motor' | 'led' | 'buzzer', ActiveTraits> = {
  lamp: {
    valueOf: (reading) => reading.power,
    unit: 'Вт',
    valueName: 'мощность',
    threshold: LAMP_LIT_POWER,
    verb: 'горит',
    inactiveNote: 'По условию лампочка активной быть не должна.',
    isActive: isLampLit,
  },
  motor: {
    valueOf: (reading) => reading.power,
    unit: 'Вт',
    valueName: 'мощность',
    threshold: MOTOR_SPIN_POWER,
    verb: 'крутится',
    inactiveNote: 'По условию моторчик не должен крутиться.',
    isActive: isMotorSpinning,
  },
  led: {
    valueOf: (reading) => reading.current,
    unit: 'А',
    valueName: 'ток',
    threshold: LED_LIT_CURRENT,
    verb: 'светится',
    inactiveNote: 'По условию светодиод не должен светиться.',
    isActive: isLedLit,
  },
  buzzer: {
    valueOf: (reading) => Math.abs(reading.current),
    unit: 'А',
    valueName: 'ток',
    threshold: BUZZER_SOUND_CURRENT,
    verb: 'звучит',
    inactiveNote: 'По условию зуммер не должен звучать.',
    isActive: isBuzzerSounding,
  },
};

/** Проверка активного состояния: лампочка горит / моторчик крутится / светодиод светится. */
function checkComponentActive(
  solution: DcSolution,
  condition: Extract<CircuitCondition, { kind: 'component-active' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const { valueOf, unit, valueName, threshold, verb, inactiveNote, isActive } =
    ACTIVE_TRAITS[condition.componentKind];
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
    text: `${fact} ${inactiveNote}`,
    componentId: candidate.componentId,
    measured: valueOf(candidate),
  };
}

/**
 * Конденсаторы с их измерением во времени: постоянной времени или напряжения
 * в момент t. Кривая берётся из решения переходного режима; как и у измерений
 * М1, годится любой конденсатор вида, чьё измерение попало в границы.
 */

/**
 * Напряжение на движке потенциометра — выход делителя: потенциал вывода 1
 * минус вывод 2 (модуль — ориентация на Холсте не наказывается). Берётся
 * из узлов решения, поэтому видно и при «висящем» ни к чему не подключённом
 * движке: его потенциал держат внутренние плечи.
 */
function checkWiperVoltage(
  solution: DcSolution,
  condition: Extract<CircuitCondition, { kind: 'wiper-voltage' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const potentiometers = readingsOfKind(solution, condition.componentKind);
  if (potentiometers.length === 0) {
    return {
      condition,
      passed: false,
      text: `Напряжение на движке не измерено: на схеме нет ${lexis.genitivePlural}.`,
    };
  }

  const measured = potentiometers.map((reading) => {
    const wiper = solution.pinNodes.get(pinKey(reading.componentId, 1));
    const bottom = solution.pinNodes.get(pinKey(reading.componentId, 2));
    return {
      id: reading.componentId,
      voltage: Math.abs((wiper?.voltage ?? 0) - (bottom?.voltage ?? 0)),
    };
  });
  const inRange = (entry: { id: string; voltage: number }) =>
    entry.voltage >= condition.range.from && entry.voltage <= condition.range.to;
  const distance = (entry: { id: string; voltage: number }) => {
    if (entry.voltage < condition.range.from) return condition.range.from - entry.voltage;
    if (entry.voltage > condition.range.to) return entry.voltage - condition.range.to;
    return 0;
  };
  const candidate =
    measured.find(inRange) ??
    measured.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best));
  const bounds = formatQuantityRange(condition.range.from, condition.range.to, 'В');
  return {
    condition,
    passed: inRange(candidate),
    text: `Напряжение на движке ${lexis.genitive} — ${formatQuantity(candidate.voltage, 'В')}, ${
      inRange(candidate) ? 'в границах' : 'вне границ'
    } условия (${bounds}).`,
    componentId: candidate.id,
    measured: candidate.voltage,
  };
}

/** Проверка постоянной времени RC-цепи по расчёту переходного режима. */
function checkTimeConstant(
  transient: TransientSolution | undefined,
  condition: Extract<CircuitCondition, { kind: 'rc-time-constant' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  if (transient === undefined) {
    return {
      condition,
      passed: false,
      text: `${cap(lexis.nominative)} не измерен: в Задании нет переходного режима.`,
    };
  }
  const candidates = [...transient.timeConstants.entries()];
  if (candidates.length === 0) {
    return {
      condition,
      passed: false,
      text: `Постоянная времени не измерена: на схеме нет ${lexis.genitivePlural}.`,
    };
  }

  const inRange = ([, tau]: readonly [string, number]) => tau >= condition.range.from && tau <= condition.range.to;
  const distance = ([, tau]: readonly [string, number]) => {
    if (!Number.isFinite(tau)) return Number.POSITIVE_INFINITY;
    if (tau < condition.range.from) return condition.range.from - tau;
    if (tau > condition.range.to) return tau - condition.range.to;
    return 0;
  };
  const candidate =
    candidates.find(inRange) ??
    candidates.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best));
  const [componentId, tau] = candidate;
  const bounds = formatQuantityRange(condition.range.from, condition.range.to, 'с');
  const measured = Number.isFinite(tau)
    ? `${formatQuantity(tau, 'с')}, ${inRange(candidate) ? 'в границах' : 'вне границ'} условия`
    : 'не определяется: у конденсатора нет резистивного пути заряда';
  return {
    condition,
    passed: inRange(candidate),
    text: `Постоянная времени RC-цепи — ${measured} (${bounds}).`,
    componentId,
    measured: Number.isFinite(tau) ? tau : undefined,
  };
}

/** Проверка напряжения на конденсаторе в момент времени по кривой переходного режима. */
function checkVoltageAtMoment(
  transient: TransientSolution | undefined,
  condition: Extract<CircuitCondition, { kind: 'capacitor-voltage-at' }>,
): ConditionCheck {
  const lexis = COMPONENT_LEXIS[condition.componentKind];
  const moment = `в момент t = ${formatQuantity(condition.time, 'с')}`;
  if (transient === undefined) {
    return {
      condition,
      passed: false,
      text: `Напряжение на ${lexis.prepositional} ${moment} не измерено: в Задании нет переходного режима.`,
    };
  }
  const capacitorIds = [...transient.capacitorVoltages.keys()];
  if (capacitorIds.length === 0) {
    return {
      condition,
      passed: false,
      text: `Напряжение ${moment} не измерено: на схеме нет ${lexis.genitivePlural}.`,
    };
  }

  const measured = capacitorIds.map((id) => ({ id, voltage: Math.abs(voltageAt(transient, id, condition.time) ?? 0) }));
  const inRange = (entry: { id: string; voltage: number }) =>
    entry.voltage >= condition.range.from && entry.voltage <= condition.range.to;
  const distance = (entry: { id: string; voltage: number }) => {
    if (entry.voltage < condition.range.from) return condition.range.from - entry.voltage;
    if (entry.voltage > condition.range.to) return entry.voltage - condition.range.to;
    return 0;
  };
  const candidate =
    measured.find(inRange) ??
    measured.reduce((best, entry) => (distance(entry) < distance(best) ? entry : best));
  const bounds = formatQuantityRange(condition.range.from, condition.range.to, 'В');
  return {
    condition,
    passed: inRange(candidate),
    text: `Напряжение на ${lexis.prepositional} ${moment} — ${formatQuantity(candidate.voltage, 'В')}, ${
      inRange(candidate) ? 'в границах' : 'вне границ'
    } условия (${bounds}).`,
    componentId: candidate.id,
    measured: candidate.voltage,
  };
}
