/**
 * Мультиметр — режим измерений на Холсте (CONTEXT.md): щупы прикладываются
 * к двум точкам схемы (напряжение между ними) или к ветви Компонента (ток).
 * Измерения читают решение Симулятора (ADR-0001), поэтому обновляются при
 * любом изменении схемы сами собой — пересчётом решения. Чистый TypeScript
 * без DOM.
 */
import { pinKey, type PinRef } from './canvas';
import { readingOf, type DcSolution } from './simulator';
import type { QuantityUnit } from './quantity';

/** Режим Мультиметра: напряжение между двумя щупами или ток ветви. */
export type MultimeterMode = 'voltage' | 'current';

/** Измерение Мультиметра: значение со знаком и единица. */
export interface MultimeterReading {
  readonly value: number;
  readonly unit: QuantityUnit;
}

/**
 * Напряжение между щупами: потенциал красного минус чёрного, В; перестановка
 * щупов меняет знак. Щупы без общей цепи (разные острова Симулятора)
 * измерение не определяют — null. Обрыв цепи решение не ломает: разомкнутый
 * контакт — огромное сопротивление, поэтому на разрыве честно падает всё
 * напряжение источника, а ток ≈ 0.
 */
export function measureVoltage(
  solution: DcSolution,
  red: PinRef,
  black: PinRef,
): MultimeterReading | null {
  const redNode = solution.pinNodes.get(pinKey(red.componentId, red.pin));
  const blackNode = solution.pinNodes.get(pinKey(black.componentId, black.pin));
  if (redNode === undefined || blackNode === undefined || redNode.island !== blackNode.island) {
    return null;
  }
  return { value: redNode.voltage - blackNode.voltage, unit: 'В' };
}

/**
 * Ток ветви Компонента, А — модуль: у амперметра здесь нет выбранной учеником
 * полярности, а знак ветвевого тока — артефакт ориентации Компонента на
 * Холсте (как в оверлее и условиях, ориентация не наказывается). Напряжение,
 * напротив, знаковое: порядок щупов выбирает ученик. Нет такого Компонента —
 * null.
 */
export function measureCurrent(solution: DcSolution, componentId: string): MultimeterReading | null {
  const reading = readingOf(solution, componentId);
  return reading === null ? null : { value: Math.abs(reading.current), unit: 'А' };
}
