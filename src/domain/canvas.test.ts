import { describe, expect, it } from 'vitest';
import {
  canvasReducer,
  defaultValuesOf,
  emptyCanvas,
  emptyHistory,
  suggestPlacementPosition,
  type CanvasHistory,
  type CanvasState,
  type ComponentKind,
  type ComponentValuePatch,
} from './canvas';

/**
 * Редьюсер Холста — второй шов домена (см. spec: Testing Decisions):
 * каждое действие редактора проверяется на поведение, не на устройство.
 * Координаты — логические пиксели Холста, сетка 20.
 */

/** История с поставленными на Холст Компонентами — база для следующих действий. */
function historyWithPlaced(
  kinds: readonly ComponentKind[],
  coordinates: readonly [number, number][] = [],
): CanvasHistory {
  let history = emptyHistory;
  kinds.forEach((kind, index) => {
    const [x, y] = coordinates[index] ?? [100 + index * 120, 100];
    history = canvasReducer(history, { type: 'component-placed', kind, x, y });
  });
  return history;
}

describe('Холст: расстановка Компонентов', () => {
  it('Компонент из Палитры ставится на Холст с номиналом по умолчанию и привязкой к сетке', () => {
    const next = canvasReducer(emptyHistory, {
      type: 'component-placed',
      kind: 'battery',
      x: 133,
      y: 89,
    });

    expect(next.present.components).toHaveLength(1);
    const placed = next.present.components[0];
    expect(placed.kind).toBe('battery');
    expect(placed.x).toBe(140); // 133 → ближайший узел сетки
    expect(placed.y).toBe(80);
    expect(placed.rotation).toBe(0);
    expect(placed.voltage).toBe(9); // В по умолчанию
  });

  it('У каждого вида — свой номинал по умолчанию: резистор 1 кОм, лампа и мотор — сопротивление, выключатель и ключ — разомкнуты', () => {
    const kinds = ['resistor', 'lamp', 'motor', 'switch', 'pushbutton'] as const;
    let history = emptyHistory;
    for (const kind of kinds) {
      history = canvasReducer(history, { type: 'component-placed', kind, x: 100, y: 100 });
    }

    const byKind = new Map(history.present.components.map((c) => [c.kind, c]));
    expect(byKind.get('resistor')?.resistance).toBe(1000);
    expect(byKind.get('lamp')?.resistance).toBe(120);
    expect(byKind.get('motor')?.resistance).toBe(50);
    expect(byKind.get('switch')?.closed).toBe(false);
    expect(byKind.get('pushbutton')?.closed).toBe(false);
  });

  it('Идентификаторы назначаются редьюсером и не повторяются', () => {
    let history = emptyHistory;
    history = canvasReducer(history, { type: 'component-placed', kind: 'battery', x: 60, y: 60 });
    history = canvasReducer(history, { type: 'component-placed', kind: 'resistor', x: 200, y: 60 });

    const ids = history.present.components.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('Компонент не ставится и не переезжает за границы Холста', () => {
    let history = canvasReducer(emptyHistory, { type: 'component-placed', kind: 'battery', x: -60, y: 40 });
    expect(history.present.components[0]).toMatchObject({ x: 40, y: 40 });

    history = canvasReducer(history, { type: 'component-moved', componentId: 'c1', x: 9000, y: -9000 });
    expect(history.present.components[0]).toMatchObject({ x: 760, y: 40 });
  });

  it('Клик по Палитре предлагает свободное место: построчный обход, занятые клетки пропускаются', () => {
    let history = emptyHistory;
    for (const [x, y] of [[100, 100], [220, 100]] as const) {
      history = canvasReducer(history, { type: 'component-placed', kind: 'resistor', x, y });
    }

    // Первая позиция ряда занята — предлагаем следующую свободную
    expect(suggestPlacementPosition(history.present)).toEqual({ x: 340, y: 100 });
  });

  it('Номиналы по умолчанию доступны и для Палитры', () => {
    expect(defaultValuesOf('battery')).toEqual({ voltage: 9 });
    expect(defaultValuesOf('switch')).toEqual({ closed: false });
  });
});

describe('Холст: перемещение Компонентов', () => {
  it('Перемещение меняет позицию с привязкой к сетке; Провод сохраняет соединение', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    history = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 1 },
      to: { componentId: 'c2', pin: 0 },
    });
    history = canvasReducer(history, { type: 'component-moved', componentId: 'c2', x: 331, y: 269 });

    const moved = history.present.components.find((c) => c.id === 'c2');
    expect(moved?.x).toBe(340);
    expect(moved?.y).toBe(260);
    // Соединение не рвётся: Провод по-прежнему ссылается на те же выводы
    expect(history.present.wires).toHaveLength(1);
    expect(history.present.wires[0].from).toEqual({ componentId: 'c1', pin: 1 });
    expect(history.present.wires[0].to).toEqual({ componentId: 'c2', pin: 0 });
  });

  it('Перемещение неизвестного Компонента — состояние без изменений', () => {
    const history = historyWithPlaced(['battery']);
    const next = canvasReducer(history, { type: 'component-moved', componentId: 'missing-component', x: 0, y: 0 });
    expect(next).toBe(history);
  });
});

describe('Холст: поворот и удаление', () => {
  it('Поворот шагает по 90° по часовой и заворачивает обратно к 0°', () => {
    let history = historyWithPlaced(['resistor']);
    for (const rotation of [90, 180, 270, 0]) {
      history = canvasReducer(history, { type: 'component-rotated', componentId: 'c1' });
      expect(history.present.components[0].rotation).toBe(rotation);
    }
  });

  it('Удаление Компонента убирает и все его Провода; цепи без него живут', () => {
    // батарея — ключ — лампочка, параллельно батарея — резистор
    let history = historyWithPlaced(['battery', 'pushbutton', 'lamp', 'resistor']);
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c2', pin: 1 }, to: { componentId: 'c3', pin: 0 } });
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 0 }, to: { componentId: 'c4', pin: 1 } });
    expect(history.present.wires).toHaveLength(3);

    history = canvasReducer(history, { type: 'component-removed', componentId: 'c2' });

    expect(history.present.components.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    // Оба Провода ключа исчезли вместе с ним; Провод резистора уцелел
    expect(history.present.wires).toHaveLength(1);
    expect(history.present.wires[0].to).toEqual({ componentId: 'c4', pin: 1 });
  });

  it('Поворот и удаление неизвестного Компонента — состояние без изменений', () => {
    const history = historyWithPlaced(['battery']);
    expect(canvasReducer(history, { type: 'component-rotated', componentId: 'x' })).toBe(history);
    expect(canvasReducer(history, { type: 'component-removed', componentId: 'x' })).toBe(history);
  });
});

describe('Холст: номиналы Компонентов', () => {
  it('Напряжение батареи и сопротивление резистора правятся; остальные поля не трогаются', () => {
    let history = historyWithPlaced(['battery', 'resistor']);
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: 12 } });
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c2', patch: { resistance: 2200 } });

    const battery = history.present.components.find((c) => c.id === 'c1');
    const resistor = history.present.components.find((c) => c.id === 'c2');
    expect(battery?.voltage).toBe(12);
    expect(resistor?.resistance).toBe(2200);
  });

  it('Выключатель замыкается и размыкается правкой closed', () => {
    let history = historyWithPlaced(['switch']);
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { closed: true } });
    expect(history.present.components[0].closed).toBe(true);

    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { closed: false } });
    expect(history.present.components[0].closed).toBe(false);
  });

  it('Отрицательные, нечисловые и чужие номиналы отклоняются; неизвестный Компонент — без изменений', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    const negative = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: -3 } });
    const notANumber = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: Number.NaN } });
    // Напряжение — поле батареи, к лампе оно не прилипает (Симулятор тикета 05 читает эти объекты)
    const wrongKind = canvasReducer(history, { type: 'component-value-set', componentId: 'c2', patch: { voltage: 5 } });
    const unknown = canvasReducer(history, { type: 'component-value-set', componentId: 'missing', patch: { voltage: 5 } });
    expect(negative).toBe(history);
    expect(notANumber).toBe(history);
    expect(wrongKind).toBe(history);
    expect(unknown).toBe(history);
  });
});

describe('Холст: undo/redo и сброс', () => {
  it('Отмена возвращает каждое действие редактора — по одному шагу', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });
    history = canvasReducer(history, { type: 'component-rotated', componentId: 'c2' });
    history = canvasReducer(history, { type: 'component-moved', componentId: 'c2', x: 300, y: 200 });
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: 4.5 } });

    // Пять действий — пять отмен, каждая точна
    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.components.find((c) => c.id === 'c1')?.voltage).toBe(9);

    history = canvasReducer(history, { type: 'undo' });
    const lamp = history.present.components.find((c) => c.id === 'c2');
    expect(lamp?.x).toBe(220);
    expect(lamp?.y).toBe(100);

    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.components.find((c) => c.id === 'c2')?.rotation).toBe(0);

    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.wires).toHaveLength(0);

    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.components).toHaveLength(1);

    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.components).toHaveLength(0);

    // Отменять больше нечего — состояние то же
    const exhausted = canvasReducer(history, { type: 'undo' });
    expect(exhausted).toBe(history);
  });

  it('Возврат повторяет отменённое; новое действие стирает ветку возврата', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    history = canvasReducer(history, { type: 'component-removed', componentId: 'c2' });
    history = canvasReducer(history, { type: 'undo' });
    history = canvasReducer(history, { type: 'redo' });
    expect(history.present.components).toHaveLength(1);

    history = canvasReducer(history, { type: 'undo' });
    history = canvasReducer(history, { type: 'component-placed', kind: 'switch', x: 400, y: 300 });
    // После нового действия redo больше не доступен
    const noFuture = canvasReducer(history, { type: 'redo' });
    expect(noFuture).toBe(history);
  });

  it('Сброс очищает Холст и сам отменяется', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });

    history = canvasReducer(history, { type: 'canvas-reset' });
    expect(history.present.components).toHaveLength(0);
    expect(history.present.wires).toHaveLength(0);

    history = canvasReducer(history, { type: 'undo' });
    expect(history.present.components).toHaveLength(2);
    expect(history.present.wires).toHaveLength(1);
  });
});

describe('Холст: сериализация', () => {
  it('Состояние Холста проходит через JSON туда-обратно без потерь', () => {
    let history = historyWithPlaced(
      ['battery', 'switch', 'lamp', 'motor'],
      [
        [80, 100],
        [240, 100],
        [400, 100],
        [560, 100],
      ],
    );
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c2', pin: 1 }, to: { componentId: 'c3', pin: 0 } });
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: 4.5 } });
    history = canvasReducer(history, { type: 'component-rotated', componentId: 'c4' });

    const restored: typeof history.present = JSON.parse(JSON.stringify(history.present));
    expect(restored).toEqual(history.present);

    // Восстановленное состояние полноценно живёт: редактирование продолжается
    // без конфликтов идентификаторов, undo/redo работают
    const continued = canvasReducer(
      { past: [], present: restored, future: [] },
      { type: 'component-placed', kind: 'pushbutton', x: 700, y: 300 },
    );
    expect(continued.present.components.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
    const undone = canvasReducer(continued, { type: 'undo' });
    expect(undone.present.components).toHaveLength(4);
    expect(undone.present.wires).toHaveLength(2);
  });
});

describe('Холст: Провода', () => {
  it('Провод соединяет два вывода разных Компонентов; направление записи неважно', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    history = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 1 },
      to: { componentId: 'c2', pin: 0 },
    });
    history = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c2', pin: 0 },
      to: { componentId: 'c1', pin: 1 },
    });

    // Повторное соединение тех же выводов (в любую сторону) не создаёт второй Провод
    expect(history.present.wires).toHaveLength(1);
    expect(history.present.wires[0].from).toEqual({ componentId: 'c1', pin: 1 });
    expect(history.present.wires[0].to).toEqual({ componentId: 'c2', pin: 0 });
  });

  it('Один вывод может нести несколько Проводов — параллельные ветви собираются', () => {
    let history = historyWithPlaced(['battery', 'lamp', 'resistor']);
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c3', pin: 0 } });

    expect(history.present.wires).toHaveLength(2);
  });

  it('Провод сам на себя и на несуществующий вывод не протягивается', () => {
    let history = historyWithPlaced(['battery', 'lamp']);
    const selfLoop = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c1', pin: 0 },
    });
    expect(selfLoop).toBe(history);

    const missingPin = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'c2', pin: 7 },
    });
    expect(missingPin).toBe(history);

    const missingComponent = canvasReducer(history, {
      type: 'wire-drawn',
      from: { componentId: 'c1', pin: 0 },
      to: { componentId: 'missing-component', pin: 0 },
    });
    expect(missingComponent).toBe(history);
  });

  it('Удаление Провода разрывает только его', () => {
    let history = historyWithPlaced(['battery', 'lamp', 'resistor']);
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } });
    history = canvasReducer(history, { type: 'wire-drawn', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c3', pin: 0 } });

    history = canvasReducer(history, { type: 'wire-removed', wireId: 'w1' });

    expect(history.present.wires).toHaveLength(1);
    expect(history.present.wires[0].to).toEqual({ componentId: 'c3', pin: 0 });
    expect(canvasReducer(history, { type: 'wire-removed', wireId: 'missing-wire' })).toBe(history);
  });
});

describe('Загрузка сохранённой схемы', () => {
  it('canvas-loaded заменяет Холст снимком и начинает новую историю', () => {
    const draft = historyWithPlaced(['battery', 'lamp']);
    const saved: CanvasState = {
      components: [
        { id: 'c9', kind: 'motor', x: 340, y: 220, rotation: 90, resistance: 80 },
      ],
      wires: [],
    };

    const loaded = canvasReducer(draft, { type: 'canvas-loaded', canvas: saved });

    expect(loaded.present).toEqual(saved);
    // прежний черновик не возвращается: загрузка — новый сеанс правки
    expect(canvasReducer(loaded, { type: 'undo' }).present).toEqual(saved);
    expect(canvasReducer(loaded, { type: 'redo' })).toBe(loaded);
  });

  it('после загрузки редактор продолжает работу: постановка и undo ведут себя как обычно', () => {
    const loaded = canvasReducer(emptyHistory, {
      type: 'canvas-loaded',
      canvas: emptyCanvas,
    });

    const placed = canvasReducer(loaded, { type: 'component-placed', kind: 'resistor', x: 100, y: 100 });
    expect(placed.present.components).toHaveLength(1);
    const undone = canvasReducer(placed, { type: 'undo' });
    expect(undone.present.components).toHaveLength(0);
    expect(canvasReducer(undone, { type: 'redo' }).present.components).toHaveLength(1);
  });
});

describe('Холст М2: диод и светодиод', () => {
  it('Светодиод ставится с цветом по умолчанию; диод не имеет правимого номинала', () => {
    const history = historyWithPlaced(['led', 'diode']);
    expect(defaultValuesOf('led')).toEqual({ color: 'red' });
    expect(defaultValuesOf('diode')).toEqual({});
    expect(history.present.components[0].color).toBe('red');
  });

  it('Цвет свечения светодиода меняется правкой color; чужие поля не прилипают', () => {
    let history = historyWithPlaced(['led']);
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { color: 'green' } });
    expect(history.present.components[0].color).toBe('green');
    // сопротивление — не поле светодиода
    const wrongField = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { resistance: 100 } });
    expect(wrongField).toBe(history);
  });

  it('Правка color отклоняет неизвестный цвет и не трогает диод', () => {
    let history = historyWithPlaced(['led', 'diode']);
    // цвет приходит в редьюсер из нетипизированных источников (импорт схемы,
    // панель правки) — проверяется защита на уровне данных
    const untypedColor = { color: 'crimson' } as unknown as ComponentValuePatch;
    const badColor = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: untypedColor });
    expect(badColor).toBe(history);
    // у диода нет правимого номинала вовсе
    const diodePatch = canvasReducer(history, { type: 'component-value-set', componentId: 'c2', patch: { color: 'red' } });
    expect(diodePatch).toBe(history);
    const diodeResistance = canvasReducer(history, { type: 'component-value-set', componentId: 'c2', patch: { resistance: 100 } });
    expect(diodeResistance).toBe(history);
  });
});

describe('Холст М2: конденсатор (тикет 14)', () => {
  it('Конденсатор ставится с ёмкостью по умолчанию 100 мкФ', () => {
    const history = historyWithPlaced(['capacitor']);
    expect(defaultValuesOf('capacitor')).toEqual({ capacitance: 0.0001 });
    expect(history.present.components[0].capacitance).toBe(0.0001);
  });

  it('Ёмкость правится; чужие поля и нечисловые значения не прилипают', () => {
    let history = historyWithPlaced(['capacitor', 'battery']);
    history = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { capacitance: 4.7e-7 } });
    expect(history.present.components[0].capacitance).toBe(4.7e-7);

    const negative = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { capacitance: -1e-6 } });
    const nan = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { capacitance: Number.NaN } });
    // напряжение — не поле конденсатора
    const wrongKind = canvasReducer(history, { type: 'component-value-set', componentId: 'c1', patch: { voltage: 5 } });
    const unknown = canvasReducer(history, { type: 'component-value-set', componentId: 'missing', patch: { capacitance: 1e-6 } });
    expect(negative).toBe(history);
    expect(nan).toBe(history);
    expect(wrongKind).toBe(history);
    expect(unknown).toBe(history);
  });
});
