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
    // лампочка в контуре, но её выводы соединены одним и тем же узлом с полюсами батареи
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
    // виновник — Провод-перемычка между полюсами, а не невинная батарея
    expect(verdict.diagnoses[0].spot).toEqual({ kind: 'wire', id: 'w3' });
    expect(verdict.diagnoses[0].text).toContain('Короткое замыкание');
    expect(verdict.diagnoses[0].text).toContain('А'); // ток КЗ в амперах, не в мА
  });

  it('замыкание цепочкой Проводов без прямой перемычки → подсвечена батарея', () => {
    // узел среднего вывода резистора соединяет оба полюса: прямой перемычки нет
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
