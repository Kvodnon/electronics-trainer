/**
 * Классификатор Диагнозов Схема-задания (CONTEXT.md: Диагноз). Работает по
 * вычисленному решению Симулятора и проваленным условиям, а не по сравнению
 * с эталоном (ADR-0001): короткое замыкание, обрыв, обратное включение
 * источника, обратное включение диода, превышение тока и «работает, но не
 * по условию» — каждый Диагноз указывает место ошибки на схеме для подсветки.
 * Чистый TypeScript без DOM.
 */
import type { CanvasState } from './canvas';
import { pinKey } from './canvas';
import { formatQuantity, formatQuantityRange } from './quantity';
import { COMPONENT_LEXIS, cap } from './componentLexis';
import { LED_MAX_CURRENT, readingsOfKind, type DcSolution } from './simulator';
import type { ConditionCheck } from './circuitConditions';

/** Виды Диагнозов: фундаментальная ошибка или живая схема не по условию. */
export type CircuitDiagnosisKind =
  | 'short-circuit'
  | 'open-circuit'
  | 'reversed-source'
  | 'reversed-diode'
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
/** Обратное напряжение на диоде, начиная с которого он точно заперт, В. */
const REVERSED_BIAS_MIN_VOLTAGE = 0.3;
/** Токи ниже этой величины — цепь без тока (обрыв или нет источника). */
const DEAD_CURRENT = 1e-6;
/** Напряжение на разомкнутом контакте, ниже которого он не «виноват» в обрыве. */
const OPEN_CONTACT_MIN_VOLTAGE = 0.5;

/**
 * Первичный Диагноз собранной схемы: пустой список, когда все условия
 * выполнены (и схема не «сжигает» Компонент), иначе — одна главная причина,
 * от самой фундаментальной (КЗ, обрыв) к частной (не по условию). Именно она
 * подсвечивается на схеме и объясняется ученику.
 */
export function diagnoseCircuit(
  canvas: CanvasState,
  solution: DcSolution,
  conditionChecks: readonly ConditionCheck[],
): readonly CircuitDiagnosis[] {
  if (conditionChecks.every((check) => check.passed)) {
    // условия выполнены, но предельный ток Компонента превышен: «пройдено»
    // горящий на пределе светодиод не засчитывает
    const burnout = findRatingOvercurrent(solution);
    return burnout !== null ? [burnout] : [];
  }
  const diagnosis =
    findShortCircuit(canvas, solution) ??
    findReversedSource(solution) ??
    findReversedDiode(solution) ??
    findRatingOvercurrent(solution) ??
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
    if (!shorted) continue;
    // перемычка прямо между полюсами — виновник; без неё подсвечиваем батарею
    const jumper = canvas.wires.find(
      (wire) =>
        wire.from.componentId === battery.componentId &&
        wire.to.componentId === battery.componentId &&
        wire.from.pin !== wire.to.pin,
    );
    const where =
      jumper !== undefined
        ? 'Этот Провод соединяет полюса батареи накоротко. Удалите перемычку.'
        : 'Полюса батареи замкнуты накоротко через цепь Проводов. Найдите перемычку и уберите её.';
    return {
      kind: 'short-circuit',
      text:
        `Короткое замыкание: через батарею идёт ток ${formatQuantity(Math.abs(battery.current), 'А')} ` +
        `при напряжении на зажимах всего ${formatQuantity(Math.abs(battery.voltage), 'В')}. ${where}`,
      spot:
        jumper !== undefined
          ? { kind: 'wire', id: jumper.id }
          : { kind: 'component', id: battery.componentId },
    };
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

/**
 * Обратное включение диода (диода или светодиода): всё напряжение источника
 * осталось на запертом диоде — тока в его ветви нет, потому что диод против
 * направления не проводит.
 */
function findReversedDiode(solution: DcSolution): CircuitDiagnosis | null {
  for (const reading of solution.readings) {
    if (reading.kind !== 'diode' && reading.kind !== 'led') continue;
    if (reading.voltage > -REVERSED_BIAS_MIN_VOLTAGE) continue; // не заперт в обратную сторону
    if (Math.abs(reading.current) >= DEAD_CURRENT) continue; // ток есть — не об обратном включении
    const lexis = COMPONENT_LEXIS[reading.kind];
    const doesNotLight = reading.kind === 'led' ? 'ток через него не идёт и светодиод не светится' : 'ток через него не идёт';
    return {
      kind: 'reversed-diode',
      text:
        `${cap(lexis.nominative)} включён в обратную сторону: диод не проводит против своего ` +
        `направления, поэтому ${doesNotLight}. Разверните ${lexis.accusative} в цепи — выводы у него разные.`,
      spot: { kind: 'component', id: reading.componentId },
    };
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
    connectedPins.add(pinKey(wire.from.componentId, wire.from.pin));
    connectedPins.add(pinKey(wire.to.componentId, wire.to.pin));
  }
  const hasFreePin = (componentId: string): boolean =>
    !connectedPins.has(pinKey(componentId, 0)) || !connectedPins.has(pinKey(componentId, 1));
  const load = canvas.components.find((component) => component.kind !== 'battery' && hasFreePin(component.id));
  if (load !== undefined) return load.id;
  const battery = canvas.components.find((component) => component.kind === 'battery' && hasFreePin(component.id));
  return battery?.id ?? null;
}

/**
 * Превышение предельного тока светодиода: прямой ток выше паспортного максимума
 * независимо от условий Задания — Компонент перегревается, схему нельзя
 * считать «прошедшей», даже если измерения попали в границы.
 */
function findRatingOvercurrent(solution: DcSolution): CircuitDiagnosis | null {
  for (const led of readingsOfKind(solution, 'led')) {
    if (led.current <= LED_MAX_CURRENT) continue;
    return {
      kind: 'overcurrent',
      text:
        `Превышение максимального тока: через светодиод идёт ${formatQuantity(led.current, 'А')} — ` +
        `выше предельных ${formatQuantity(LED_MAX_CURRENT, 'А')}. Светодиод перегреется: ` +
        'добавьте токоограничивающий резистор в цепь или снизьте напряжение источника.',
      spot: { kind: 'component', id: led.componentId },
    };
  }
  return null;
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
