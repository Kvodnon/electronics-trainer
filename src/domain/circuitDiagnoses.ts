/**
 * Классификатор Диагнозов Схема-задания (CONTEXT.md: Диагноз). Работает по
 * вычисленному решению Симулятора и проваленным условиям, а не по сравнению
 * с эталоном (ADR-0001): короткое замыкание, обрыв, обратное включение
 * источника, превышение тока и «работает, но не по условию» — каждый Диагноз
 * указывает место ошибки на схеме для подсветки. Чистый TypeScript без DOM.
 */
import type { CanvasState } from './canvas';
import { formatQuantity, formatQuantityRange } from './quantity';
import { COMPONENT_LEXIS } from './componentLexis';
import { readingsOfKind, type DcSolution } from './simulator';
import type { ConditionCheck } from './circuitConditions';

/** Виды Диагнозов: фундаментальная ошибка или живая схема не по условию. */
export type CircuitDiagnosisKind =
  | 'short-circuit'
  | 'open-circuit'
  | 'reversed-source'
  | 'overcurrent'
  | 'works-not-per-task';

/** Место ошибки на схеме: конкретный Компонент или Провод для подсветки. */
export interface CircuitDiagnosisSpot {
  readonly kind: 'component' | 'wire';
  readonly id: string;
}

/** Диагноз: вид, Разбор с числами расчёта и место ошибки (или null — подсвечивать нечего). */
export interface CircuitDiagnosis {
  readonly kind: CircuitDiagnosisKind;
  readonly text: string;
  readonly spot: CircuitDiagnosisSpot | null;
}

/** Ниже этого тока батарея считается «не работающей» — учебные токи в мА. */
const SHORT_CIRCUIT_MIN_CURRENT = 0.5;
/** Доля ЭДС: напряжение на зажимах ниже — полюса замкнуты накоротко. */
const SHORT_CIRCUIT_VOLTAGE_FRACTION = 0.2;
/** Обратный ток больше этого — батарею разряжает другой источник. */
const REVERSED_MIN_CURRENT = 1e-4;
/** Токи ниже этой величины — цепь без тока (обрыв или нет источника). */
const DEAD_CURRENT = 1e-6;
/** Напряжение на разомкнутом контакте, ниже которого он не «виноват» в обрыве. */
const OPEN_CONTACT_MIN_VOLTAGE = 0.5;

/**
 * Первичный Диагноз собранной схемы: пустой список, когда все условия
 * выполнены («пройдено»), иначе — одна главная причина, от самой
 * фундаментальной (КЗ, обрыв) к частной (не по условию). Именно она
 * подсвечивается на схеме и объясняется ученику.
 */
export function diagnoseCircuit(
  canvas: CanvasState,
  solution: DcSolution,
  conditionChecks: readonly ConditionCheck[],
): readonly CircuitDiagnosis[] {
  if (conditionChecks.every((check) => check.passed)) return [];
  const diagnosis =
    findShortCircuit(canvas, solution) ??
    findReversedSource(solution) ??
    findOpenCircuit(canvas, solution) ??
    findOvercurrent(conditionChecks) ??
    findWorksNotPerTask(conditionChecks);
  return [diagnosis];
}

/** ЭДС батареи по номиналу Компонента на Холсте. */
function emfOf(canvas: CanvasState, componentId: string): number {
  return canvas.components.find((component) => component.id === componentId)?.voltage ?? 0;
}

/** Короткое замыкание: батарея отдаёт огромный ток при напряжении зажимов ≈ 0. */
function findShortCircuit(canvas: CanvasState, solution: DcSolution): CircuitDiagnosis | null {
  for (const battery of readingsOfKind(solution, 'battery')) {
    const emf = emfOf(canvas, battery.componentId);
    const shorted =
      emf > 0 &&
      Math.abs(battery.current) >= SHORT_CIRCUIT_MIN_CURRENT &&
      Math.abs(battery.voltage) <= emf * SHORT_CIRCUIT_VOLTAGE_FRACTION;
    if (shorted) {
      return {
        kind: 'short-circuit',
        text:
          `Короткое замыкание: через батарею идёт ток ${formatQuantity(Math.abs(battery.current), 'А')} ` +
          `при напряжении на зажимах всего ${formatQuantity(Math.abs(battery.voltage), 'В')} — ` +
          'полюса соединены накоротко. Найдите перемычку между «плюсом» и «минусом» и уберите её.',
        spot: { kind: 'component', id: battery.componentId },
      };
    }
  }
  return null;
}

/** Обратное включение источника: через батарею ток идёт навстречу её ЭДС. */
function findReversedSource(solution: DcSolution): CircuitDiagnosis | null {
  for (const battery of readingsOfKind(solution, 'battery')) {
    if (battery.current <= -REVERSED_MIN_CURRENT) {
      return {
        kind: 'reversed-source',
        text:
          `Обратное включение источника: через батарею ток идёт навстречу её ЭДС ` +
          `(${formatQuantity(battery.current, 'А')}) — её заряжает другой источник. ` +
          'Разверните батарею в цепи или уберите лишнюю.',
        spot: { kind: 'component', id: battery.componentId },
      };
    }
  }
  return null;
}

/** Обрыв: источника нет или тока нет нигде — поиск места разрыва контура. */
function findOpenCircuit(canvas: CanvasState, solution: DcSolution): CircuitDiagnosis | null {
  const batteries = readingsOfKind(solution, 'battery');
  if (batteries.length === 0) {
    return {
      kind: 'open-circuit',
      text: 'Обрыв цепи: на схеме нет источника питания — току неоткуда взяться. Поставьте батарею и замкните контур.',
      spot: null,
    };
  }
  const anyCurrent = solution.readings.some((reading) => Math.abs(reading.current) >= DEAD_CURRENT);
  if (anyCurrent) return null;

  const openContact = canvas.components.find((component) => {
    if (component.kind !== 'switch' && component.kind !== 'pushbutton') return false;
    if (component.closed !== false) return false;
    const reading = solution.readings.find((r) => r.componentId === component.id);
    return reading !== undefined && Math.abs(reading.voltage) >= OPEN_CONTACT_MIN_VOLTAGE;
  });
  if (openContact) {
    return {
      kind: 'open-circuit',
      text:
        'Обрыв цепи: тока в схеме нет, потому что контакт разомкнут — ' +
        'всё напряжение источника падает на нём. Замкните контакт.',
      spot: { kind: 'component', id: openContact.id },
    };
  }

  const unconnected = firstWithUnconnectedPin(canvas);
  if (unconnected !== null) {
    return {
      kind: 'open-circuit',
      text:
        'Обрыв цепи: тока в схеме нет — у этого Компонента вывод остался не подключён. ' +
        'Замкните контур Проводами от «плюса» батареи к «минусу».',
      spot: { kind: 'component', id: unconnected },
    };
  }

  return {
    kind: 'open-circuit',
    text: 'Обрыв цепи: тока в схеме нет — контур не замкнут. Соедините Проводами полюса батареи с цепью.',
    spot: batteries.length > 0 ? { kind: 'component', id: batteries[0].componentId } : null,
  };
}

/** Первый Компонент с выводом без Проводов: нагрузки важнее батареи — она обычно цела. */
function firstWithUnconnectedPin(canvas: CanvasState): string | null {
  const connectedPins = new Set<string>();
  for (const wire of canvas.wires) {
    connectedPins.add(`${wire.from.componentId}:${wire.from.pin}`);
    connectedPins.add(`${wire.to.componentId}:${wire.to.pin}`);
  }
  const hasFreePin = (componentId: string): boolean =>
    !connectedPins.has(`${componentId}:0`) || !connectedPins.has(`${componentId}:1`);
  const load = canvas.components.find((component) => component.kind !== 'battery' && hasFreePin(component.id));
  if (load !== undefined) return load.id;
  const battery = canvas.components.find((component) => component.kind === 'battery' && hasFreePin(component.id));
  return battery?.id ?? null;
}

/** Превышение тока: проваленное условие «ток через…» выше верхней границы. */
function findOvercurrent(conditionChecks: readonly ConditionCheck[]): CircuitDiagnosis | null {
  for (const check of conditionChecks) {
    if (check.passed || check.condition.kind !== 'current-through') continue;
    if (check.measured === undefined || check.measured <= check.condition.range.to) continue;
    const lexis = COMPONENT_LEXIS[check.condition.componentKind];
    return {
      kind: 'overcurrent',
      text:
        `Превышение тока: через ${lexis.accusative} идёт ${formatQuantity(check.measured, 'А')} — ` +
        `это выше условия (${formatQuantityRange(check.condition.range.from, check.condition.range.to, 'А')}). ` +
        'Компонент перегреется: добавьте сопротивление в цепь или снизьте напряжение источника.',
      spot: check.componentId !== undefined ? { kind: 'component', id: check.componentId } : null,
    };
  }
  return null;
}

/** «Работает, но не по условию»: схема живая, ошибка wiring не найдена — не совпали измерения. */
function findWorksNotPerTask(conditionChecks: readonly ConditionCheck[]): CircuitDiagnosis {
  const failed = conditionChecks.find((check) => !check.passed);
  return {
    kind: 'works-not-per-task',
    text:
      'Схема работает, но не по условию: ток течёт, поломки не видно — расходятся сами измерения. ' +
      'Сверьтесь с Разбором условий ниже и подгоните схему под условие.',
    spot: failed?.componentId !== undefined ? { kind: 'component', id: failed.componentId } : null,
  };
}
