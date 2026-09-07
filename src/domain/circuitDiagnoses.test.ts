import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import type { CircuitTask } from './task';
import type { CanvasState, ComponentKind, PlacedComponent, PinRef, Wire } from './canvas';
import { defaultValuesOf } from './canvas';

// Схемы-ловушки (тикет 06): каждый вид Диагноза распознаётся на эталонной
// схеме через главный шов evaluate(Задание, ответ). Проверяется вид Диагноза,
// место ошибки для подсветки и трёхзначный исход вердикта.

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

const answer = (components: readonly PlacedComponent[], wires: readonly Wire[]) => ({
  kind: 'circuit-answer' as const,
  canvas: { components, wires } as CanvasState,
});

/** Задание-эталон: лампочка горит с током 50–100 мА от батареи. */
const litLampTask: CircuitTask = {
  kind: 'circuit-task',
  id: 'trap-lit-lamp',
  prompt: 'Лампочка должна гореть с током 50–100 мА.',
  palette: ['battery', 'resistor', 'lamp', 'switch'],
  conditions: [
    { kind: 'current-through', componentKind: 'lamp', range: { from: 0.05, to: 0.1 } },
    { kind: 'component-active', componentKind: 'lamp', active: true },
  ],
};

function evaluateTraps(canvas: CanvasState) {
  const verdict = evaluate(litLampTask, answer(canvas.components, canvas.wires));
  if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
  return verdict;
}

describe('диагноз: короткое замыкание', () => {
  it('лампочка замкнута Проводом накоротко → КЗ, подсвечена перемычка-Провод', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('lamp1', 'lamp')],
      wires: [
        wire('w1', pin('b', 0), pin('lamp1', 0)),
        wire('w2', pin('lamp1', 1), pin('b', 1)),
        wire('w3', pin('b', 0), pin('b', 1)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses).toHaveLength(1);
    expect(verdict.diagnoses[0].kind).toBe('short-circuit');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'wire', id: 'w3' });
    expect(verdict.diagnoses[0].text).toContain('Короткое замыкание');
    expect(verdict.diagnoses[0].text).toContain('А'); // ток КЗ в амперах, не в мА
  });

  it('замыкание цепочкой Проводов без прямой перемычки → подсвечена батарея', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('r', 'resistor')],
      wires: [wire('w1', pin('b', 0), pin('r', 0)), wire('w2', pin('r', 0), pin('b', 1))],
    });
    expect(verdict.diagnoses[0].kind).toBe('short-circuit');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'b' });
  });
});

describe('диагноз: обрыв цепи', () => {
  it('разомкнутый выключатель → обрыв на выключателе', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('sw', 'switch', { closed: false }), component('lamp1', 'lamp')],
      wires: [
        wire('w1', pin('b', 0), pin('sw', 0)),
        wire('w2', pin('sw', 1), pin('lamp1', 0)),
        wire('w3', pin('lamp1', 1), pin('b', 1)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'sw' });
    expect(verdict.diagnoses[0].text).toContain('Обрыв цепи');
  });

  it('вывод не подключён → обрыв на Компоненте со свободным выводом', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('lamp1', 'lamp')],
      wires: [wire('w1', pin('b', 0), pin('lamp1', 0))],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'lamp1' });
  });

  it('источника нет совсем → обрыв без места подсветки', () => {
    const verdict = evaluateTraps({
      components: [component('lamp1', 'lamp')],
      wires: [],
    });
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].spot).toBeNull();
    expect(verdict.diagnoses[0].text).toContain('нет источника');
  });
});

describe('диагноз: обратное включение источника', () => {
  it('батарея 3 В включена навстречу 9 В → обратный ток через слабую батарею', () => {
    // плюс 9 В через резистор смотрит в плюс 3 В: слабую батарею заряжает ток против её ЭДС
    const verdict = evaluateTraps({
      components: [
        component('b1', 'battery', { voltage: 9 }),
        component('b2', 'battery', { voltage: 3 }),
        component('r', 'resistor', { resistance: 1000 }),
      ],
      wires: [
        wire('w1', pin('b1', 0), pin('r', 0)),
        wire('w2', pin('r', 1), pin('b2', 0)),
        wire('w3', pin('b2', 1), pin('b1', 1)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('reversed-source');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'b2' });
    expect(verdict.diagnoses[0].text).toContain('навстречу');
  });
});

describe('диагноз: превышение тока', () => {
  it('лампочка 12 Ом → 744 мА, далеко за верхней границей → превышение на лампочке', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('lamp1', 'lamp', { resistance: 12 })],
      wires: [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('overcurrent');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'lamp1' });
    expect(verdict.diagnoses[0].text).toContain('Превышение тока');
  });
});

describe('диагноз: работает, но не по условию', () => {
  it('лампочка горит, но ток 18 мА ниже условия — Разбор не «пройдено» и не «ошибка»', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('lamp1', 'lamp', { resistance: 500 })],
      wires: [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
    });
    expect(verdict.outcome).toBe('works-not-per-task');
    expect(verdict.diagnoses[0].kind).toBe('works-not-per-task');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'lamp1' });
    expect(verdict.diagnoses[0].text).toContain('работает, но не по условию');
  });

  it('лишний Компонент при живой схеме — тоже «не по условию», подсветки может не быть', () => {
    const extraResistorTask: CircuitTask = {
      kind: 'circuit-task',
      id: 'trap-extra',
      prompt: 'Ровно один резистор.',
      palette: ['battery', 'resistor'],
      conditions: [{ kind: 'component-used', componentKind: 'resistor', min: 1, max: 1 }],
    };
    const verdict = evaluate(
      extraResistorTask,
      answer(
        [
          component('b', 'battery'),
          component('r1', 'resistor'),
          component('r2', 'resistor'),
        ],
        [
          wire('w1', pin('b', 0), pin('r1', 0)),
          wire('w2', pin('r1', 1), pin('b', 1)),
          wire('w3', pin('b', 0), pin('r2', 0)),
          wire('w4', pin('r2', 1), pin('b', 1)),
        ],
      ),
    );
    if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
    expect(verdict.outcome).toBe('works-not-per-task');
    expect(verdict.diagnoses[0].spot).toBeNull();
  });
});

describe('диагноз: пройдено — Диагноза нет', () => {
  it('схема по условию → correct, Диагнозы пусты', () => {
    const verdict = evaluateTraps({
      components: [component('b', 'battery'), component('lamp1', 'lamp')],
      wires: [wire('w1', pin('b', 0), pin('lamp1', 0)), wire('w2', pin('lamp1', 1), pin('b', 1))],
    });
    expect(verdict.outcome).toBe('correct');
    expect(verdict.diagnoses).toHaveLength(0);
  });
});

/** Задание-эталон М2: светодиод светится с током 5–15 мА через токоограничивающий резистор. */
const ledTask: CircuitTask = {
  kind: 'circuit-task',
  id: 'trap-led',
  prompt: 'Светодиод должен светиться с током 5–15 мА.',
  palette: ['battery', 'resistor', 'led'],
  conditions: [
    { kind: 'component-used', componentKind: 'resistor' },
    { kind: 'component-active', componentKind: 'led', active: true },
    { kind: 'current-through', componentKind: 'led', range: { from: 0.005, to: 0.015 } },
  ],
};

function evaluateLed(canvas: CanvasState) {
  const verdict = evaluate(ledTask, answer(canvas.components, canvas.wires));
  if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
  return verdict;
}

describe('диагнозы М2: диод и светодиод', () => {

  it('светодиод включён обратно → Диагноз «диод не проводит в обратную сторону» на светодиоде', () => {
    // катод (вывод 1) — к «плюсу» батареи: диод заперт, тока нет, светодиод не светится
    const verdict = evaluateLed({
      components: [component('b', 'battery'), component('r', 'resistor'), component('led', 'led')],
      wires: [
        wire('w1', pin('b', 0), pin('led', 1)),
        wire('w2', pin('led', 0), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses).toHaveLength(1);
    expect(verdict.diagnoses[0].kind).toBe('reversed-diode');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'led' });
    expect(verdict.diagnoses[0].text).toContain('обратную сторону');
    expect(verdict.diagnoses[0].text).toContain('не светится');
  });

  it('светодиод без токоограничивающего резистора → превышение максимального тока даже сверх условия', () => {
    // 9 В напрямую на светодиод: модель даёт (9−1,8)/rон ≈ 0,9 А — далеко за предельные 20 мА
    const verdict = evaluateLed({
      components: [component('b', 'battery'), component('led', 'led')],
      wires: [wire('w1', pin('b', 0), pin('led', 0)), wire('w2', pin('led', 1), pin('b', 1))],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('overcurrent');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'led' });
    expect(verdict.diagnoses[0].text).toContain('максимального тока');
  });

  it('превышение предельного тока — Диагноз и при выполненных условиях: «пройдено» горящий на пределе светодиод не засчитывает', () => {
    // надуманные условия (светодиод светится, ток 0,5–1 А) выполняются на схеме без резистора,
    // но предельные 20 мА превышены: контракт — Диагноз «сжигания» сильнее «пройдено»
    const looseTask: CircuitTask = {
      ...ledTask,
      id: 'trap-led-loose',
      conditions: [
        { kind: 'component-active', componentKind: 'led', active: true },
        { kind: 'current-through', componentKind: 'led', range: { from: 0.5, to: 1.0 } },
      ],
    };
    const verdict = evaluate(
      looseTask,
      answer(
        [component('b', 'battery'), component('led', 'led')],
        [wire('w1', pin('b', 0), pin('led', 0)), wire('w2', pin('led', 1), pin('b', 1))],
      ),
    );
    if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
    expect(verdict.conditionChecks.every((check) => check.passed)).toBe(true);
    expect(verdict.diagnoses[0].kind).toBe('overcurrent');
    expect(verdict.diagnoses[0].text).toContain('максимального тока');
  });

  it('исправная схема: светодиод светится, ток в границах — Диагнозов нет', () => {
    const verdict = evaluateLed({
      components: [component('b', 'battery'), component('r', 'resistor'), component('led', 'led')],
      wires: [
        wire('w1', pin('b', 0), pin('led', 0)),
        wire('w2', pin('led', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    });
    expect(verdict.outcome).toBe('correct');
    expect(verdict.diagnoses).toHaveLength(0);
  });

  it('диод включён обратно → тот же Диагноз «обратное включение», но про диод', () => {
    const verdict = evaluateLed({
      components: [component('b', 'battery'), component('r', 'resistor'), component('d', 'diode'), component('led', 'led')],
      wires: [
        wire('w1', pin('b', 0), pin('led', 0)),
        wire('w2', pin('led', 1), pin('d', 1)),
        wire('w3', pin('d', 0), pin('r', 0)),
        wire('w4', pin('r', 1), pin('b', 1)),
      ],
    });
    expect(verdict.diagnoses[0].kind).toBe('reversed-diode');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'd' });
  });
});

describe('диагноз М2: напряжение ниже прямого порога', () => {
  it('исправный контур, но батареи не хватает до порога цвета — не «обрыв», а «диод не открылся»', () => {
    // 1,5 В на красном светодиоде (порог 1,8 В): контур замкнут, тока нет
    const verdict = evaluateLed({
      components: [
        component('b', 'battery', { voltage: 1.5 }),
        component('r', 'resistor'),
        component('led', 'led'),
      ],
      wires: [
        wire('w1', pin('b', 0), pin('led', 0)),
        wire('w2', pin('led', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses).toHaveLength(1);
    expect(verdict.diagnoses[0].kind).toBe('diode-below-threshold');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'led' });
    expect(verdict.diagnoses[0].text).toContain('ниже прямого порога');
    expect(verdict.diagnoses[0].text).toContain('красного');
  });

  it('диоду с порогом 0,7 В хватает 1,5 В — Диагноза про порог нет', () => {
    const verdict = evaluateLed({
      components: [
        component('b', 'battery', { voltage: 1.5 }),
        component('r', 'resistor'),
        component('d', 'diode'),
      ],
      wires: [
        wire('w1', pin('b', 0), pin('d', 0)),
        wire('w2', pin('d', 1), pin('r', 0)),
        wire('w3', pin('r', 1), pin('b', 1)),
      ],
    });
    expect(verdict.diagnoses[0].kind).not.toBe('diode-below-threshold');
  });
});

describe('диагноз М2: заряженный конденсатор — не обрыв (тикет 14)', () => {
  /** Задание с условием на ток, которого у зарядной цепи не будет никогда. */
  function evaluateRc(canvas: CanvasState) {
    const task: CircuitTask = {
      kind: 'circuit-task',
      id: 'rc-task',
      prompt: 'тест',
      palette: ['battery', 'resistor', 'capacitor'],
      conditions: [{ kind: 'current-through', componentKind: 'resistor', range: { from: 0.001, to: 0.002 } }],
    };
    const verdict = evaluate(task, answer(canvas.components, canvas.wires));
    if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
    return verdict;
  }

  it('исправная зарядная RC-цепь с проваленным условием — «не по условию», а не «обрыв»', () => {
    // в установившемся режиме конденсатор заряжен до 9 В и ток прекратился сам
    const verdict = evaluateRc({
      components: [component('b', 'battery'), component('r', 'resistor'), component('c', 'capacitor')],
      wires: [
        wire('w1', pin('b', 1), pin('r', 0)),
        wire('w2', pin('r', 1), pin('c', 0)),
        wire('w3', pin('c', 1), pin('b', 0)),
      ],
    });
    expect(verdict.diagnoses).toHaveLength(1);
    expect(verdict.diagnoses[0].kind).toBe('works-not-per-task');
  });

  it('висящий в воздухе вывод конденсатора — по-прежнему честный «обрыв» с местом ошибки', () => {
    const verdict = evaluateRc({
      components: [component('b', 'battery'), component('r', 'resistor'), component('c', 'capacitor')],
      wires: [
        wire('w1', pin('b', 1), pin('r', 0)),
        wire('w2', pin('r', 1), pin('c', 0)),
      ],
    });
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'c' });
  });
});

describe('диагнозы М2: ключ на транзисторе (тикет 15)', () => {
  /** Задание: кнопка открывает транзистор, светодиод в коллекторе горит с током 5–15 мА. */
  function evaluateSwitchKey(canvas: CanvasState) {
    const task: CircuitTask = {
      kind: 'circuit-task',
      id: 'trap-transistor-key',
      prompt: 'Кнопка включает светодиод через транзистор.',
      palette: ['battery', 'pushbutton', 'resistor', 'transistor', 'led'],
      conditions: [
        { kind: 'component-used', componentKind: 'battery' },
        { kind: 'component-used', componentKind: 'pushbutton' },
        { kind: 'component-used', componentKind: 'transistor' },
        { kind: 'component-used', componentKind: 'resistor' },
        { kind: 'component-used', componentKind: 'led' },
        { kind: 'component-active', componentKind: 'led', active: true },
        { kind: 'current-through', componentKind: 'led', range: { from: 0.005, to: 0.015 } },
      ],
    };
    const verdict = evaluate(task, answer(canvas.components, canvas.wires));
    if (verdict.kind !== 'circuit-task') throw new Error('ожидался вердикт Схема-задания');
    return verdict;
  }

  /** Собранный ключ: кнопка с резистором 10 кОм — в базу, коллектор через 470 Ом и светодиод. */
  function keyCanvas(buttonClosed: boolean, collectorResistor = 470, baseResistor = 10_000): CanvasState {
    return {
      components: [
        component('b', 'battery'),
        component('btn', 'pushbutton', { closed: buttonClosed }),
        component('rb', 'resistor', { resistance: baseResistor }),
        component('q', 'transistor'),
        component('rc', 'resistor', { resistance: collectorResistor }),
        component('led', 'led'),
      ],
      wires: [
        wire('w1', pin('b', 0), pin('btn', 0)),
        wire('w2', pin('btn', 1), pin('rb', 0)),
        wire('w3', pin('rb', 1), pin('q', 0)),
        wire('w4', pin('b', 0), pin('rc', 0)),
        wire('w5', pin('rc', 1), pin('led', 0)),
        wire('w6', pin('led', 1), pin('q', 1)),
        wire('w7', pin('q', 2), pin('b', 1)),
      ],
    };
  }

  it('замкнутая кнопка, токи в границах — светодиод горит, Диагнозов нет', () => {
    const verdict = evaluateSwitchKey(keyCanvas(true));
    expect(verdict.outcome).toBe('correct');
    expect(verdict.diagnoses).toHaveLength(0);
  });

  it('кнопка разомкнута — транзистор закрыт: «обрыв» указывает на разомкнутый контакт', () => {
    const verdict = evaluateSwitchKey(keyCanvas(false));
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].text).toContain('контакт разомкнут');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'btn' });
  });

  it('база не подключена (цепь базы забыли) — «обрыв» со свободным выводом транзистора', () => {
    // кнопка замкнута, но до базы цепь не дотянута: у транзистора свободна база,
    // у ключа — второй вывод; первым в списке нагрузок стоит транзистор
    const verdict = evaluateSwitchKey({
      components: [
        component('b', 'battery'),
        component('q', 'transistor'),
        component('rc', 'resistor', { resistance: 470 }),
        component('led', 'led'),
        component('btn', 'pushbutton', { closed: true }),
      ],
      wires: [
        wire('w1', pin('b', 0), pin('rc', 0)),
        wire('w2', pin('rc', 1), pin('led', 0)),
        wire('w3', pin('led', 1), pin('q', 1)),
        wire('w4', pin('q', 2), pin('b', 1)),
        wire('w5', pin('b', 0), pin('btn', 0)),
      ],
    });
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('open-circuit');
    expect(verdict.diagnoses[0].text).toContain('не подключ');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'q' });
  });

  it('коллекторный резистор слишком мал — светодиод на предельном токе: «превышение» с местом ошибки', () => {
    const verdict = evaluateSwitchKey(keyCanvas(true, 10));
    expect(verdict.outcome).toBe('incorrect');
    expect(verdict.diagnoses[0].kind).toBe('overcurrent');
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'component', id: 'led' });
  });
});
