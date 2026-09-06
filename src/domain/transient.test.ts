import { describe, expect, it } from 'vitest';
import { defaultValuesOf, type CanvasState, type ComponentKind, type PlacedComponent, type Wire } from './canvas';
import { toggledContactStates, solveTransient, voltageAt } from './transient';
import type { TransientPlan } from './task';

/**
 * Переходный Симулятор (тикет 14) — golden-тесты: кривая напряжения
 * конденсатора сходится к аналитическому решению RC-цепи с допуском.
 * Заряд и разряд через резистор, ключ, переключающийся в заданный момент,
 * постоянная времени по расчёту.
 */

/** Компонент с номиналами по умолчанию и заданными правками. */
function comp(id: string, kind: ComponentKind, values: Partial<PlacedComponent> = {}): PlacedComponent {
  return { id, kind, x: 0, y: 0, rotation: 0, ...defaultValuesOf(kind), ...values };
}

/** Последовательное кольцо: вывод 1 каждого Компонента — с выводом 0 следующего. */
function ring(...components: readonly PlacedComponent[]): CanvasState {
  const wires: Wire[] = components.map((component, index) => {
    const next = components[(index + 1) % components.length];
    return {
      id: `w${index + 1}`,
      from: { componentId: component.id, pin: 1 },
      to: { componentId: next.id, pin: 0 },
    };
  });
  return { components: [...components], wires };
}

/** Параллельная пара на одном узле: выводы 1 соединены вместе, выводы 0 — тоже. */
function parallel(a: PlacedComponent, b: PlacedComponent): Wire[] {
  return [
    { id: `wp${b.id}a`, from: { componentId: a.id, pin: 0 }, to: { componentId: b.id, pin: 0 } },
    { id: `wp${b.id}b`, from: { componentId: a.id, pin: 1 }, to: { componentId: b.id, pin: 1 } },
  ];
}

describe('Заряд конденсатора через резистор: сходимость к аналитическому решению', () => {
  // батарея 9 В (r = 0,1 Ом) — резистор 10 кОм — конденсатор 100 мкФ
  const canvas = ring(
    comp('bat', 'battery'),
    comp('r', 'resistor', { resistance: 10_000 }),
    comp('c', 'capacitor'),
  );
  const plan: TransientPlan = { duration: 5 };
  const solution = solveTransient(canvas, plan);

  it('кривая стартует с нуля (конденсатор не заряжен)', () => {
    expect(voltageAt(solution, 'c', 0)).toBeCloseTo(0, 9);
  });

  it('в момент τ конденсатор заряжен до ~63% источника', () => {
    // τ = (R + r)·C = 1,00001 с; U(τ) = 9·(1 − e⁻¹) ≈ 5,68 В
    expect(voltageAt(solution, 'c', 1)).toBeCloseTo(9 * (1 - Math.exp(-1 / 1.00001)), 2);
  });

  it('к концу 5τ напряжение почти сравнялось с источником', () => {
    expect(voltageAt(solution, 'c', 5)).toBeCloseTo(9 * (1 - Math.exp(-5 / 1.00001)), 2);
  });

  it('постоянная времени считается по сопротивлению цепи: τ = R·C', () => {
    expect(solution.timeConstants.get('c')).toBeCloseTo(1.00001, 4);
  });

  it('сетка времени покрывает план: от 0 до duration с равномерным шагом', () => {
    expect(solution.times[0]).toBe(0);
    expect(solution.times[solution.times.length - 1]).toBeCloseTo(5, 9);
  });
});

describe('Ключ переключается в заданный момент: до него схема ждёт', () => {
  // выключатель нарисован разомкнутым и замыкается сам в t = 0,5 с
  const canvas = ring(
    comp('bat', 'battery'),
    comp('sw', 'switch', { closed: false }),
    comp('r', 'resistor', { resistance: 10_000 }),
    comp('c', 'capacitor'),
  );
  const plan: TransientPlan = { duration: 3, switchToggleTime: 0.5 };
  const solution = solveTransient(canvas, plan);

  it('до переключения конденсатор не заряжается', () => {
    expect(voltageAt(solution, 'c', 0.4)).toBeCloseTo(0, 3);
  });

  it('после переключения идёт обычный заряд: за 2,5 с конденсатор почти полон', () => {
    expect(voltageAt(solution, 'c', 3)).toBeCloseTo(9 * (1 - Math.exp(-2.5 / 1.00001)), 2);
  });
});

describe('Разряд конденсатора через резистор: экспонента вниз', () => {
  // батарея — замкнутый выключатель — R1 — (конденсатор ∥ R2);
  // в t = 1 с выключатель размыкается, и конденсатор разряжается через R2
  const c = comp('c', 'capacitor');
  const r2 = comp('r2', 'resistor', { resistance: 1000 });
  const r1 = comp('r1', 'resistor', { resistance: 1000 });
  const canvas: CanvasState = {
    components: [comp('bat', 'battery'), comp('sw', 'switch', { closed: true }), r1, c, r2],
    wires: [
      { id: 'w1', from: { componentId: 'bat', pin: 1 }, to: { componentId: 'sw', pin: 0 } },
      { id: 'w2', from: { componentId: 'sw', pin: 1 }, to: { componentId: 'r1', pin: 0 } },
      { id: 'w3', from: { componentId: 'r1', pin: 1 }, to: { componentId: 'c', pin: 0 } },
      ...parallel(c, r2),
      { id: 'w5', from: { componentId: 'c', pin: 1 }, to: { componentId: 'bat', pin: 0 } },
      { id: 'w6', from: { componentId: 'r2', pin: 1 }, to: { componentId: 'bat', pin: 0 } },
    ],
  };
  const plan: TransientPlan = { duration: 1.2, switchToggleTime: 1 };
  const solution = solveTransient(canvas, plan);

  /** Напряжение заряда к моменту переключения (Thevenin фазы заряда). */
  const vCharged = 9 * (1000 / (1000 + 1000 + 0.1));
  /** Постоянная времени разряда: после размыкания конденсатор видит только R2. */
  const tau = 1000 * 1e-4;

  it('постоянная времени — по резистивному пути конденсатора', () => {
    expect(solution.timeConstants.get('c')).toBeCloseTo(tau, 5);
  });

  it('к моменту переключения конденсатор заряжен до делителя R2', () => {
    // τ заряда совпадает с τ разряда → за 1 с заряд полный (e⁻²⁰ ≈ 0)
    expect(voltageAt(solution, 'c', 1)).toBeCloseTo(vCharged, 2);
  });

  it('разряд идёт по экспоненте с той же постоянной времени', () => {
    expect(voltageAt(solution, 'c', 1.1)).toBeCloseTo(vCharged * Math.exp(-0.1 / tau), 2);
    expect(voltageAt(solution, 'c', 1.2)).toBeCloseTo(vCharged * Math.exp(-0.2 / tau), 2);
  });
});

describe('Постоянная времени не определяется без резистивного пути', () => {
  it('разомкнутый ключ в конечном состоянии — τ бесконечна, кривая не растёт', () => {
    const canvas = ring(
      comp('bat', 'battery'),
      comp('sw', 'switch', { closed: false }),
      comp('r', 'resistor', { resistance: 10_000 }),
      comp('c', 'capacitor'),
    );
    const solution = solveTransient(canvas, { duration: 2 });

    expect(solution.timeConstants.get('c')).toBe(Number.POSITIVE_INFINITY);
    expect(voltageAt(solution, 'c', 2)).toBeCloseTo(0, 3);
  });
});

describe('Переключение всех коммутаторов как правило переходного режима', () => {
  it('замкнутые размыкаются, разомкнутые замыкаются', () => {
    const canvas = {
      components: [
        comp('sw1', 'switch', { closed: true }),
        comp('sw2', 'switch', { closed: false }),
        comp('pb', 'pushbutton', { closed: true }),
      ],
      wires: [],
    };
    const toggled = toggledContactStates(canvas);
    expect(toggled.get('sw1')).toBe(false);
    expect(toggled.get('sw2')).toBe(true);
    expect(toggled.get('pb')).toBe(false);
  });
});

describe('Крайние случаи', () => {
  it('схема без конденсаторов — кривых нет, сетка времени есть', () => {
    const solution = solveTransient(ring(comp('bat', 'battery'), comp('lamp', 'lamp')), { duration: 2 });
    expect(solution.capacitorVoltages.size).toBe(0);
    expect(solution.times.length).toBeGreaterThan(1);
  });

  it('схема без источника не ломает решатель: конденсатор молчит', () => {
    const solution = solveTransient(ring(comp('r', 'resistor'), comp('c', 'capacitor')), { duration: 1 });
    expect(voltageAt(solution, 'c', 1)).toBeCloseTo(0, 9);
  });

  it('два конденсатора последовательно делят напряжение поровну в конце', () => {
    const solution = solveTransient(
      ring(comp('bat', 'battery'), comp('c1', 'capacitor'), comp('c2', 'capacitor')),
      { duration: 0.1 },
    );
    // в постоянном режиме ток прекратился: равный заряд → по 4,5 В
    expect(voltageAt(solution, 'c1', 0.1)).toBeCloseTo(4.5, 1);
    expect(voltageAt(solution, 'c2', 0.1)).toBeCloseTo(4.5, 1);
  });

  it('voltageAt за границами плана зажимается к краям кривой', () => {
    const solution = solveTransient(
      ring(comp('bat', 'battery'), comp('r', 'resistor'), comp('c', 'capacitor')),
      { duration: 2 },
    );
    expect(voltageAt(solution, 'c', -5)).toBe(voltageAt(solution, 'c', 0));
    expect(voltageAt(solution, 'c', 100)).toBe(voltageAt(solution, 'c', 2));
    expect(voltageAt(solution, 'нет-такого', 1)).toBeNull();
  });
});
