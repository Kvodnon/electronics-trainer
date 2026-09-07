import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, PlacedComponent, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import { isLampLit } from './simulator';
import {
  acAmplitudesOf,
  acFrequencyOf,
  amplitudeResponseOf,
  effectiveReadings,
  frequencyResponseOf,
  phaseDegOf,
  phasorReading,
  RESPONSE_SWEEP_HZ,
  rmsOf,
  solveCircuit,
  solvePhasor,
} from './phasor';

// Golden-тесты фазорного режима (spec: Testing Decisions): эталонные RC- и
// RL-цепи с известными амплитудами, фазами и действующими значениями,
// сравнение с аналитикой с допуском. Допуску разрешено поглощать внутреннее
// сопротивление источников (0,1 Ом у батареи и источника ~).

const component = (id: string, kind: ComponentKind, values: Partial<PlacedComponent> = {}): PlacedComponent => ({
  id,
  kind,
  x: 0,
  y: 0,
  rotation: 0,
  ...defaultValuesOf(kind),
  ...values,
});



const canvasOf = (components: PlacedComponent[], wires: Wire[]): CanvasState => ({ components, wires });

/** Сравнение с аналитикой: относительный допуск (по умолчанию 0,2%). */
function expectCloseTo(actual: number, expected: number, relativeTolerance = 0.002): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relativeTolerance * Math.abs(expected));
}

/** Последовательный контур: источник ~ — R — (конец на минус источника). */
function seriesLoop(extra: PlacedComponent[]): CanvasState {
  const source = component('src', 'acsource', { voltage: 10, frequency: 50 });
  return canvasOf([source, ...extra], loopWires('src', extra.map((c) => c.id)));
}

/** Провода кольца «по стрелке»: «плюс» источника — в вывод 0 первого Компонента,
 * ток идёт сквозь каждый Компонент от вывода 0 к выводу 1 и возвращается в «минус». */
function loopWires(sourceId: string, ids: readonly string[]): Wire[] {
  const wires: Wire[] = [
    { id: 'w1', from: { componentId: sourceId, pin: 0 }, to: { componentId: ids[0], pin: 0 } },
  ];
  ids.forEach((id, index) => {
    const last = index + 1 === ids.length;
    wires.push({
      id: `w${index + 2}`,
      from: { componentId: id, pin: 1 },
      to: last
        ? { componentId: sourceId, pin: 1 }
        : { componentId: ids[index + 1], pin: 0 },
    });
  });
  return wires;
}

describe('solvePhasor: golden-тесты RC-цепи на переменном токе', () => {
  it('RC на частоте среза: амплитуда на конденсаторе A/√2, фаза −45°, ток A/(R√2)', () => {
    const R = 1000;
    const C = 1e-6;
    const cutoff = 1 / (2 * Math.PI * R * C); // 159,15 Гц
    const canvas = seriesLoop([
      component('r', 'resistor', { resistance: R }),
      component('c', 'capacitor', { capacitance: C }),
    ]);
    const phasor = solvePhasor(canvas, cutoff)!;
    const resistor = phasorReading(phasor, 'r')!;
    const capacitor = phasorReading(phasor, 'c')!;
    const source = phasorReading(phasor, 'src')!;

    // |V_C| = A · X_C / √(R² + X_C²) = A/√2 на частоте среза
    expectCloseTo(Math.hypot(capacitor.voltage.re, capacitor.voltage.im), 10 / Math.SQRT2);
    // ток отстаёт... нет, в RC ток опережает: фаза тока +45°
    expectCloseTo(phaseDegOf(resistor.current), 45, 0.01);
    expectCloseTo(phaseDegOf(capacitor.voltage), -45, 0.01);
    expectCloseTo(Math.hypot(resistor.current.re, resistor.current.im), 10 / (R * Math.SQRT2));
    // сумма амплитуд напряжений сходится с ЭДС источника
    const rAbs = Math.hypot(resistor.voltage.re, resistor.voltage.im);
    expectCloseTo(rAbs * rAbs + (10 / Math.SQRT2) ** 2, 100);
    expectCloseTo(Math.hypot(source.voltage.re, source.voltage.im), 10 - 10 / (R * Math.SQRT2) * 0.1, 0.01);
  });

  it('ФНЧ на десятикратной частоте среза: конденсатор режет амплитуду до ~A/10', () => {
    const R = 1000;
    const C = 1e-6;
    const cutoff = 1 / (2 * Math.PI * R * C);
    const canvas = seriesLoop([
      component('r', 'resistor', { resistance: R }),
      component('c', 'capacitor', { capacitance: C }),
    ]);
    const phasor = solvePhasor(canvas, 10 * cutoff)!;
    const capacitor = phasorReading(phasor, 'c')!;
    // |V_C| = A / √(1 + (f/f_c)²) ≈ A/10
    expectCloseTo(Math.hypot(capacitor.voltage.re, capacitor.voltage.im), 10 / Math.sqrt(101), 0.01);
  });

  it('конденсатор с ростом частоты проводит лучше: на низкой частоте ток мал', () => {
    const R = 1000;
    const C = 1e-6;
    const cutoff = 1 / (2 * Math.PI * R * C);
    const canvas = seriesLoop([
      component('r', 'resistor', { resistance: R }),
      component('c', 'capacitor', { capacitance: C }),
    ]);
    const phasor = solvePhasor(canvas, cutoff / 100)!;
    const capacitor = phasorReading(phasor, 'c')!;
    expectCloseTo(Math.hypot(capacitor.current.re, capacitor.current.im), 2 * Math.PI * (cutoff / 100) * C * 10, 0.01);
  });
});

describe('solvePhasor: golden-тесты RL-цепи на переменном токе', () => {
  it('RL на частоте, где X_L = R: амплитуды A/√2, ток отстаёт на 45°', () => {
    const R = 100;
    const L = 1;
    const frequency = R / (2 * Math.PI * L); // X_L = ωL = R
    const canvas = seriesLoop([
      component('r', 'resistor', { resistance: R }),
      component('l', 'inductor', { inductance: L }),
    ]);
    const phasor = solvePhasor(canvas, frequency)!;
    const inductor = phasorReading(phasor, 'l')!;
    const resistor = phasorReading(phasor, 'r')!;

    expectCloseTo(Math.hypot(inductor.voltage.re, inductor.voltage.im), 10 / Math.SQRT2);
    expectCloseTo(Math.hypot(resistor.voltage.re, resistor.voltage.im), 10 / Math.SQRT2);
    // в RL ток отстаёт от ЭДС: фаза тока −45°
    expectCloseTo(phaseDegOf(resistor.current), -45, 0.01);
    expectCloseTo(phaseDegOf(inductor.voltage), 45, 0.01);
    expect(phasor.frequency).toBeCloseTo(frequency, 6);
    expect(phasor.angularFrequency).toBeCloseTo(2 * Math.PI * frequency, 6);
  });
});

describe('solveCircuit: суперпозиция DC и AC', () => {
  it('батарея и источник ~ в одной цепи: постоянная и переменная составляющие раздельны', () => {
    const R = 10;
    const canvas = canvasOf(
      [
        component('b', 'battery', { voltage: 9 }),
        component('r', 'resistor', { resistance: R }),
        component('src', 'acsource', { voltage: 4, frequency: 50 }),
      ],
      loopWires('b', ['r', 'src']),
    );
    const solution = solveCircuit(canvas)!;
    expect(solution.phasor).not.toBeNull();

    // постоянная составляющая: 9 В / (R + r_батареи + r_источника) — источник ~ погашен
    const dcCurrent = solution.dc.readings.find((reading) => reading.componentId === 'r')!.current;
    expectCloseTo(dcCurrent, 9 / (R + 0.1 + 0.1));

    // переменная составляющая: 4 В на том же сопротивлении — батареи погашены
    const acCurrent = Math.hypot(
      solution.phasor!.readings.find((reading) => reading.componentId === 'r')!.current.re,
      solution.phasor!.readings.find((reading) => reading.componentId === 'r')!.current.im,
    );
    expectCloseTo(acCurrent, 4 / (R + 0.1 + 0.1));

    // действующее значение полной величины: √(DC² + (A/√2)²)
    expectCloseTo(rmsOf(Math.abs(dcCurrent), acCurrent), Math.hypot(9 / 10.2, (4 / 10.2) / Math.SQRT2));
  });

  it('чисто постоянная схема: фазорной составляющей нет, решение совпадает с solveDc', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      loopWires('b', ['r']),
    );
    const solution = solveCircuit(canvas)!;
    expect(solution.phasor).toBeNull();
    expect(acFrequencyOf(canvas)).toBeNull();
    expect(solution.dc.readings).toHaveLength(2);
    expectCloseTo(solution.dc.readings.find((reading) => reading.componentId === 'r')!.current, 0.009);
  });

  it('частота берётся у первого источника ~', () => {
    const canvas = canvasOf([component('src', 'acsource', { frequency: 60 })], []);
    expect(acFrequencyOf(canvas)).toBe(60);
    expect(acFrequencyOf(canvasOf([component('r', 'resistor')], []))).toBeNull();
  });
});

describe('effectiveReadings: живое поведение на переменном токе', () => {
  it('лампочка на переменном токе светится по действующей мощности', () => {
    // лампа 120 Ом прямо на источнике 5 В 50 Гц (параллельно его зажимам):
    // P = V_действ²/R ≈ (10·120.1/120.2/√2)²/120.1 ≈ 0,416 Вт — выше порога 0,02 Вт
    const canvas = seriesLoop([component('lamp', 'lamp')]);
    const solution = solveCircuit(canvas)!;
    const readings = effectiveReadings(canvas, solution);
    const lamp = readings.get('lamp')!;
    const lampAmplitude = 10 * (120.1 / 120.2);
    expect(lamp.power).toBeCloseTo((lampAmplitude / Math.SQRT2) ** 2 / 120.1, 3);
    expect(isLampLit(lamp)).toBe(true);
  });

  it('в чисто постоянной схеме показания не меняются', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('lamp', 'lamp')],
      loopWires('b', ['lamp']),
    );
    const solution = solveCircuit(canvas)!;
    const readings = effectiveReadings(canvas, solution);
    expectCloseTo(readings.get('lamp')!.current, 9 / 120.1);
  });
});

describe('acAmplitudesOf: амплитуды для оверлея', () => {
  it('амплитуды на Компонентах и Проводах кольца сходятся с фазорным решением', () => {
    const R = 1000;
    const C = 1e-6;
    const canvas = seriesLoop([
      component('r', 'resistor', { resistance: R }),
      component('c', 'capacitor', { capacitance: C }),
    ]);
    const solution = solveCircuit(canvas)!;
    const amplitudes = acAmplitudesOf(canvas, solution)!;
    // частота — от источника ~, у которого она по умолчанию 50 Гц
    expect(amplitudes.frequency).toBe(50);

    const loopImpedance = Math.hypot(R, 1 / (2 * Math.PI * 50 * C));
    const loopCurrent = 10 / loopImpedance;

    const capacitor = amplitudes.componentAmplitudes.get('c')!;
    expectCloseTo(capacitor.current, loopCurrent);
    expectCloseTo(capacitor.voltage, loopCurrent / (2 * Math.PI * 50 * C));
    // вместе с амплитудами оверлей получает фазу тока и действующее значение
    expectCloseTo(capacitor.currentPhaseDeg, phaseDegOf(
      (solution.phasor!.readings.find((reading) => reading.componentId === 'c')!).current,
    ));
    expectCloseTo(capacitor.voltageRms, capacitor.voltage / Math.SQRT2);

    // в кольце из трёх Компонентов у каждого Провода один ток — амплитуда контура
    for (const [wireId, current] of amplitudes.wireAmplitudes) {
      expect(current, `Провод ${wireId}`).not.toBeNull();
      expectCloseTo(current!, loopCurrent);
    }
  });

  it('нет источника ~ — амплитуд нет: null', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      loopWires('b', ['r']),
    );
    expect(acAmplitudesOf(canvas, solveCircuit(canvas)!)).toBeNull();
  });
});

describe('АЧХ: свип фазоров по частоте (тикет 21)', () => {
  /** ФНЧ: источник ~ 10 В — R 1 кОм — C 100 мкФ, выход на конденсаторе. */
  function lowPass(): CanvasState {
    return seriesLoop([
      component('r', 'resistor', { resistance: 1000 }),
      component('c', 'capacitor', { capacitance: 100e-6 }),
    ]);
  }

  /** Частота среза ФНЧ: fc = 1/(2πRC) ≈ 1,5915 Гц. */
  const CUT_OFF = 1 / (2 * Math.PI * 1000 * 100e-6);

  it('на частоте среза амплитуда на конденсаторе A/√2, на десятикратной — ~A/10', () => {
    const response = frequencyResponseOf(lowPass(), 'capacitor', [CUT_OFF, 10 * CUT_OFF]);

    expect(response).toHaveLength(2);
    expectCloseTo(response[0].amplitude, 10 / Math.SQRT2);
    expectCloseTo(response[1].amplitude, 10 / Math.sqrt(101));
  });

  it('ФВЧ: выход на резисторе — амплитуда с частотой растёт, на низкой частоте режется', () => {
    const highPass = seriesLoop([
      component('c', 'capacitor', { capacitance: 100e-6 }),
      component('r', 'resistor', { resistance: 1000 }),
    ]);

    const response = frequencyResponseOf(highPass, 'resistor', [CUT_OFF / 10, CUT_OFF]);

    expectCloseTo(response[0].amplitude, 10 / Math.sqrt(101));
    expectCloseTo(response[1].amplitude, 10 / Math.SQRT2);
  });

  it('стандартная сетка АЧХ — логарифм, 10 точек на декаду, от 1 Гц до 100 кГц', () => {
    expect(RESPONSE_SWEEP_HZ).toHaveLength(51);
    expect(RESPONSE_SWEEP_HZ[0]).toBeCloseTo(1);
    expect(RESPONSE_SWEEP_HZ[RESPONSE_SWEEP_HZ.length - 1]).toBeCloseTo(100_000);
    for (let index = 1; index < RESPONSE_SWEEP_HZ.length; index += 1) {
      expect(RESPONSE_SWEEP_HZ[index] / RESPONSE_SWEEP_HZ[index - 1]).toBeCloseTo(10 ** 0.1);
    }
  });

  it('amplitudeResponseOf проходит стандартную сетку: ФНЧ монотонно спадает после среза', () => {
    const response = amplitudeResponseOf(lowPass(), 'capacitor');

    expect(response).toHaveLength(RESPONSE_SWEEP_HZ.length);
    for (let index = 0; index < response.length; index += 1) {
      expect(response[index].frequency).toBeCloseTo(RESPONSE_SWEEP_HZ[index]);
    }
    // 1 Гц — уже рядом со срезом 1,59 Гц, а дальше кривая только спадает
    expectCloseTo(response[0].amplitude, 10 / Math.sqrt(1 + (1 / CUT_OFF) ** 2));
    for (let index = 1; index < response.length; index += 1) {
      expect(response[index].amplitude).toBeLessThanOrEqual(response[index - 1].amplitude + 1e-9);
    }
  });

  it('выходом становится первый Компонент вида на Холсте', () => {
    const twoResistors = seriesLoop([
      component('r1', 'resistor', { resistance: 1000 }),
      component('r2', 'resistor', { resistance: 3000 }),
    ]);

    const response = frequencyResponseOf(twoResistors, 'resistor', [10]);
    // делитель 1 кОм + 3 кОм: первому резистору достаётся четверть ЭДС —
    // берётся он, а не второй (на котором 7,5 В)
    expectCloseTo(response[0].amplitude, 2.5);
  });

  it('без источника ~ или без Компонента вида выход — нулевые амплитуды', () => {
    const sourceless = canvasOf(
      [component('r', 'resistor'), component('c', 'capacitor')],
      [{ id: 'w1', from: { componentId: 'r', pin: 1 }, to: { componentId: 'c', pin: 0 } }],
    );
    expect(amplitudeResponseOf(sourceless, 'capacitor').every((point) => point.amplitude === 0)).toBe(true);
    expect(amplitudeResponseOf(lowPass(), 'inductor').every((point) => point.amplitude === 0)).toBe(true);
  });
});
