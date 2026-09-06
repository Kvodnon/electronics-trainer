import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, PlacedComponent, PinRef, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import { checkConditions } from './circuitConditions';
import { solveDc } from './simulator';
import type { CircuitCondition } from './task';

// Проверка условий-измерений по решению Симулятора. Строки Разбора обязаны
// называть измеренные числа — на них ученик видит, *где* разошёлся с условием.

const component = (id: string, kind: ComponentKind, values: Partial<PlacedComponent> = {}): PlacedComponent => ({
  id,
  kind,
  x: 0,
  y: 0,
  rotation: 0,
  ...defaultValuesOf(kind),
  ...values,
});

const wire = (id: string, from: PinRef, to: PinRef): Wire => ({ id, from, to });

const pin = (componentId: string, n: number): PinRef => ({ componentId, pin: n });

const canvasOf = (components: PlacedComponent[], wires: Wire[]): CanvasState => ({ components, wires });

/** Батарея 9 В + лампочка 120 Ом напрямую — рабочий конь фикстур. */
function litLampCanvas(): CanvasState {
  return canvasOf(
    [component('b', 'battery'), component('lamp1', 'lamp')],
    [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
  );
}

function check(canvas: CanvasState, condition: CircuitCondition) {
  const [result] = checkConditions(canvas, solveDc(canvas), [condition]);
  if (result === undefined) throw new Error('условие не вернуло результат');
  return result;
}

describe('checkConditions: структурное требование', () => {
  it('использован Компонент: есть — выполнено, нет — нет', () => {
    const used = check(litLampCanvas(), { kind: 'component-used', componentKind: 'lamp' });
    expect(used.passed).toBe(true);
    expect(used.text).toContain('1 шт.');

    const missing = check(litLampCanvas(), { kind: 'component-used', componentKind: 'motor' });
    expect(missing.passed).toBe(false);
    expect(missing.text).toContain('0 шт.');
  });

  it('минимум и максимум штук считаются вместе', () => {
    const twoLamps = canvasOf(
      [component('b', 'battery'), component('lamp1', 'lamp'), component('lamp2', 'lamp')],
      [
        wire('w1', pin('b', 0), pin('lamp1', 0)),
        wire('w2', pin('lamp1', 1), pin('b', 1)),
        wire('w3', pin('b', 0), pin('lamp2', 0)),
        wire('w4', pin('lamp2', 1), pin('b', 1)),
      ],
    );
    expect(check(twoLamps, { kind: 'component-used', componentKind: 'lamp', max: 1 }).passed).toBe(false);
    expect(check(twoLamps, { kind: 'component-used', componentKind: 'lamp', min: 2 }).passed).toBe(true);
  });
});

describe('checkConditions: измерения по решению', () => {
  it('ток в границах — выполнено, строка называет измерение и границы', () => {
    // лампочка 120 Ом от 9 В: ток 74,9 мА
    const result = check(litLampCanvas(), {
      kind: 'current-through',
      componentKind: 'lamp',
      range: { from: 0.05, to: 0.1 },
    });
    expect(result.passed).toBe(true);
    expect(result.text).toContain('74,9 мА');
    expect(result.text).toContain('50–100 мА');
  });

  it('ток вне границ — не выполнено, строка называет фактический ток', () => {
    const result = check(litLampCanvas(), {
      kind: 'current-through',
      componentKind: 'lamp',
      range: { from: 0.01, to: 0.02 },
    });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('74,9 мА');
    expect(result.text).toContain('10–20 мА');
  });

  it('напряжение и мощность проверяются так же', () => {
    const voltage = check(litLampCanvas(), {
      kind: 'voltage-across',
      componentKind: 'lamp',
      range: { from: 6, to: 12 },
    });
    expect(voltage.passed).toBe(true);
    expect(voltage.text).toContain('8,99 В');

    const power = check(litLampCanvas(), {
      kind: 'power-of',
      componentKind: 'lamp',
      range: { from: 0.5, to: 1 },
    });
    expect(power.passed).toBe(true);
    expect(power.text).toContain('674 мВт');
  });

  it('Компонентов вида нет — измерение не выполнено, строка говорит об этом', () => {
    const result = check(litLampCanvas(), {
      kind: 'current-through',
      componentKind: 'resistor',
      range: { from: 0, to: 1 },
    });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('резисторов');
  });

  it('из нескольких Компонентов вида годится любой попавший в границы', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r1', 'resistor', { resistance: 100 }), component('r2', 'resistor', { resistance: 100000 })],
      [
        wire('w1', pin('b', 0), pin('r1', 0)),
        wire('w2', pin('r1', 1), pin('b', 1)),
        wire('w3', pin('b', 0), pin('r2', 0)),
        wire('w4', pin('r2', 1), pin('b', 1)),
      ],
    );
    const result = check(canvas, {
      kind: 'current-through',
      componentKind: 'resistor',
      range: { from: 0.05, to: 0.1 },
    });
    expect(result.passed).toBe(true);
    // в Разбор попадает показание попавшего в границы (r1: 9/100,1 = 89,9 мА)
    expect(result.text).toContain('89,9 мА');
  });

  it('зеркальное подключение симметричного Компонента не меняет измерение', () => {
    // «плюс» батареи к выводу 1 лампочки: знак тока разворачивается,
    // но лампочка симметрична — условие проверяет модуль
    const canvas = canvasOf(
      [component('b', 'battery'), component('lamp1', 'lamp')],
      [wire('w1', pin('b', 0), pin('lamp1', 1)), wire('w2', pin('lamp1', 0), pin('b', 1))],
    );
    const result = check(canvas, {
      kind: 'current-through',
      componentKind: 'lamp',
      range: { from: 0.05, to: 0.1 },
    });
    expect(result.passed).toBe(true);
    expect(result.text).toContain('74,9 мА');
    expect(result.text).not.toContain('-');
  });
});

describe('checkConditions: активное состояние', () => {
  it('лампочка горит — мощность выше порога', () => {
    const result = check(litLampCanvas(), { kind: 'component-active', componentKind: 'lamp', active: true });
    expect(result.passed).toBe(true);
    expect(result.text).toContain('горит');
  });

  it('лампочка не горит через разомкнутый выключатель — требование «горит» не выполнено', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch'), component('lamp1', 'lamp')],
      [
        wire('w1', pin('b', 0), pin('sw', 0)),
        wire('w2', pin('sw', 1), pin('lamp1', 0)),
        wire('w3', pin('lamp1', 1), pin('b', 1)),
      ],
    );
    const result = check(canvas, { kind: 'component-active', componentKind: 'lamp', active: true });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('не горит');
    expect(result.text).toContain('0 Вт');
  });

  it('требование «не горит» выполнено тёмной лампочкой', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch'), component('lamp1', 'lamp')],
      [
        wire('w1', pin('b', 0), pin('sw', 0)),
        wire('w2', pin('sw', 1), pin('lamp1', 0)),
        wire('w3', pin('lamp1', 1), pin('b', 1)),
      ],
    );
    expect(check(canvas, { kind: 'component-active', componentKind: 'lamp', active: false }).passed).toBe(true);
  });

  it('моторчик крутится от батареи', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('m', 'motor')],
      [wire('w1', pin('b', 0), pin('m', 0)), wire('w2', pin('m', 1), pin('b', 1))],
    );
    const result = check(canvas, { kind: 'component-active', componentKind: 'motor', active: true });
    expect(result.passed).toBe(true);
    expect(result.text).toContain('крутится');
  });
});
