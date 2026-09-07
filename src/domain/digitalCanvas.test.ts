import { describe, expect, it } from 'vitest';
import { suggestPlacementPosition } from './canvas';
import {
  clockFrequencyBounds,
  defaultClockFrequency,
  demoDigitalCanvas,
  digitalCanvasReducer,
  emptyDigitalHistory,
  isValidFrequency,
  digitalPinCountOf,
  digitalPinRole,
  type DigitalCanvasHistory,
  type DigitalKind,
} from './digitalCanvas';

/**
 * Редьюсер цифрового Холста — второй шов домена (см. spec: Testing
 * Decisions): постановка, соединение и удаление проверяются на поведение.
 * Особое правило домена — в каждой сети ровно один выход.
 */

/** История с поставленными на Холст Компонентами — база для следующих действий. */
function historyWithPlaced(
  kinds: readonly DigitalKind[],
  coordinates: readonly [number, number][] = [],
): DigitalCanvasHistory {
  let history = emptyDigitalHistory;
  kinds.forEach((kind, index) => {
    const [x, y] = coordinates[index] ?? [100 + index * 160, 100];
    history = digitalCanvasReducer(history, { type: 'component-placed', kind, x, y });
  });
  return history;
}

describe('Цифровой Холст: расстановка Компонентов', () => {
  it('Компонент из Палитры ставится на Холст с номиналом своего вида и привязкой к сетке', () => {
    let history = digitalCanvasReducer(emptyDigitalHistory, {
      type: 'component-placed',
      kind: 'clock',
      x: 133,
      y: 89,
    });
    history = digitalCanvasReducer(history, { type: 'component-placed', kind: 'button', x: 200, y: 100 });
    history = digitalCanvasReducer(history, { type: 'component-placed', kind: 'and', x: 300, y: 100 });

    const [clock, button, and] = history.present.components;
    expect(clock).toMatchObject({ kind: 'clock', x: 140, y: 80, frequency: defaultClockFrequency });
    expect(button).toMatchObject({ kind: 'button', high: false });
    expect(and).toMatchObject({ kind: 'and', rotation: 0 });
  });

  it('У элементов и Индикатора правимого номинала нет', () => {
    const history = historyWithPlaced(['and', 'not', 'or', 'indicator']);
    for (const component of history.present.components) {
      expect(component.high).toBeUndefined();
      expect(component.frequency).toBeUndefined();
    }
  });

  it('Идентификаторы назначаются редьюсером и не повторяются', () => {
    let history = historyWithPlaced(['button', 'and']);
    history = digitalCanvasReducer(history, { type: 'component-removed', componentId: 'c2' });
    history = digitalCanvasReducer(history, { type: 'component-placed', kind: 'indicator', x: 300, y: 100 });

    const ids = history.present.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Компонент не ставится и не переезжает за границы Холста', () => {
    let history = digitalCanvasReducer(emptyDigitalHistory, {
      type: 'component-placed',
      kind: 'not',
      x: -60,
      y: 40,
    });
    expect(history.present.components[0]).toMatchObject({ x: 40, y: 40 });

    history = digitalCanvasReducer(history, {
      type: 'component-moved',
      componentId: 'c1',
      x: 9000,
      y: -9000,
    });
    expect(history.present.components[0]).toMatchObject({ x: 760, y: 40 });
  });

  it('Клик по Палитре предлагает свободное место: раскладка общая с аналоговым Холстом', () => {
    let history = historyWithPlaced(['button', 'button'], [
      [100, 100],
      [220, 100],
    ]);
    expect(suggestPlacementPosition(history.present)).toEqual({ x: 340, y: 100 });
  });

  it('Поворот идёт шагами 90° и не выходит за полный оборот', () => {
    let history = historyWithPlaced(['and']);
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      history = digitalCanvasReducer(history, { type: 'component-rotated', componentId: 'c1' });
      expect(history.present.components[0].rotation).toBe((quarter * 90) % 360);
    }
  });

  it('Число выводов и роли согласованы: у И два входа и выход, у НЕ вход и выход, у источников выход, у Индикатора вход', () => {
    expect(digitalPinCountOf('and')).toBe(3);
    expect(digitalPinCountOf('not')).toBe(2);
    expect(digitalPinCountOf('button')).toBe(1);
    expect(digitalPinRole('and', 0)).toBe('input');
    expect(digitalPinRole('and', 1)).toBe('input');
    expect(digitalPinRole('and', 2)).toBe('output');
    expect(digitalPinRole('not', 0)).toBe('input');
    expect(digitalPinRole('not', 1)).toBe('output');
    expect(digitalPinRole('button', 0)).toBe('output');
    expect(digitalPinRole('clock', 0)).toBe('output');
    expect(digitalPinRole('indicator', 0)).toBe('input');
  });
});

describe('Цифровой Холст: соединение', () => {
  it('Провод выход → вход соединяется и получает идентификатор', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });

    expect(history.present.wires).toHaveLength(1);
    expect(history.present.wires[0].from).toEqual({ componentId: 'c1', pin: 0 });
    expect(history.present.wires[0].to).toEqual({ componentId: 'c2', pin: 0 });
  });

  it('Провод рисуется в любую сторону: вход → выход тот же', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c2', pin: 0 },
      to: { componentId: 'c1', pin: 0 },
    });
    expect(history.present.wires).toHaveLength(1);
  });

  it('Выход-выход и вход-вход без водителя отклоняются целиком', () => {
    let history = historyWithPlaced(['button', 'button', 'indicator', 'indicator']);
    const before = history;

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });
    expect(history).toBe(before);

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c3', pin: 0 },
      to: { componentId: 'c4', pin: 0 },
    });
    expect(history).toBe(before);
  });

  it('Второй выход в занятую сеть отклоняется: у сети один водитель', () => {
    let history = historyWithPlaced(['button', 'button', 'indicator']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c3', pin: 0 },
    });
    const withFirstWire = history;

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c2', pin: 0 },
      to: { componentId: 'c3', pin: 0 },
    });
    expect(history).toBe(withFirstWire);
  });

  it('Вход к чужой сети присоединяется: разветвление выхода законно', () => {
    let history = historyWithPlaced(['button', 'and', 'not']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 1 },
    });
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c2', pin: 0 },
      to: { componentId: 'c3', pin: 0 },
    });

    expect(history.present.wires).toHaveLength(3);
  });

  it('Тот же переход не соединяется дважды, но обратный переход отличён от прямого', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    const forward = { from: { componentId: 'c1', pin: 0 }, to: { componentId: 'c2', pin: 0 } } as const;
    const backward = { from: { componentId: 'c2', pin: 0 }, to: { componentId: 'c1', pin: 0 } } as const;

    history = digitalCanvasReducer(history, { type: 'wire-drawn', ...forward });
    const withWire = history;
    history = digitalCanvasReducer(history, { type: 'wire-drawn', ...forward });
    expect(history).toBe(withWire);
    history = digitalCanvasReducer(history, { type: 'wire-drawn', ...backward });
    expect(history).toBe(withWire);
  });

  it('Соединение отклоняется при неизвестном Компоненте, неверном выводе и петле на один вывод', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    const before = history;

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'missing', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });
    expect(history).toBe(before);

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 5 },
      to: { componentId: 'c2', pin: 0 },
    });
    expect(history).toBe(before);

    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c1', pin: 0 },
    });
    expect(history).toBe(before);
  });
});

describe('Цифровой Холст: удаление', () => {
  it('Удаление Компонента уносит его Провода с собой', () => {
    let history = historyWithPlaced(['button', 'indicator', 'indicator']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c3', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });

    history = digitalCanvasReducer(history, { type: 'component-removed', componentId: 'c2' });
    expect(history.present.components.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(history.present.wires).toHaveLength(0);
  });

  it('Удаление Провода не трогает Компоненты; неизвестный Провод и Компонент — состояние без изменений', () => {
    let history = historyWithPlaced(['button', 'indicator']);
    history = digitalCanvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 0 },
    });
    const withWire = history;

    history = digitalCanvasReducer(history, { type: 'wire-removed', wireId: 'w1' });
    expect(history.present.wires).toHaveLength(0);
    expect(history.present.components).toEqual(withWire.present.components);

    expect(digitalCanvasReducer(history, { type: 'wire-removed', wireId: 'w9' })).toBe(history);
    expect(digitalCanvasReducer(history, { type: 'component-removed', componentId: 'c9' })).toBe(history);
  });
});

describe('Цифровой Холст: правка номиналов', () => {
  it('Кнопка переключается редьюсером и кликом по Панели', () => {
    let history = historyWithPlaced(['button']);
    history = digitalCanvasReducer(history, {
      type: 'component-value-set',
      componentId: 'c1',
      patch: { high: true },
    });
    expect(history.present.components[0].high).toBe(true);

    history = digitalCanvasReducer(history, {
      type: 'component-value-set',
      componentId: 'c1',
      patch: { high: false },
    });
    expect(history.present.components[0].high).toBe(false);
  });

  it('Частота Генератора меняется в границах; некорректная правка отклоняется', () => {
    let history = historyWithPlaced(['clock']);
    history = digitalCanvasReducer(history, {
      type: 'component-value-set',
      componentId: 'c1',
      patch: { frequency: 4 },
    });
    expect(history.present.components[0].frequency).toBe(4);

    const withValid = history;
    for (const frequency of [0, -1, 100, Number.NaN]) {
      history = digitalCanvasReducer(history, {
        type: 'component-value-set',
        componentId: 'c1',
        patch: { frequency },
      });
      expect(history).toBe(withValid);
    }
  });

  it('Границы частоты согласованы с валидатором', () => {
    expect(isValidFrequency(clockFrequencyBounds.min)).toBe(true);
    expect(isValidFrequency(clockFrequencyBounds.max)).toBe(true);
    expect(isValidFrequency(clockFrequencyBounds.min - 0.1)).toBe(false);
    expect(isValidFrequency(clockFrequencyBounds.max + 0.1)).toBe(false);
  });

  it('Правка чужого поля вида отклоняется: элемент не «нажимается», кнопка не «тикает»', () => {
    let history = historyWithPlaced(['and', 'button']);
    const before = history;

    history = digitalCanvasReducer(history, {
      type: 'component-value-set',
      componentId: 'c1',
      patch: { high: true },
    });
    expect(history).toBe(before);

    history = digitalCanvasReducer(history, {
      type: 'component-value-set',
      componentId: 'c2',
      patch: { frequency: 4 },
    });
    expect(history).toBe(before);
  });

  it('Правка неизвестного Компонента — состояние без изменений', () => {
    const history = historyWithPlaced(['button']);
    expect(
      digitalCanvasReducer(history, {
        type: 'component-value-set',
        componentId: 'c9',
        patch: { high: true },
      }),
    ).toBe(history);
  });
});

describe('Цифровой Холст: история', () => {
  it('Undo и redo возвращают ровно на шаг', () => {
    let history = historyWithPlaced(['button']);
    history = digitalCanvasReducer(history, {
      type: 'component-placed',
      kind: 'indicator',
      x: 300,
      y: 100,
    });
    expect(history.present.components).toHaveLength(2);

    history = digitalCanvasReducer(history, { type: 'undo' });
    expect(history.present.components).toHaveLength(1);

    history = digitalCanvasReducer(history, { type: 'redo' });
    expect(history.present.components).toHaveLength(2);
  });

  it('Новое действие после undo стирает ветку redo', () => {
    let history = historyWithPlaced(['button']);
    history = digitalCanvasReducer(history, { type: 'undo' });
    expect(history.present.components).toHaveLength(0);
    expect(history.future).toHaveLength(1);

    history = digitalCanvasReducer(history, {
      type: 'component-placed',
      kind: 'and',
      x: 300,
      y: 100,
    });
    expect(history.future).toHaveLength(0);
    expect(history.past).toHaveLength(1);
  });

  it('Undo и redo на границах истории — состояние без изменений', () => {
    const history = historyWithPlaced(['button']);
    expect(digitalCanvasReducer(history, { type: 'redo' })).toBe(history);

    const undone = digitalCanvasReducer(history, { type: 'undo' });
    expect(digitalCanvasReducer(undone, { type: 'undo' })).toBe(undone);
  });

  it('Загрузка схемы начинает новый сеанс правки, сброс опустошает Холст с возможностью отмены', () => {
    const history = digitalCanvasReducer(emptyDigitalHistory, {
      type: 'canvas-loaded',
      canvas: demoDigitalCanvas(),
    });
    expect(history.past).toHaveLength(0);
    expect(history.present.components).toHaveLength(6);

    let reset = digitalCanvasReducer(history, { type: 'canvas-reset' });
    expect(reset.present.components).toHaveLength(0);
    expect(reset.present.wires).toHaveLength(0);

    reset = digitalCanvasReducer(reset, { type: 'undo' });
    expect(reset.present.components).toHaveLength(6);
  });
});
