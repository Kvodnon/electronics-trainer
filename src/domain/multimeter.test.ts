import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, PinRef, PlacedComponent, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import { solveDc } from './simulator';
import { measureCurrent, measureVoltage } from './multimeter';

// Мультиметр читает решение Симулятора (ADR-0001): напряжение между щупами —
// разность узловых потенциалов, ток ветви — ветвевое показание. Золотые схемы
// с аналитикой; допуск — как у решателя.

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

/** Делитель: батарея 9 В, 1 кОм и 2 кОм последовательно. */
function dividerCanvas(): CanvasState {
  return canvasOf(
    [
      component('b', 'battery'),
      component('r1', 'resistor', { resistance: 1000 }),
      component('r2', 'resistor', { resistance: 2000 }),
    ],
    [
      wire('w1', pin('b', 0), pin('r1', 0)),
      wire('w2', pin('r1', 1), pin('r2', 0)),
      wire('w3', pin('r2', 1), pin('b', 1)),
    ],
  );
}

/** Контур с выключателем: батарея — выключатель — лампочка. */
function switchedLoop(closed: boolean): CanvasState {
  return canvasOf(
    [component('b', 'battery'), component('sw', 'switch', { closed }), component('lamp1', 'lamp')],
    [
      wire('w1', pin('b', 0), pin('sw', 0)),
      wire('w2', pin('sw', 1), pin('lamp1', 0)),
      wire('w3', pin('lamp1', 1), pin('b', 1)),
    ],
  );
}

describe('measureVoltage: напряжение между щупами', () => {
  it('совпадает с расчётом Симулятора: середина делителя — 6 В над землёй', () => {
    const solution = solveDc(dividerCanvas());
    // аналитика без учёта внутреннего сопротивления: 9 · 2к / (1к + 2к)
    const reading = measureVoltage(solution, pin('r1', 1), pin('b', 1))!;
    expect(reading.unit).toBe('В');
    expect(reading.value).toBeCloseTo(6, 1);
  });

  it('щупы в одной точке схемы (соединённой Проводом) — 0 В', () => {
    const solution = solveDc(dividerCanvas());
    const reading = measureVoltage(solution, pin('b', 0), pin('r1', 0))!;
    expect(reading.value).toBe(0);
  });

  it('перестановка щупов меняет знак: −6 В', () => {
    const solution = solveDc(dividerCanvas());
    expect(measureVoltage(solution, pin('b', 1), pin('r1', 1))!.value).toBeCloseTo(-6, 1);
  });

  it('обрыв честен: всё напряжение источника на разомкнутом контакте', () => {
    const solution = solveDc(switchedLoop(false));
    expect(measureVoltage(solution, pin('sw', 0), pin('sw', 1))!.value).toBeCloseTo(9, 1);
  });

  it('отдельная батарея без Проводов: на зажимах ЭДС', () => {
    const solution = solveDc(canvasOf([component('b', 'battery')], []));
    expect(measureVoltage(solution, pin('b', 0), pin('b', 1))!.value).toBeCloseTo(9, 9);
  });

  it('щупы без общей цепи (разные острова) — измерение невозможно: null', () => {
    const solution = solveDc(canvasOf([component('b', 'battery'), component('r', 'resistor')], []));
    expect(measureVoltage(solution, pin('b', 0), pin('r', 0))).toBeNull();
  });

  it('щуп на несуществующем Компоненте — null', () => {
    const solution = solveDc(dividerCanvas());
    expect(measureVoltage(solution, pin('нет', 0), pin('b', 1))).toBeNull();
  });
});

describe('measureCurrent: ток ветви', () => {
  it('замкнутый контур: ток лампочки совпадает с расчётом (9 В / 120,1 Ом)', () => {
    const solution = solveDc(switchedLoop(true));
    const reading = measureCurrent(solution, 'lamp1')!;
    expect(reading.unit).toBe('А');
    expect(reading.value).toBeCloseTo(9 / 120.1, 4);
  });

  it('после размыкания выключателя — честное «нет тока»: ровно 0 А', () => {
    const open = solveDc(switchedLoop(false));
    expect(measureCurrent(open, 'lamp1')!.value).toBe(0);
    expect(measureCurrent(open, 'sw')!.value).toBe(0);
  });

  it('ток — модуль: ориентация Компонента не наказывается', () => {
    // контур, собранный «наоборот»: через лампочку ток течёт от вывода 1 к выводу 0
    const reversed = canvasOf(
      [component('b', 'battery'), component('lamp1', 'lamp')],
      [
        wire('w1', pin('b', 0), pin('lamp1', 1)),
        wire('w2', pin('lamp1', 0), pin('b', 1)),
      ],
    );
    const solution = solveDc(reversed);
    expect(measureCurrent(solution, 'lamp1')!.value).toBeCloseTo(9 / 120.1, 4);
  });

  it('остров без источника: ток 0; неизвестный Компонент — null', () => {
    const solution = solveDc(canvasOf([component('r', 'resistor')], []));
    expect(measureCurrent(solution, 'r')!.value).toBe(0);
    expect(measureCurrent(solution, 'нет')).toBeNull();
  });
});
