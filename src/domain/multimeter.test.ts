import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, PinRef, PlacedComponent, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import { solveCircuit } from './phasor';
import { emptyProbes, measure, measureCurrent, measureVoltage, probePoints } from './multimeter';

// Мультиметр читает решение Симулятора (ADR-0001): напряжение между щупами —
// разность узловых потенциалов, ток ветви — ветвевое показание. Золотые схемы
// с аналитикой; допуск — как у решателя. Схемы с источником ~ дополняются
// амплитудой, фазой и действующим значением.

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

/** Решение без null: тестовая схема обязана сойтись. */
function solve(canvas: CanvasState) {
  const solution = solveCircuit(canvas);
  if (solution === null) throw new Error('тестовая схема не сошлась');
  return solution;
}

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
    const solution = solve(dividerCanvas());
    // аналитика без учёта внутреннего сопротивления: 9 · 2к / (1к + 2к)
    const reading = measureVoltage(solution, pin('r1', 1), pin('b', 1))!;
    expect(reading.unit).toBe('В');
    expect(reading.value).toBeCloseTo(6, 1);
  });

  it('щупы в одной точке схемы (соединённой Проводом) — 0 В', () => {
    const solution = solve(dividerCanvas());
    const reading = measureVoltage(solution, pin('b', 0), pin('r1', 0))!;
    expect(reading.value).toBe(0);
  });

  it('перестановка щупов меняет знак: −6 В', () => {
    const solution = solve(dividerCanvas());
    expect(measureVoltage(solution, pin('b', 1), pin('r1', 1))!.value).toBeCloseTo(-6, 1);
  });

  it('обрыв честен: всё напряжение источника на разомкнутом контакте', () => {
    const solution = solve(switchedLoop(false));
    expect(measureVoltage(solution, pin('sw', 0), pin('sw', 1))!.value).toBeCloseTo(9, 1);
  });

  it('отдельная батарея без Проводов: на зажимах ЭДС', () => {
    const solution = solve(canvasOf([component('b', 'battery')], []));
    expect(measureVoltage(solution, pin('b', 0), pin('b', 1))!.value).toBeCloseTo(9, 9);
  });

  it('щупы без общей цепи (разные острова) — измерение невозможно: null', () => {
    const solution = solve(canvasOf([component('b', 'battery'), component('r', 'resistor')], []));
    expect(measureVoltage(solution, pin('b', 0), pin('r', 0))).toBeNull();
  });

  it('щуп на несуществующем Компоненте — null', () => {
    const solution = solve(dividerCanvas());
    expect(measureVoltage(solution, pin('нет', 0), pin('b', 1))).toBeNull();
  });
});

describe('measure и probePoints: шов экрана', () => {
  it('без щупов — idle; со щупами без общей цепи — unavailable; со схемой — ok', () => {
    const solution = solve(switchedLoop(true));
    expect(measure(solution, 'voltage', emptyProbes)).toEqual({ status: 'idle' });
    expect(measure(null, 'voltage', { ...emptyProbes, red: pin('b', 0), black: pin('b', 1) })).toEqual({
      status: 'unavailable',
    });
    const ok = measure(solution, 'voltage', { ...emptyProbes, red: pin('b', 0), black: pin('b', 1) });
    expect(ok.status).toBe('ok');
    expect(ok.status === 'ok' && ok.reading.value).toBeCloseTo(9, 1);
  });

  it('в режиме тока та же лестница состояний по ветви', () => {
    const solution = solve(switchedLoop(true));
    expect(measure(solution, 'current', emptyProbes)).toEqual({ status: 'idle' });
    expect(measure(solution, 'current', { ...emptyProbes, branch: 'нет' })).toEqual({
      status: 'unavailable',
    });
    const ok = measure(solution, 'current', { ...emptyProbes, branch: 'lamp1' });
    expect(ok.status).toBe('ok');
  });

  it('probePoints: приложенные точки в режиме напряжения, оба конца ветви в режиме тока', () => {
    const voltageProbes = { ...emptyProbes, red: pin('b', 0), black: pin('b', 1) };
    expect(probePoints('voltage', emptyProbes)).toEqual([]);
    expect(probePoints('voltage', voltageProbes)).toEqual([
      { ref: pin('b', 0), color: 'red' },
      { ref: pin('b', 1), color: 'black' },
    ]);
    expect(probePoints('current', emptyProbes)).toEqual([]);
    expect(probePoints('current', { ...emptyProbes, branch: 'lamp1' })).toEqual([
      { ref: pin('lamp1', 0), color: 'red' },
      { ref: pin('lamp1', 1), color: 'black' },
    ]);
  });
});

describe('measureCurrent: ток ветви', () => {
  it('замкнутый контур: ток лампочки совпадает с расчётом (9 В / 120,1 Ом)', () => {
    const solution = solve(switchedLoop(true));
    const reading = measureCurrent(solution, 'lamp1')!;
    expect(reading.unit).toBe('А');
    expect(reading.value).toBeCloseTo(9 / 120.1, 4);
  });

  it('после размыкания выключателя — честное «нет тока»: ровно 0 А', () => {
    const open = solve(switchedLoop(false));
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
    const solution = solve(reversed);
    expect(measureCurrent(solution, 'lamp1')!.value).toBeCloseTo(9 / 120.1, 4);
  });

  it('остров без источника: ток 0; неизвестный Компонент — null', () => {
    const solution = solve(canvasOf([component('r', 'resistor')], []));
    expect(measureCurrent(solution, 'r')!.value).toBe(0);
    expect(measureCurrent(solution, 'нет')).toBeNull();
  });
});

describe('Измерения в схеме с источником ~: амплитуда, фаза, RMS (М4, тикет 20)', () => {
  /** Контур «по стрелке»: источник 5 В 50 Гц — резистор 10 Ом — конденсатор 100 мкФ. */
  function rcCanvas(): CanvasState {
    return canvasOf(
      [
        component('src', 'acsource', { voltage: 5, frequency: 50 }),
        component('r', 'resistor', { resistance: 10 }),
        component('c', 'capacitor', { capacitance: 100e-6 }),
      ],
      [
        wire('w1', pin('src', 0), pin('r', 0)),
        wire('w2', pin('r', 1), pin('c', 0)),
        wire('w3', pin('c', 1), pin('src', 1)),
      ],
    );
  }

  it('напряжение на резисторе: DC 0, амплитуда с делителем, RMS = амплитуда/√2', () => {
    const reading = measureVoltage(solve(rcCanvas()), pin('r', 0), pin('r', 1))!;
    expect(reading.value).toBeCloseTo(0, 9);
    const xC = 1 / (2 * Math.PI * 50 * 100e-6);
    const loopImpedance = Math.hypot(10.1, xC);
    const amplitude = 5 * (10 / loopImpedance);
    expect(reading.ac).toBeDefined();
    expect(reading.ac!.frequency).toBe(50);
    expect(reading.ac!.amplitude).toBeCloseTo(amplitude, 3);
    expect(reading.ac!.rms).toBeCloseTo(amplitude / Math.SQRT2, 3);
  });

  it('перестановка щупов переворачивает и постоянную, и переменную составляющую', () => {
    const solution = solve(rcCanvas());
    const forward = measureVoltage(solution, pin('r', 0), pin('r', 1))!;
    const backward = measureVoltage(solution, pin('r', 1), pin('r', 0))!;
    expect(backward.value).toBeCloseTo(-forward.value, 9);
    expect(backward.ac!.amplitude).toBeCloseTo(forward.ac!.amplitude, 9);
    expect(Math.abs(backward.ac!.phaseDeg - forward.ac!.phaseDeg)).toBeCloseTo(180, 6);
  });

  it('ток ветви: амплитуда и фаза из фазорного решения, RMS полной величины', () => {
    const reading = measureCurrent(solve(rcCanvas()), 'r')!;
    const xC = 1 / (2 * Math.PI * 50 * 100e-6);
    const amplitude = 5 / Math.hypot(10.1, xC);
    expect(reading.value).toBe(0);
    expect(reading.ac!.amplitude).toBeCloseTo(amplitude, 4);
    expect(reading.ac!.rms).toBeCloseTo(amplitude / Math.SQRT2, 4);
  });

  it('в схеме без источника ~ поле ac отсутствует — прежнее поведение', () => {
    const reading = measureVoltage(solve(dividerCanvas()), pin('r1', 1), pin('b', 1))!;
    expect(reading.ac).toBeUndefined();
    expect(measureCurrent(solve(switchedLoop(true)), 'lamp1')!.ac).toBeUndefined();
  });
});
