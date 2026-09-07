import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, PlacedComponent, PinRef, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import { checkConditions } from './circuitConditions';
import { solveDc } from './simulator';
import { solveTransient } from './transient';
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

  it('светодиод светится в прямом направлении и гаснет в обратном: в Разборе ток, а не мощность', () => {
    const forward = canvasOf(
      [component('b', 'battery'), component('led', 'led'), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('led', 0)),
        wire('w2', pin('led', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const lit = check(forward, { kind: 'component-active', componentKind: 'led', active: true });
    expect(lit.passed).toBe(true);
    expect(lit.text).toContain('светится');
    expect(lit.text).toContain('ток');

    const reversed = canvasOf(
      [component('b', 'battery'), component('led', 'led'), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('led', 1)),
        wire('w2', pin('led', 0), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const dark = check(reversed, { kind: 'component-active', componentKind: 'led', active: true });
    expect(dark.passed).toBe(false);
    expect(dark.text).toContain('не светится');
  });

  it('зуммер звучит при токе выше порога и молчит ниже — в Разборе ток', () => {
    const loud = canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance: 100 }), component('bz', 'buzzer')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('bz', 0)), wire('w3', pin('bz', 1), pin('b', 1))],
    );
    const sounding = check(loud, { kind: 'component-active', componentKind: 'buzzer', active: true });
    expect(sounding.passed).toBe(true);
    expect(sounding.text).toContain('звучит');
    expect(sounding.text).toContain('ток');

    const quiet = canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance: 2000 }), component('bz', 'buzzer')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('bz', 0)), wire('w3', pin('bz', 1), pin('b', 1))],
    );
    const silent = check(quiet, { kind: 'component-active', componentKind: 'buzzer', active: true });
    expect(silent.passed).toBe(false);
    expect(silent.text).toContain('не звучит');
  });
});

describe('checkConditions: напряжение на движке потенциометра (тикет 15)', () => {
  /** Делитель: батарея 9 В на концах потенциометра, движок — выход. */
  function divider(wiper: number): CanvasState {
    return canvasOf(
      [component('b', 'battery'), component('pot', 'potentiometer', { wiper })],
      [wire('w1', pin('b', 0), pin('pot', 0)), wire('w2', pin('pot', 2), pin('b', 1))],
    );
  }

  const condition = {
    kind: 'wiper-voltage',
    componentKind: 'potentiometer',
    range: { from: 3, to: 5 },
  } as const;

  it('напряжение с движка в границах — выполнено, строка называет измерение', () => {
    const result = check(divider(0.5), condition);
    expect(result.passed).toBe(true);
    expect(result.text).toContain('движке потенциометра');
    expect(result.text).toContain('4,5 В');
    expect(result.text).toContain('3–5 В');
  });

  it('движок у края — напряжение вне границ, строка называет факт', () => {
    const result = check(divider(0.1), condition);
    expect(result.passed).toBe(false);
    expect(result.text).toContain('вне границ');
    expect(result.measured).toBeGreaterThan(5);
  });

  it('потенциометра на схеме нет — измерение честно не выполнено', () => {
    const result = check(litLampCanvas(), condition);
    expect(result.passed).toBe(false);
    expect(result.text).toContain('нет потенциометров');
  });
});

describe('checkConditions: измерения во времени (тикет 14)', () => {
  /** Батарея — резистор 10 кОм — конденсатор 100 мкФ: заряд с τ ≈ 1 с. */
  function chargingCanvas(): CanvasState {
    return canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance: 10_000 }), component('c', 'capacitor')],
      [wire('w1', pin('b', 1), pin('r', 0)), wire('w2', pin('r', 1), pin('c', 0)), wire('w3', pin('c', 1), pin('b', 0))],
    );
  }

  /** Проверка условия по решению переходного режима зарядной схемы. */
  function checkTransient(canvas: CanvasState, condition: CircuitCondition) {
    const [result] = checkConditions(canvas, solveDc(canvas), [condition], solveTransient(canvas, { duration: 5 }));
    if (result === undefined) throw new Error('условие не вернуло результат');
    return result;
  }

  it('постоянная времени в границах: строка называет τ и границы в секундах', () => {
    const result = checkTransient(chargingCanvas(), {
      kind: 'rc-time-constant',
      componentKind: 'capacitor',
      range: { from: 0.9, to: 1.1 },
    });
    expect(result.passed).toBe(true);
    expect(result.text).toContain('Постоянная времени');
    expect(result.text).toContain('1 с');
    expect(result.text).toContain('0,9–1,1 с');
    expect(result.componentId).toBe('c');
  });

  it('постоянная времени вне границ — не выполнено с фактическим значением', () => {
    const result = checkTransient(chargingCanvas(), {
      kind: 'rc-time-constant',
      componentKind: 'capacitor',
      range: { from: 2, to: 3 },
    });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('вне границ');
  });

  it('напряжение в момент t читается из кривой и сверяется с границами', () => {
    // к t = 3,5 с заряд ≈ 97%: 8,7 В
    const ok = checkTransient(chargingCanvas(), {
      kind: 'capacitor-voltage-at',
      componentKind: 'capacitor',
      time: 3.5,
      range: { from: 8.5, to: 8.9 },
    });
    expect(ok.passed).toBe(true);
    expect(ok.text).toContain('t = 3,5 с');
    expect(ok.text).toContain('8,5–8,9 В');

    // в момент t = 1 с заряд всего ~63% — в границы [8,5; 8,9] не попадает
    const early = checkTransient(chargingCanvas(), {
      kind: 'capacitor-voltage-at',
      componentKind: 'capacitor',
      time: 1,
      range: { from: 8.5, to: 8.9 },
    });
    expect(early.passed).toBe(false);
    expect(early.text).toContain('вне границ');
  });

  it('без переходного режима в Задании условия во времени честно проваливаются', () => {
    const tau = check(chargingCanvas(), {
      kind: 'rc-time-constant',
      componentKind: 'capacitor',
      range: { from: 0.9, to: 1.1 },
    });
    expect(tau.passed).toBe(false);
    expect(tau.text).toContain('нет переходного режима');

    const voltage = check(chargingCanvas(), {
      kind: 'capacitor-voltage-at',
      componentKind: 'capacitor',
      time: 1,
      range: { from: 1, to: 2 },
    });
    expect(voltage.passed).toBe(false);
    expect(voltage.text).toContain('нет переходного режима');
  });

  it('без конденсаторов измерять не на что', () => {
    const lampCanvas = litLampCanvas();
    const result = checkTransient(lampCanvas, {
      kind: 'rc-time-constant',
      componentKind: 'capacitor',
      range: { from: 0.9, to: 1.1 },
    });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('нет конденсаторов');
  });

  it('у разомкнутой цепи постоянной времени нет — условие не выполняется с объяснением', () => {
    const openCanvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch', { closed: false }), component('c', 'capacitor')],
      [wire('w1', pin('b', 1), pin('sw', 0)), wire('w2', pin('sw', 1), pin('c', 0)), wire('w3', pin('c', 1), pin('b', 0))],
    );
    const result = checkTransient(openCanvas, {
      kind: 'rc-time-constant',
      componentKind: 'capacitor',
      range: { from: 0.9, to: 1.1 },
    });
    expect(result.passed).toBe(false);
    expect(result.text).toContain('нет резистивного пути');
  });
});
