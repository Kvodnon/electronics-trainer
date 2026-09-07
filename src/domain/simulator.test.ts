import { describe, expect, it } from 'vitest';
import type { CanvasState, ComponentKind, LedColor, PlacedComponent, PinRef, Wire } from './canvas';
import { defaultValuesOf } from './canvas';
import {
  BATTERY_INTERNAL_RESISTANCE,
  BUZZER_SOUND_CURRENT,
  DIODE_FORWARD_VOLTAGE,
  DIODE_ON_RESISTANCE,
  TRANSISTOR_BETA,
  TRANSISTOR_R_BE,
  TRANSISTOR_V_BE_ON,
  isBuzzerSounding,
  isLampLit,
  isLedLit,
  isMotorSpinning,
  lampBrightness,
  ledBrightness,
  LED_FORWARD_VOLTAGE,
  LED_FULL_CURRENT,
  LED_LIT_CURRENT,
  readingOf,
  readingsOfKind,
  solveDc,
  wireCurrents,
} from './simulator';

// Golden-тесты решателя (spec: Testing Decisions): эталонные схемы с известными
// токами и напряжениями, сравнение с аналитикой с допуском. Внутреннее
// устройство (матрицы MNA, порядок узлов) тестами не фиксируется.

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

/** Сравнение с аналитикой: относительный допуск (по умолчанию 1%). */
function expectCloseTo(actual: number, expected: number, relativeTolerance = 0.01): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relativeTolerance * Math.abs(expected));
}

describe('solveDc: golden-тесты решателя', () => {
  it('простейшая цепь: батарея 9 В и резистор 1 кОм → ток 9 мА', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    const r = readingOf(solution, 'r');
    expect(r).not.toBeNull();
    expectCloseTo(r!.current, 0.009);
    expectCloseTo(r!.voltage, 9);
    expectCloseTo(r!.power, 0.081);
  });

  it('делитель напряжения: 1 кОм и 2 кОм → 6 В на нижнем плече, ток 3 мА', () => {
    const canvas = canvasOf(
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
    const solution = solveDc(canvas);
    expectCloseTo(readingOf(solution, 'r1')!.current, 0.003);
    expectCloseTo(readingOf(solution, 'r2')!.current, 0.003);
    expectCloseTo(readingOf(solution, 'r2')!.voltage, 6);
    // батарея отдаёт ток во внешнюю цепь, теряя часть ЭДС на внутреннем сопротивлении
    const battery = readingOf(solution, 'b')!;
    expectCloseTo(battery.current, 0.003);
    expectCloseTo(battery.voltage, 9);
    expectCloseTo(battery.power, 0.027);
  });

  it('параллельное соединение: два резистора 1 кОм → по 9 мА в ветвях, 18 мА от батареи', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r1', 'resistor'), component('r2', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('r1', 0)),
        wire('w2', pin('b', 0), pin('r2', 0)),
        wire('w3', pin('r1', 1), pin('b', 1)),
        wire('w4', pin('r2', 1), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas);
    expectCloseTo(readingOf(solution, 'r1')!.current, 0.009);
    expectCloseTo(readingOf(solution, 'r2')!.current, 0.009);
    expectCloseTo(readingOf(solution, 'b')!.current, 0.018);
  });

  it('короткое замыкание источника: Провод между полюсами → ток ЭДС/r, напряжение ≈ 0', () => {
    const canvas = canvasOf(
      [component('b', 'battery')],
      [wire('w1', pin('b', 0), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    const battery = readingOf(solution, 'b')!;
    expectCloseTo(battery.current, 9 / BATTERY_INTERNAL_RESISTANCE);
    expect(Math.abs(battery.voltage)).toBeLessThan(0.09);
  });

  it('обрыв: разомкнутый выключатель в цепи → ток ≈ 0, всё напряжение на разрыве', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch', { closed: false }), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('r', 0)),
        wire('w2', pin('r', 1), pin('sw', 0)),
        wire('w3', pin('sw', 1), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas);
    expect(readingOf(solution, 'r')!.current).toBe(0);
    expect(readingOf(solution, 'b')!.current).toBe(0);
    expectCloseTo(readingOf(solution, 'b')!.voltage, 9);
    expectCloseTo(readingOf(solution, 'sw')!.voltage, 9);
  });

  it('батарея без Проводов: напряжение холостого хода равно ЭДС, ток 0', () => {
    const solution = solveDc(canvasOf([component('b', 'battery')], []));
    const battery = readingOf(solution, 'b')!;
    expectCloseTo(battery.voltage, 9);
    expect(battery.current).toBe(0);
  });
});

describe('solveDc: коммутация и поведенческие состояния', () => {
  it('выключатель меняет решение схемы: замкнут — ток течёт, разомкнут — обрыв', () => {
    const build = (closed: boolean): CanvasState =>
      canvasOf(
        [component('b', 'battery'), component('sw', 'switch', { closed }), component('r', 'resistor')],
        [
          wire('w1', pin('b', 0), pin('sw', 0)),
          wire('w2', pin('sw', 1), pin('r', 0)),
          wire('w3', pin('r', 1), pin('b', 1)),
        ],
      );
    expectCloseTo(readingOf(solveDc(build(true)), 'r')!.current, 0.009);
    expect(readingOf(solveDc(build(false)), 'r')!.current).toBe(0);
  });

  it('показание контакта следует переопределению: разомкнутый нарисованный ключ с contactStates «замкнут» читается как замкнутый', () => {
    // Переходный режим проверяет Задание по схеме после переключения: решение
    // считается с контактами «наоборот», и показания Компонентов обязаны
    // описывать именно эту топологию, а не нарисованную.
    const canvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch', { closed: false }), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('sw', 0)),
        wire('w2', pin('sw', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas, { contactStates: new Map([['sw', true]]) });
    expectCloseTo(readingOf(solution, 'r')!.current, 0.009);
    expectCloseTo(readingOf(solution, 'sw')!.current, 0.009);
    expectCloseTo(readingOf(solution, 'sw')!.voltage, 9e-6, 0.05);
  });

  it('ключ-кнопка ведёт себя как выключатель: замкнута — цепь работает', () => {
    const build = (closed: boolean): CanvasState =>
      canvasOf(
        [component('b', 'battery'), component('p', 'pushbutton', { closed }), component('lamp1', 'lamp')],
        [
          wire('w1', pin('b', 0), pin('p', 0)),
          wire('w2', pin('p', 1), pin('lamp1', 0)),
          wire('w3', pin('lamp1', 1), pin('b', 1)),
        ],
      );
    const lit = solveDc(build(true));
    const dark = solveDc(build(false));
    expectCloseTo(readingOf(lit, 'lamp1')!.current, 9 / 120);
    expect(isLampLit(readingOf(lit, 'lamp1')!)).toBe(true);
    expect(readingOf(dark, 'lamp1')!.current).toBe(0);
    expect(isLampLit(readingOf(dark, 'lamp1')!)).toBe(false);
  });

  it('лампочка горит от мощности: 9 В на 120 Ом → 0,67 Вт, выше порога', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('lamp1', 'lamp')],
      [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
    );
    const lampReading = readingOf(solveDc(canvas), 'lamp1')!;
    expectCloseTo(lampReading.power, 0.675);
    expect(isLampLit(lampReading)).toBe(true);
  });

  it('моторчик крутится при мощности выше порога', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('m', 'motor')],
      [wire('w1', pin('b', 0), pin('m', 0)), wire('w2', pin('m', 1), pin('b', 1))],
    );
    const motorReading = readingOf(solveDc(canvas), 'm')!;
    expect(isMotorSpinning(motorReading)).toBe(true);
  });
});

describe('solveDc: устойчивость к вырожденным схемам', () => {
  it('остров без источника: токи 0, решение не падает', () => {
    const canvas = canvasOf(
      [component('r1', 'resistor'), component('r2', 'resistor')],
      [wire('w1', pin('r1', 0), pin('r2', 0)), wire('w2', pin('r1', 1), pin('r2', 1))],
    );
    const solution = solveDc(canvas);
    expect(readingOf(solution, 'r1')!.current).toBe(0);
    expect(readingOf(solution, 'r2')!.current).toBe(0);
  });

  it('резистор, замкнутый Проводом накоротко: напряжение и ток нулевые', () => {
    const canvas = canvasOf(
      [component('r', 'resistor')],
      [wire('w1', pin('r', 0), pin('r', 1))],
    );
    const r = readingOf(solveDc(canvas), 'r')!;
    expect(r.current).toBe(0);
    expect(r.voltage).toBe(0);
    expect(r.power).toBe(0);
  });

  it('Провод на несуществующий Компонент игнорируется', () => {
    const solution = solveDc(canvasOf([component('b', 'battery')], [wire('w1', pin('b', 0), pin('нет', 0))]));
    expect(readingOf(solution, 'b')!.current).toBe(0);
  });

  it('направление тока: от вывода 0 к выводу 1 при прямом включении', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('b', 1))],
    );
    expect(readingOf(solveDc(canvas), 'r')!.current).toBeGreaterThan(0);
  });

  it('readingsOfKind возвращает показания всех Компонентов вида', () => {
    const canvas = canvasOf(
      [
        component('b', 'battery'),
        component('lamp1', 'lamp'),
        component('lamp2', 'lamp'),
      ],
      [
        wire('w1', pin('b', 0), pin('lamp1', 0)),
        wire('w2', pin('lamp1', 1), pin('b', 1)),
        wire('w3', pin('b', 0), pin('lamp2', 0)),
        wire('w4', pin('lamp2', 1), pin('b', 1)),
      ],
    );
    const lamps = readingsOfKind(solveDc(canvas), 'lamp');
    expect(lamps).toHaveLength(2);
    for (const lamp of lamps) expectCloseTo(lamp.current, 9 / 120);
  });
});

describe('solveDc: узлы выводов для Мультиметра', () => {
  it('выводы, соединённые Проводом, — один узел: общий остров и общий потенциал', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    const plus = solution.pinNodes.get('b:0')!;
    const resistorPin = solution.pinNodes.get('r:0')!;
    expect(resistorPin.island).toBe(plus.island);
    expect(resistorPin.voltage).toBeCloseTo(plus.voltage, 12);
    // земля — минусовой вывод батареи: 0 В; на «плюсе» — напряжение зажимов
    expect(solution.pinNodes.get('b:1')!.voltage).toBe(0);
    expectCloseTo(plus.voltage, readingOf(solution, 'b')!.voltage, 1e-9);
  });

  it('каждый вывод каждого Компонента имеет узел; несоединённые Компоненты — разные острова', () => {
    const solution = solveDc(canvasOf([component('b', 'battery'), component('r', 'resistor')], []));
    expect([...solution.pinNodes.keys()].sort()).toEqual(['b:0', 'b:1', 'r:0', 'r:1']);
    expect(solution.pinNodes.get('b:0')!.island).not.toBe(solution.pinNodes.get('r:0')!.island);
    // отдельная батарея без тока: на зажимах вся ЭДС
    expectCloseTo(solution.pinNodes.get('b:0')!.voltage - solution.pinNodes.get('b:1')!.voltage, 9);
  });
});

describe('wireCurrents: оверлей токов Проводов', () => {
  it('последовательная цепь: ток каждого Провода равен току контура', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('lamp1', 'lamp')],
      [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    const lampCurrent = readingOf(solution, 'lamp1')!.current;
    expect(lampCurrent).toBeGreaterThan(0);
    const currents = new Map(wireCurrents(canvas, solution).map((entry) => [entry.wireId, entry.current]));
    // ток положителен вдоль направления Провода from→to: оба Провода обтекаются по ходу контура
    expectCloseTo(currents.get('w1')!, lampCurrent);
    expectCloseTo(currents.get('w2')!, lampCurrent);
  });

  it('цепь с выключателем: через все Провода один и тот же ток', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('sw', 'switch', { closed: true }), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('sw', 0)),
        wire('w2', pin('sw', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas);
    const loop = readingOf(solution, 'r')!.current;
    for (const entry of wireCurrents(canvas, solution)) {
      expect(Math.abs(entry.current!)).toBeCloseTo(loop, 12);
    }
  });

  it('параллельные Провода на одном выводе: ток не определяется — null', () => {
    // два Провода от «плюса» батареи: как делится ток между ними, модель не определяет
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor')],
      [
        wire('w1', pin('b', 0), pin('r', 0)),
        wire('w2', pin('b', 0), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const currents = new Map(wireCurrents(canvas, solveDc(canvas)).map((entry) => [entry.wireId, entry.current]));
    expect(currents.get('w1')).toBeNull();
    expect(currents.get('w2')).toBeNull();
    expect(currents.get('w3')).not.toBeNull();
  });
});

describe('lampBrightness: яркость от мощности', () => {
  it('ниже порога накала — 0; выше — растёт; у полного накала — насыщается', () => {
    const reading = (power: number) =>
      ({
        componentId: 'x',
        kind: 'lamp',
        current: 0.1,
        voltage: 1,
        power,
        pinCurrents: [-0.1, 0.1],
      }) as const;
    expect(lampBrightness(reading(0.01))).toBe(0);
    expect(lampBrightness(reading(0.02))).toBeGreaterThan(0);
    const half = lampBrightness(reading(0.25));
    const full = lampBrightness(reading(0.675));
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(1);
    expect(full).toBe(1);
  });
});

describe('Диод и светодиод: кусочно-линейные модели (М2)', () => {
  /** Кольцо батарея → A → B → батарея: «плюс» батареи — на вывод 0 A (прямое включение A). */
  function ringOf(a: PlacedComponent, b: PlacedComponent): CanvasState {
    return canvasOf(
      [component('b', 'battery'), a, b],
      [
        wire('w1', pin('b', 0), pin(a.id, 0)),
        wire('w2', pin(a.id, 1), pin(b.id, 0)),
        wire('w3', pin(b.id, 1), pin('b', 1)),
      ],
    );
  }

  it('светодиод в прямом направлении: ток по кусочно-линейной модели, падение около порога', () => {
    // (9 − 1,8) В на резистор 1000 Ом и проводящий диод: I = (U − Uпорога)/(R + rон + rбат)
    const expectedCurrent =
      (9 - LED_FORWARD_VOLTAGE.red) / (1000 + DIODE_ON_RESISTANCE + BATTERY_INTERNAL_RESISTANCE);
    const solution = solveDc(
      ringOf(component('led', 'led'), component('r', 'resistor', { resistance: 1000 })),
    );
    const led = readingOf(solution, 'led')!;
    expectCloseTo(led.current, expectedCurrent);
    expectCloseTo(led.voltage, LED_FORWARD_VOLTAGE.red + expectedCurrent * DIODE_ON_RESISTANCE);
    expect(led.current).toBeGreaterThan(0);
  });

  it('светодиод в обратном направлении: заперт, тока нет, всё напряжение на нём', () => {
    // разворот светодиода: катод (вывод 1) — к «плюсу» батареи
    const solution = solveDc(
      canvasOf(
        [component('b', 'battery'), component('led', 'led'), component('r', 'resistor', { resistance: 1000 })],
        [
          wire('w1', pin('b', 0), pin('led', 1)),
          wire('w2', pin('led', 0), pin('r', 0)),
          wire('w3', pin('r', 1), pin('b', 1)),
        ],
      ),
    );
    const led = readingOf(solution, 'led')!;
    expect(led.current).toBe(0);
    expectCloseTo(led.voltage, -9, 0.01);
    expect(readingOf(solution, 'r')!.current).toBe(0);
  });

  it('напряжение ниже прямого порога — светодиод не проводит вовсе', () => {
    const canvas = canvasOf(
      [component('b', 'battery', { voltage: 1.5 }), component('led', 'led'), component('r', 'resistor', { resistance: 100 })],
      [
        wire('w1', pin('b', 0), pin('led', 0)),
        wire('w2', pin('led', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas);
    expect(readingOf(solution, 'led')!.current).toBe(0);
  });

  it('порог зависит от цвета: при 2 В красный проводит, синий ещё заперт', () => {
    const build = (color: LedColor): CanvasState =>
      canvasOf(
        [component('b', 'battery', { voltage: 2 }), component('led', 'led', { color }), component('r', 'resistor', { resistance: 100 })],
        [
          wire('w1', pin('b', 0), pin('led', 0)),
          wire('w2', pin('led', 1), pin('r', 0)),
          wire('w3', pin('r', 1), pin('b', 1)),
        ],
      );
    const red = solveDc(build('red'));
    expectCloseTo(
      readingOf(red, 'led')!.current,
      (2 - LED_FORWARD_VOLTAGE.red) / (100 + DIODE_ON_RESISTANCE + BATTERY_INTERNAL_RESISTANCE),
    );
    const blue = solveDc(build('blue'));
    expect(readingOf(blue, 'led')!.current).toBe(0);
  });

  it('диод: прямое включение проводит с падением около 0,7 В, обратное заперт', () => {
    const forward = solveDc(
      canvasOf(
        [component('d', 'diode'), component('r', 'resistor', { resistance: 1000 }), component('b', 'battery')],
        [
          wire('w1', pin('b', 0), pin('d', 0)),
          wire('w2', pin('d', 1), pin('r', 0)),
          wire('w3', pin('r', 1), pin('b', 1)),
        ],
      ),
    );
    const forwardReading = readingOf(forward, 'd')!;
    const expectedCurrent =
      (9 - DIODE_FORWARD_VOLTAGE) / (1000 + DIODE_ON_RESISTANCE + BATTERY_INTERNAL_RESISTANCE);
    expectCloseTo(forwardReading.current, expectedCurrent);
    expectCloseTo(forwardReading.voltage, DIODE_FORWARD_VOLTAGE + expectedCurrent * DIODE_ON_RESISTANCE);

    const reversed = solveDc(
      canvasOf(
        [component('d', 'diode'), component('r', 'resistor', { resistance: 1000 }), component('b', 'battery')],
        [
          wire('w1', pin('b', 0), pin('d', 1)),
          wire('w2', pin('d', 0), pin('r', 0)),
          wire('w3', pin('r', 1), pin('b', 1)),
        ],
      ),
    );
    expect(readingOf(reversed, 'd')!.current).toBe(0);
    expect(readingOf(reversed, 'r')!.current).toBe(0);
  });

  it('свечение светодиода — от прямого тока: ниже порога не виден, выше — насыщается', () => {
    const base = { componentId: 'led', kind: 'led' as const, voltage: 2, power: 0.02 };
    expect(ledBrightness({ ...base, current: 0.0005, pinCurrents: [-0.0005, 0.0005] })).toBe(0);
    expect(isLedLit({ ...base, current: 0.0005, pinCurrents: [-0.0005, 0.0005] })).toBe(false);
    expect(isLedLit({ ...base, current: LED_LIT_CURRENT, pinCurrents: [-1, 1] })).toBe(true);
    expect(ledBrightness({ ...base, current: LED_FULL_CURRENT / 2, pinCurrents: [-1, 1] })).toBeCloseTo(0.5);
    expect(ledBrightness({ ...base, current: 0.05, pinCurrents: [-1, 1] })).toBe(1);
    expect(ledBrightness({ ...base, current: -0.01, pinCurrents: [1, -1] })).toBe(0);
  });
});

describe('Транзистор NPN: поведенческая модель ключа (М2, тикет 15)', () => {
  /**
   * Ключ на транзисторе: батарея 9 В; кнопка с резистором Rб — в цепи базы;
   * коллектор питается через Rc и красный светодиод; эмиттер — на «минус».
   * Выводы транзистора: 0 — база, 1 — коллектор, 2 — эмиттер.
   */
  function transistorKey(baseResistor: number, collectorResistor: number, buttonClosed: boolean): CanvasState {
    return canvasOf(
      [
        component('b', 'battery'),
        component('btn', 'pushbutton', { closed: buttonClosed }),
        component('rb', 'resistor', { resistance: baseResistor }),
        component('q', 'transistor'),
        component('rc', 'resistor', { resistance: collectorResistor }),
        component('led', 'led'),
      ],
      [
        wire('w1', pin('b', 0), pin('btn', 0)),
        wire('w2', pin('btn', 1), pin('rb', 0)),
        wire('w3', pin('rb', 1), pin('q', 0)),
        wire('w4', pin('b', 0), pin('rc', 0)),
        wire('w5', pin('rc', 1), pin('led', 0)),
        wire('w6', pin('led', 1), pin('q', 1)),
        wire('w7', pin('q', 2), pin('b', 1)),
      ],
    );
  }

  const expectedBaseCurrent = (baseResistor: number): number =>
    (9 - TRANSISTOR_V_BE_ON) / (baseResistor + TRANSISTOR_R_BE + BATTERY_INTERNAL_RESISTANCE);

  it('отсечка: кнопка разомкнута — тока через транзистор нет, светодиод не светится', () => {
    const solution = solveDc(transistorKey(10_000, 470, false));
    const transistor = readingOf(solution, 'q')!;
    expect(transistor.current).toBe(0);
    // весь остаток питания лежит на закрытом транзисторе
    expect(transistor.voltage).toBeGreaterThan(1);
    expect(readingOf(solution, 'led')!.current).toBe(0);
    expect(isLedLit(readingOf(solution, 'led')!)).toBe(false);
  });

  it('активный режим: слабая база (100 кОм) — ток коллектора равен β·Iб, V_кэ ещё велико', () => {
    const baseCurrent = expectedBaseCurrent(100_000); // ≈ 83 мкА
    const solution = solveDc(transistorKey(100_000, 470, true));
    const transistor = readingOf(solution, 'q')!;
    expectCloseTo(transistor.current, TRANSISTOR_BETA * baseCurrent, 0.02);
    // β·Iб ≈ 8,3 мА меньше, чем пропустит коллекторная цепь: V_кэ ≈ 3,2 В
    expectCloseTo(
      transistor.voltage,
      9 - LED_FORWARD_VOLTAGE.red - TRANSISTOR_BETA * baseCurrent * (470 + DIODE_ON_RESISTANCE),
      0.03,
    );
    expect(transistor.voltage).toBeGreaterThan(1);
    expect(isLedLit(readingOf(solution, 'led')!)).toBe(true);
  });

  it('насыщение: сильная база (10 кОм) — транзистор раскрыт, на коллектор—эмиттере около 0,2 В', () => {
    const solution = solveDc(transistorKey(10_000, 470, true));
    const transistor = readingOf(solution, 'q')!;
    // ток коллектора задаёт внешняя цепь: (9 − 1,8 − 0,2)/(Rc + светодиод + насыщение + батарея)
    const expectedCollector = (9 - LED_FORWARD_VOLTAGE.red - 0.2) / (470 + DIODE_ON_RESISTANCE + 2 + BATTERY_INTERNAL_RESISTANCE);
    expectCloseTo(transistor.current, expectedCollector, 0.01);
    expectCloseTo(transistor.voltage, 0.2 + expectedCollector * 2, 0.05);
    expect(transistor.voltage).toBeLessThan(0.5);
    expect(isLedLit(readingOf(solution, 'led')!)).toBe(true);
  });

  it('малый ток управляет большим: ток базы на два порядка меньше тока коллектора', () => {
    const solution = solveDc(transistorKey(100_000, 470, true));
    const transistor = readingOf(solution, 'q')!;
    const baseCurrent = Math.abs(transistor.pinCurrents[0]);
    expectCloseTo(baseCurrent, expectedBaseCurrent(100_000), 0.02);
    expectCloseTo(transistor.current, TRANSISTOR_BETA * baseCurrent, 0.02);
    // эмиттер уносит сумму: Iб + Iк
    expectCloseTo(transistor.pinCurrents[2], baseCurrent + transistor.current, 0.02);
  });

  it('токи Проводов видят все три вывода: база несёт Iб, коллектор — Iк', () => {
    const solution = solveDc(transistorKey(10_000, 470, true));
    const transistor = readingOf(solution, 'q')!;
    const currents = new Map(wireCurrents(transistorKey(10_000, 470, true), solution).map((e) => [e.wireId, e.current!]));
    expectCloseTo(Math.abs(currents.get('w3')!), Math.abs(transistor.pinCurrents[0]), 1e-6);
    expectCloseTo(Math.abs(currents.get('w6')!), Math.abs(transistor.current), 1e-6);
    expectCloseTo(Math.abs(currents.get('w7')!), Math.abs(transistor.pinCurrents[2]), 1e-6);
  });

  it('база никуда не подключена — транзистор закрыт, даже если кнопка замкнута', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('q', 'transistor'), component('rc', 'resistor', { resistance: 470 }), component('led', 'led')],
      [
        wire('w1', pin('b', 0), pin('rc', 0)),
        wire('w2', pin('rc', 1), pin('led', 0)),
        wire('w3', pin('led', 1), pin('q', 1)),
        wire('w4', pin('q', 2), pin('b', 1)),
      ],
    );
    const solution = solveDc(canvas);
    expect(readingOf(solution, 'q')!.current).toBe(0);
    expect(readingOf(solution, 'led')!.current).toBe(0);
  });
});

describe('Потенциометр: резистор с движком (М2, тикет 15)', () => {
  /** Делитель: батарея 9 В на концах потенциометра 10 кОм; нагрузка — зуммером с движка на «минус». */
  function potDivider(wiper: number, loadResistance?: number): CanvasState {
    const components = [component('b', 'battery'), component('pot', 'potentiometer', { wiper })];
    const wires: Wire[] = [
      wire('w1', pin('b', 0), pin('pot', 0)),
      wire('w2', pin('pot', 2), pin('b', 1)),
    ];
    if (loadResistance !== undefined) {
      components.push(component('bz', 'buzzer', { resistance: loadResistance }));
      wires.push(wire('w3', pin('pot', 1), pin('bz', 0)), wire('w4', pin('bz', 1), pin('b', 1)));
    }
    return canvasOf(components, wires);
  }

  const wiperVoltageOf = (solution: ReturnType<typeof solveDc>): number =>
    solution.pinNodes.get('pot:1')!.voltage - solution.pinNodes.get('pot:2')!.voltage;

  it('движок делит сопротивление: напряжение с движка меняется положением', () => {
    // p = 0,25: между движком и «минусом» 7,5 кОм из 10 кОм → 9 · 0,75 = 6,75 В
    expectCloseTo(wiperVoltageOf(solveDc(potDivider(0.25))), 6.75, 0.01);
    // посередине — половина батареи
    expectCloseTo(wiperVoltageOf(solveDc(potDivider(0.5))), 4.5, 0.01);
  });

  it('крайние положения движка дают всё напряжение и ноль', () => {
    expectCloseTo(wiperVoltageOf(solveDc(potDivider(0))), 9, 0.001);
    expect(wiperVoltageOf(solveDc(potDivider(1)))).toBeLessThan(0.001);
  });

  it('сквозной ток считается по закону Ома, «висящий» движок тока не берёт', () => {
    const solution = solveDc(potDivider(0.5));
    const pot = readingOf(solution, 'pot')!;
    expectCloseTo(pot.current, 9 / 10_000, 0.01);
    expectCloseTo(pot.voltage, 9, 0.01);
    expect(pot.pinCurrents[1]).toBe(0);
  });

  it('нагрузка на движке просаживает делитель — расчёт остаётся честным', () => {
    // 50 Ом зуммера рядом с плечом 5 кОм: 5к||50 = 49,5 Ом — выход садится до ~89 мВ
    const loaded = 5000 / 101; // 5000·50/(5000+50)
    const expectedWiper = (9 * loaded) / (5000 + loaded);
    const solution = solveDc(potDivider(0.5, 50));
    expectCloseTo(wiperVoltageOf(solution), expectedWiper, 0.01);
    const pot = readingOf(solution, 'pot')!;
    // движок отдаёт ток нагрузке: разность токов плеч
    expect(pot.pinCurrents[1]).toBeGreaterThan(0);
    expectCloseTo(pot.pinCurrents[1], expectedWiper / 50, 0.05);
    expect(isBuzzerSounding(readingOf(solution, 'bz')!)).toBe(false);
  });
});

describe('Зуммер: звучит при токе выше порога (М2, тикет 15)', () => {
  const ringWithBuzzer = (resistance: number): CanvasState =>
    canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance }), component('bz', 'buzzer')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('bz', 0)), wire('w3', pin('bz', 1), pin('b', 1))],
    );

  it('ток выше порога — зуммер звучит; ниже порога — молчит', () => {
    const loud = solveDc(ringWithBuzzer(100)); // 9/(100+50) ≈ 60 мА
    expect(loud.readings.find((r) => r.kind === 'buzzer')!.current).toBeGreaterThan(BUZZER_SOUND_CURRENT);
    expect(isBuzzerSounding(loud.readings.find((r) => r.kind === 'buzzer')!)).toBe(true);
    const quiet = solveDc(ringWithBuzzer(1000)); // ≈ 8,6 мА
    expect(isBuzzerSounding(quiet.readings.find((r) => r.kind === 'buzzer')!)).toBe(false);
  });

  it('зуммер — резистивный Компонент: закон Ома и мощность считаются как у резистора', () => {
    const solution = solveDc(ringWithBuzzer(100));
    const buzzer = solution.readings.find((r) => r.kind === 'buzzer')!;
    const current = 9 / (100 + 50 + BATTERY_INTERNAL_RESISTANCE);
    expectCloseTo(buzzer.current, current, 0.01);
    expectCloseTo(buzzer.voltage, current * 50, 0.01);
    expectCloseTo(buzzer.power, current * current * 50, 0.01);
  });
});

describe('Катушка и источник ~: модели постоянного тока (М4, тикет 20)', () => {
  it('катушка для постоянного тока — почти провод: ток как в цепи без неё', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance: 1000 }), component('l', 'inductor')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('l', 0)), wire('w3', pin('l', 1), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    const current = 9 / (1000 + 0.1 + 0.001);
    expectCloseTo(readingOf(solution, 'l')!.current, current);
    expectCloseTo(readingOf(solution, 'r')!.current, current);
    // всё напряжение падает на резисторе, на катушке — почти ноль
    expectCloseTo(readingOf(solution, 'l')!.voltage, current * 0.001);
  });

  it('погашенный источник ~ в solveDc остаётся внутренним сопротивлением: 9 В / (R + 0,2)', () => {
    const canvas = canvasOf(
      [component('b', 'battery'), component('r', 'resistor', { resistance: 10 }), component('src', 'acsource')],
      [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 1), pin('src', 0)), wire('w3', pin('src', 1), pin('b', 1))],
    );
    const solution = solveDc(canvas);
    expectCloseTo(readingOf(solution, 'r')!.current, 9 / (10 + 0.1 + 0.1));
  });

  it('мгновенная ЭДС источника ~ приходит через sourceEmfs', () => {
    const canvas = canvasOf(
      [component('r', 'resistor', { resistance: 10 }), component('src', 'acsource')],
      [wire('w1', pin('r', 0), pin('src', 0)), wire('w2', pin('src', 1), pin('r', 1))],
    );
    const solution = solveDc(canvas, { sourceEmfs: new Map([['src', 5]]) });
    expectCloseTo(readingOf(solution, 'r')!.current, 5 / (10 + 0.1));
  });
});
