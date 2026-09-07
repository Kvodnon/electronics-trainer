import { describe, expect, it } from 'vitest';
import { CANVAS_SIZE, clampPosition, pinPointOf, routeWire, snapToGrid } from './canvasGeometry';
import type { PlacedComponent } from './canvas';

/**
 * Геометрия Холста — чистые функции: где выводы Компонента при его повороте
 * и какой ортогональный маршрут идёт между выводами. Координаты — логические
 * пиксели, сетка 20, выводы двухвыводных Компонентов на ±40 от центра.
 */

function componentAt(x: number, y: number, rotation: PlacedComponent['rotation'] = 0): PlacedComponent {
  return { id: 'c1', kind: 'resistor', x, y, rotation };
}

describe('Привязка к сетке и границы Холста', () => {
  it('Координаты привязываются к ближайшему узлу сетки', () => {
    expect(snapToGrid(33)).toBe(40);
    expect(snapToGrid(29)).toBe(20);
    expect(snapToGrid(-7)).toBe(0);
  });

  it('Компонент не покидает Холст: центр держится в пределах поля', () => {
    expect(clampPosition({ x: -50, y: 999 })).toEqual({ x: 40, y: CANVAS_SIZE.height - 40 });
    expect(clampPosition({ x: 4000, y: 300 })).toEqual({ x: CANVAS_SIZE.width - 40, y: 300 });
  });
});

describe('Выводы Компонентов при повороте', () => {
  it('Без поворота выводы лежат горизонтально: слева и справа, наружу от центра', () => {
    const left = pinPointOf(componentAt(200, 200), 0);
    const right = pinPointOf(componentAt(200, 200), 1);
    expect(left).toEqual({ x: 160, y: 200, dx: -1, dy: 0 });
    expect(right).toEqual({ x: 240, y: 200, dx: 1, dy: 0 });
  });

  it('Поворот 90° по часовой ставит выводы вертикально', () => {
    const top = pinPointOf(componentAt(200, 200, 90), 0);
    const bottom = pinPointOf(componentAt(200, 200, 90), 1);
    expect(top).toEqual({ x: 200, y: 160, dx: 0, dy: -1 });
    expect(bottom).toEqual({ x: 200, y: 240, dx: 0, dy: 1 });
  });

  it('Поворот 180° меняет выводы местами; 270° — вертикально наоборот', () => {
    expect(pinPointOf(componentAt(200, 200, 180), 0)).toEqual({ x: 240, y: 200, dx: 1, dy: 0 });
    expect(pinPointOf(componentAt(200, 200, 270), 0)).toEqual({ x: 200, y: 240, dx: 0, dy: 1 });
  });
});

describe('Трассировка Проводов', () => {
  it('Выводы друг напротив друга на одной строке — прямая линия', () => {
    const route = routeWire(
      { x: 140, y: 200, dx: 1, dy: 0 },
      { x: 260, y: 200, dx: -1, dy: 0 },
    );
    expect(route).toEqual([
      { x: 140, y: 200 },
      { x: 260, y: 200 },
    ]);
  });

  it('Выводы на разных строках — Г-образный маршрут из ортогональных сегментов', () => {
    const route = routeWire(
      { x: 140, y: 200, dx: 1, dy: 0 },
      { x: 300, y: 320, dx: -1, dy: 0 },
    );
    expect(route[0]).toEqual({ x: 140, y: 200 });
    expect(route[route.length - 1]).toEqual({ x: 300, y: 320 });
    expectOrthogonal(route);
    expectOnGrid(route);
  });

  it('Оба вывода вертикальные и на одной вертикали — прямая', () => {
    const route = routeWire(
      { x: 200, y: 140, dx: 0, dy: 1 },
      { x: 200, y: 260, dx: 0, dy: -1 },
    );
    expect(route).toEqual([
      { x: 200, y: 140 },
      { x: 200, y: 260 },
    ]);
  });

  it('Маршрут всегда ортогональный и по сетке — встречные и повёрнутые выводы', () => {
    const cases: readonly [ReturnType<typeof pinPointOf>, ReturnType<typeof pinPointOf>][] = [
      [
        { x: 100, y: 100, dx: 1, dy: 0 },
        { x: 100, y: 300, dx: 0, dy: -1 },
      ],
      [
        { x: 400, y: 100, dx: 0, dy: 1 },
        { x: 200, y: 400, dx: 1, dy: 0 },
      ],
      [
        { x: 140, y: 120, dx: 1, dy: 0 },
        { x: 120, y: 140, dx: 0, dy: 1 },
      ],
    ];
    for (const [from, to] of cases) {
      const route = routeWire(from, to);
      expect(route[0]).toEqual({ x: from.x, y: from.y });
      expect(route[route.length - 1]).toEqual({ x: to.x, y: to.y });
      expectOrthogonal(route);
      expectOnGrid(route);
    }
  });

  it('Черновик Проводов: свободный конец без направления тоже даёт ортогональный маршрут', () => {
    const route = routeWire({ x: 140, y: 200, dx: 1, dy: 0 }, { x: 300, y: 320, dx: 0, dy: 0 });
    expect(route[0]).toEqual({ x: 140, y: 200 });
    expect(route[route.length - 1]).toEqual({ x: 300, y: 320 });
    expectOrthogonal(route);
    expectOnGrid(route);
  });
});

/** Каждый сегмент строго горизонтален или вертикален. */
function expectOrthogonal(route: readonly { x: number; y: number }[]): void {
  for (let i = 1; i < route.length; i += 1) {
    const axisAligned =
      Math.abs(route[i].x - route[i - 1].x) === 0 || Math.abs(route[i].y - route[i - 1].y) === 0;
    expect(axisAligned, `сегмент ${i - 1}→${i} не ортогональный: ${JSON.stringify(route)}`).toBe(true);
    expect(route[i]).not.toEqual(route[i - 1]);
  }
}

/** Все точки лежат в узлах сетки 20. */
function expectOnGrid(route: readonly { x: number; y: number }[]): void {
  for (const point of route) {
    expect(point.x % 20, `x=${point.x} не в узле сетки`).toBe(0);
    expect(point.y % 20, `y=${point.y} не в узле сетки`).toBe(0);
  }
}

describe('Выводы трёхвыводных Компонентов (тикет 15)', () => {
  it('Транзистор: база слева, коллектор справа сверху, эмиттер справа снизу', () => {
    const transistor: PlacedComponent = { id: 'q', kind: 'transistor', x: 200, y: 200, rotation: 0 };
    expect(pinPointOf(transistor, 0)).toEqual({ x: 160, y: 200, dx: -1, dy: 0 });
    expect(pinPointOf(transistor, 1)).toEqual({ x: 240, y: 160, dx: 1, dy: 0 });
    expect(pinPointOf(transistor, 2)).toEqual({ x: 240, y: 240, dx: 1, dy: 0 });
  });

  it('Потенциометр: концы по горизонтали, движок снизу', () => {
    const pot: PlacedComponent = { id: 'p', kind: 'potentiometer', x: 200, y: 200, rotation: 0 };
    expect(pinPointOf(pot, 0)).toEqual({ x: 160, y: 200, dx: -1, dy: 0 });
    expect(pinPointOf(pot, 1)).toEqual({ x: 200, y: 240, dx: 0, dy: 1 });
    expect(pinPointOf(pot, 2)).toEqual({ x: 240, y: 200, dx: 1, dy: 0 });
  });

  it('Три вывода вращаются как одно целое', () => {
    const transistor: PlacedComponent = { id: 'q', kind: 'transistor', x: 200, y: 200, rotation: 90 };
    // поворот по часовой: база уходит наверх, коллектор — вправо вниз, эмиттер — влево вниз
    expect(pinPointOf(transistor, 0)).toEqual({ x: 200, y: 160, dx: 0, dy: -1 });
    expect(pinPointOf(transistor, 1)).toEqual({ x: 240, y: 240, dx: 0, dy: 1 });
    expect(pinPointOf(transistor, 2)).toEqual({ x: 160, y: 240, dx: 0, dy: 1 });
  });
});
