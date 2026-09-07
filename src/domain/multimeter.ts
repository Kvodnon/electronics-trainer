/**
 * Мультиметр — режим измерений на Холсте (CONTEXT.md): щупы прикладываются
 * к двум точкам схемы (напряжение между ними) или к ветви Компонента (ток).
 * Измерения читают решение Симулятора (ADR-0001), поэтому обновляются при
 * любом изменении схемы сами собой — пересчётом решения. В схемах с
 * источником ~ (тикет 20) к постоянной составляющей добавляются амплитуда,
 * фаза и действующее (RMS) значение переменной. Чистый TypeScript без DOM.
 */
import { pinKey, type PinRef } from './canvas';
import { readingOf } from './simulator';
import { cAbs, phaseDegOf, phasorReading, rmsOf, type CircuitSolution, type PhasorSolution } from './phasor';
import type { QuantityUnit } from './quantity';

/** Режим Мультиметра: напряжение между двумя щупами или ток ветви. */
export type MultimeterMode = 'voltage' | 'current';

/** Переменная составляющая измерения (тикет 20). */
export interface AcMeasurement {
  /** Амплитуда (пик) переменной составляющей. */
  readonly amplitude: number;
  /** Действующее значение полной величины: √(DC² + (A/√2)²). */
  readonly rms: number;
  /** Фаза переменной составляющей, градусы — относительно источника ~. */
  readonly phaseDeg: number;
  /** Частота, Гц. */
  readonly frequency: number;
}

/** Измерение Мультиметра: значение со знаком (постоянная составляющая) и единица. */
export interface MultimeterReading {
  readonly value: number;
  readonly unit: QuantityUnit;
  /** Переменная составляющая; в схемах без источника ~ её нет. */
  readonly ac?: AcMeasurement;
}

/** Приложенные щупы: две точки (напряжение) или ветвь Компонента (ток). */
export interface MultimeterProbes {
  readonly red: PinRef | null;
  readonly black: PinRef | null;
  /** Компонент, на ветвь которого положены щупы в режиме тока. */
  readonly branch: string | null;
}

/** Щупы сняты. */
export const emptyProbes: MultimeterProbes = { red: null, black: null, branch: null };

/**
 * Напряжение между щупами: потенциал красного минус чёрного, В; перестановка
 * щупов меняет знак. Щупы без общей цепи (разные острова Симулятора)
 * измерение не определяют — null. Обрыв цепи решение не ломает: разомкнутый
 * контакт — огромное сопротивление, поэтому на разрыве честно падает всё
 * напряжение источника, а ток ≈ 0. В схеме с источником ~ постоянная
 * составляющая дополняется амплитудой, фазой и RMS переменной.
 */
export function measureVoltage(
  solution: CircuitSolution,
  red: PinRef,
  black: PinRef,
): MultimeterReading | null {
  const redNode = solution.dc.pinNodes.get(pinKey(red.componentId, red.pin));
  const blackNode = solution.dc.pinNodes.get(pinKey(black.componentId, black.pin));
  if (redNode === undefined || blackNode === undefined || redNode.island !== blackNode.island) {
    return null;
  }
  const dc = redNode.voltage - blackNode.voltage;
  const ac = voltageAcMeasurement(solution.phasor, red, black, dc);
  return { value: dc, unit: 'В', ...(ac !== undefined ? { ac } : {}) };
}

/** Переменная составляющая напряжения между щупами; нет источников ~ — undefined. */
function voltageAcMeasurement(
  phasor: PhasorSolution | null,
  red: PinRef,
  black: PinRef,
  dc: number,
): AcMeasurement | undefined {
  if (phasor === null) return undefined;
  const redPhasor = phasor.pinPhasors.get(pinKey(red.componentId, red.pin));
  const blackPhasor = phasor.pinPhasors.get(pinKey(black.componentId, black.pin));
  if (redPhasor === undefined || blackPhasor === undefined) return undefined;
  const phasorVoltage = {
    re: redPhasor.voltage.re - blackPhasor.voltage.re,
    im: redPhasor.voltage.im - blackPhasor.voltage.im,
  };
  return {
    amplitude: cAbs(phasorVoltage),
    rms: rmsOf(dc, cAbs(phasorVoltage)),
    phaseDeg: phaseDegOf(phasorVoltage),
    frequency: phasor.frequency,
  };
}

/**
 * Ток ветви Компонента, А — модуль: у амперметра здесь нет выбранной учеником
 * полярности, а знак ветвевого тока — артефакт ориентации Компонента на
 * Холсте (как в оверлее и условиях, ориентация не наказывается). Напряжение,
 * напротив, знаковое: порядок щупов выбирает ученик. Нет такого Компонента —
 * null. Амплитуда и фаза переменной составляющей берутся из фазорного решения.
 */
export function measureCurrent(solution: CircuitSolution, componentId: string): MultimeterReading | null {
  const reading = readingOf(solution.dc, componentId);
  if (reading === null) return null;
  const dc = Math.abs(reading.current);
  if (solution.phasor === null) return { value: dc, unit: 'А' };
  const ac = phasorReading(solution.phasor, componentId);
  const amplitude = ac === null ? 0 : cAbs(ac.current);
  return {
    value: dc,
    unit: 'А',
    ac: {
      amplitude,
      rms: rmsOf(dc, amplitude),
      phaseDeg: ac === null ? 0 : phaseDegOf(ac.current),
      frequency: solution.phasor.frequency,
    },
  };
}

/** Итог измерения: щупы не приложены; приложены, но измерить нельзя; значение. */
export type MultimeterResult =
  | { readonly status: 'idle' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'ok'; readonly reading: MultimeterReading };

/**
 * Измерение по режиму и приложенным щупам — шов экрана: решение могло не
 * сойтись (null), а приложенные щупы могли остаться без Компонента — оба
 * случая честно «unavailable», не «idle».
 */
export function measure(
  solution: CircuitSolution | null,
  mode: MultimeterMode,
  probes: MultimeterProbes,
): MultimeterResult {
  if (mode === 'voltage') {
    if (probes.red === null || probes.black === null) return { status: 'idle' };
    if (solution === null) return { status: 'unavailable' };
    const reading = measureVoltage(solution, probes.red, probes.black);
    return reading === null ? { status: 'unavailable' } : { status: 'ok', reading };
  }
  if (probes.branch === null) return { status: 'idle' };
  if (solution === null) return { status: 'unavailable' };
  const reading = measureCurrent(solution, probes.branch);
  return reading === null ? { status: 'unavailable' } : { status: 'ok', reading };
}

/** Точки приложения щупов для отрисовки: приложенные точки или концы ветви. */
export function probePoints(
  mode: MultimeterMode,
  probes: MultimeterProbes,
): readonly { readonly ref: PinRef; readonly color: 'red' | 'black' }[] {
  if (mode === 'voltage') {
    return [
      ...(probes.red !== null ? [{ ref: probes.red, color: 'red' as const }] : []),
      ...(probes.black !== null ? [{ ref: probes.black, color: 'black' as const }] : []),
    ];
  }
  if (probes.branch === null) return [];
  return [
    { ref: { componentId: probes.branch, pin: 0 }, color: 'red' as const },
    { ref: { componentId: probes.branch, pin: 1 }, color: 'black' as const },
  ];
}
