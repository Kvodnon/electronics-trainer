import { describe, expect, it } from 'vitest';
import { clockLevelAt, evaluateDigital } from './booleanEngine';
import {
  demoDigitalCanvas,
  digitalCanvasReducer,
  emptyDigitalHistory,
  type DigitalCanvasHistory,
  type DigitalKind,
} from './digitalCanvas';
import type { PinRef } from './canvas';

/**
 * Булевый движок — главный шов М3 (см. spec: Testing Decisions): тесты идут
 * через публичный стык «состояние Холста → уровни выводов», устройство
 * union-find и установления не фиксируется. Схемы собираются редьюсером —
 * тем же, что в редакторе.
 */

/** История с поставленными в ряд Компонентами: c1, c2, … */
function historyWithPlaced(kinds: readonly DigitalKind[]): DigitalCanvasHistory {
  let history = emptyDigitalHistory;
  kinds.forEach((kind, index) => {
    history = digitalCanvasReducer(history, {
      type: 'component-placed',
      kind,
      x: 100 + index * 160,
      y: 100,
    });
  });
  return history;
}

function wire(history: DigitalCanvasHistory, from: PinRef, to: PinRef): DigitalCanvasHistory {
  return digitalCanvasReducer(history, { type: 'wire-drawn', from, to });
}

function pressButton(
  history: DigitalCanvasHistory,
  componentId: string,
  high: boolean,
): DigitalCanvasHistory {
  return digitalCanvasReducer(history, {
    type: 'component-value-set',
    componentId,
    patch: { high },
  });
}

/** Схема «две кнопки в элемент» — база для таблиц истинности: возвращает историю и уровень выхода. */
function twoButtonsIntoGate(kind: Extract<DigitalKind, 'and' | 'or'>): {
  history: DigitalCanvasHistory;
  level: (a: boolean, b: boolean) => 0 | 1;
} {
  let history = historyWithPlaced(['button', 'button', kind]);
  history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c3', pin: 0 });
  history = wire(history, { componentId: 'c2', pin: 0 }, { componentId: 'c3', pin: 1 });
  return {
    history,
    level: (a, b) =>
      evaluateDigital(pressButton(pressButton(history, 'c1', a), 'c2', b).present, 0).get('c3:2')!,
  };
}

/** Уровень выхода Компонента по его последнему выводу. */
function outputLevel(levels: ReadonlyMap<string, 0 | 1>, componentId: string): 0 | 1 {
  const keys = [...levels.keys()].filter((key) => key.startsWith(`${componentId}:`));
  const last = Math.max(...keys.map((key) => Number(key.split(':')[1])));
  return levels.get(`${componentId}:${last}`)!;
}

describe('Таблицы истинности элементов', () => {
  it('И: выход 1 только при обеих кнопках нажатых', () => {
    const { level } = twoButtonsIntoGate('and');
    expect(level(false, false)).toBe(0);
    expect(level(false, true)).toBe(0);
    expect(level(true, false)).toBe(0);
    expect(level(true, true)).toBe(1);
  });

  it('ИЛИ: выход 1, когда нажата хотя бы одна кнопка', () => {
    const { level } = twoButtonsIntoGate('or');
    expect(level(false, false)).toBe(0);
    expect(level(false, true)).toBe(1);
    expect(level(true, false)).toBe(1);
    expect(level(true, true)).toBe(1);
  });

  it('НЕ: выход инвертирует кнопку', () => {
    let history = historyWithPlaced(['button', 'not']);
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 0 });

    const level = (a: boolean) =>
      evaluateDigital(pressButton(history, 'c1', a).present, 0).get('c2:1')!;
    expect(level(false)).toBe(1);
    expect(level(true)).toBe(0);
  });
});

describe('Распространение в комбинационных схемах', () => {
  it('Цепочка из трёх элементов распространяет сигнал до конца: (a И НЕ a) ИЛИ b = b', () => {
    let history = historyWithPlaced(['button', 'not', 'and', 'or', 'button']);
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 0 });
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c3', pin: 0 });
    history = wire(history, { componentId: 'c2', pin: 1 }, { componentId: 'c3', pin: 1 });
    history = wire(history, { componentId: 'c3', pin: 2 }, { componentId: 'c4', pin: 0 });
    history = wire(history, { componentId: 'c5', pin: 0 }, { componentId: 'c4', pin: 1 });

    const level = (a: boolean, b: boolean) =>
      outputLevel(
        evaluateDigital(pressButton(pressButton(history, 'c1', a), 'c5', b).present, 0),
        'c4',
      );

    expect(level(false, false)).toBe(0);
    expect(level(true, false)).toBe(0);
    expect(level(false, true)).toBe(1);
    expect(level(true, true)).toBe(1);
  });

  it('Один выход питает оба входа элемента (разветвление): a И a = a', () => {
    let history = historyWithPlaced(['button', 'and']);
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 0 });
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 1 });

    expect(outputLevel(evaluateDigital(pressButton(history, 'c1', false).present, 0), 'c2')).toBe(0);
    expect(outputLevel(evaluateDigital(pressButton(history, 'c1', true).present, 0), 'c2')).toBe(1);
  });

  it('Неприсоединённый вход читается как 0: И без проводов молчит, НЕ выдаёт 1', () => {
    const history = historyWithPlaced(['and', 'not']);
    expect(outputLevel(evaluateDigital(history.present, 0), 'c1')).toBe(0);
    expect(outputLevel(evaluateDigital(history.present, 0), 'c2')).toBe(1);
  });

  it('Индикатор показывает уровень своей сети', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 0 });

    const levels = evaluateDigital(pressButton(history, 'c1', true).present, 0);
    expect(levels.get('c2:0')).toBe(1);
    expect(levels.get('c1:0')).toBe(1);
  });
});

describe('Тактовый генератор', () => {
  it('Меандр 2 Гц: первая половина периода 1, вторая 0; период — 0,5 с', () => {
    expect(clockLevelAt(2, 0)).toBe(1);
    expect(clockLevelAt(2, 0.2)).toBe(1);
    expect(clockLevelAt(2, 0.3)).toBe(0);
    expect(clockLevelAt(2, 0.45)).toBe(0);
    expect(clockLevelAt(2, 0.5)).toBe(1);
  });

  it('Частота меняет темп: 1 Гц в t = 0,6 c уже 0, 4 Гц к половине периода сменились', () => {
    expect(clockLevelAt(1, 0.6)).toBe(0);
    expect(clockLevelAt(4, 0.3)).toBe(1);
    expect(clockLevelAt(4, 0.3 + 0.125)).toBe(0);
  });

  it('Уровень Генератора на схеме зависит от момента времени', () => {
    let history = historyWithPlaced(['clock', 'indicator']);
    history = wire(history, { componentId: 'c1', pin: 0 }, { componentId: 'c2', pin: 0 });

    expect(evaluateDigital(history.present, 0.1).get('c2:0')).toBe(1);
    expect(evaluateDigital(history.present, 0.3).get('c2:0')).toBe(0);
  });
});

describe('Тотальность на некорректных схемах', () => {
  it('Цикл НЕ на самого себя не зависает: уровни определены', () => {
    let history = historyWithPlaced(['not']);
    history = wire(history, { componentId: 'c1', pin: 1 }, { componentId: 'c1', pin: 0 });

    const levels = evaluateDigital(history.present, 0);
    expect([0, 1]).toContain(levels.get('c1:0'));
    expect([0, 1]).toContain(levels.get('c1:1'));
  });

  it('Сеть с двумя выходами (минуя редьюсер) остаётся определённой', () => {
    const canvas = {
      components: [
        { id: 'c1', kind: 'button' as const, x: 100, y: 100, rotation: 0 as const, high: true },
        { id: 'c2', kind: 'button' as const, x: 200, y: 100, rotation: 0 as const, high: false },
        { id: 'c3', kind: 'indicator' as const, x: 300, y: 100, rotation: 0 as const },
      ],
      wires: [
        { id: 'w1', from: { componentId: 'c1', pin: 0 }, to: { componentId: 'c3', pin: 0 } },
        { id: 'w2', from: { componentId: 'c2', pin: 0 }, to: { componentId: 'c3', pin: 0 } },
      ],
    };
    const levels = evaluateDigital(canvas, 0);
    expect([0, 1]).toContain(levels.get('c3:0'));
  });
});

describe('Демо-схема живёт', () => {
  it('Кнопка отпущена: И молчит, НЕ светит; нажата: И мигает с генератором, НЕ гаснет', () => {
    const canvas = demoDigitalCanvas();

    const released = evaluateDigital(canvas, 0.1);
    expect(released.get('c5:0')).toBe(0);
    expect(released.get('c6:0')).toBe(1);

    const pressed = digitalCanvasReducer(
      { past: [], present: canvas, future: [] },
      { type: 'component-value-set', componentId: 'c2', patch: { high: true } },
    ).present;
    const pressedLevels = evaluateDigital(pressed, 0.1);
    expect(pressedLevels.get('c5:0')).toBe(1);
    expect(pressedLevels.get('c6:0')).toBe(0);
  });
});
