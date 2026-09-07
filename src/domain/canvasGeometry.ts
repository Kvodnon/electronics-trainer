/**
 * Геометрия Холста: чистые функции без DOM. Позиции выводов Компонентов при
 * повороте, привязка к сетке, границы Холста и ортогональная трассировка
 * Проводов — всё, что слою отрисовки нужно от домена, чтобы рисовать схему.
 */
import type { ComponentKind, PlacedComponent } from './canvas';

/** Шаг сетки Холста в логических пикселях. */
export const GRID = 20;

/** Размер Холста в логических пикселях (SVG viewBox). */
export const CANVAS_SIZE = { width: 800, height: 560 } as const;

/** Расстояние от центра Компонента до вывода: символы рисуются в габаритах ±40. */
export const PIN_REACH = 40;

/** Точка в координатах Холста. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Точка с направлением «наружу» — вывод Компонента или свободный конец. */
export interface DirectedPoint extends Point {
  readonly dx: number;
  readonly dy: number;
}

/** Привязка координаты к ближайшему узлу сетки. */
export function snapToGrid(value: number): number {
  return normalizeZero(Math.round(value / GRID) * GRID);
}

/** Позиция Компонента из жеста: узел сетки внутри границ Холста. */
export function snapPlacement(position: Point): Point {
  return clampPosition({ x: snapToGrid(position.x), y: snapToGrid(position.y) });
}

/** −0 не отличим от 0 глазом, но не равен ему при строгом сравнении. */
function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Позиция с учётом границ: центр Компонента не выходит за поле. */
export function clampPosition(position: Point): Point {
  return {
    x: Math.min(Math.max(position.x, PIN_REACH), CANVAS_SIZE.width - PIN_REACH),
    y: Math.min(Math.max(position.y, PIN_REACH), CANVAS_SIZE.height - PIN_REACH),
  };
}

/**
 * Выводы в локальных координатах (до поворота): два вывода горизонтально —
 * базовая раскладка большинства Компонентов; направления — наружу от центра.
 */
const TWO_PIN_LOCAL: readonly DirectedPoint[] = [
  { x: -PIN_REACH, y: 0, dx: -1, dy: 0 },
  { x: PIN_REACH, y: 0, dx: 1, dy: 0 },
];

/**
 * Транзистор: база (вывод 0) слева, коллектор (1) справа сверху,
 * эмиттер (2) справа снизу — классическая раскладка NPN-символа.
 */
const TRANSISTOR_LOCAL: readonly DirectedPoint[] = [
  { x: -PIN_REACH, y: 0, dx: -1, dy: 0 },
  { x: PIN_REACH, y: -PIN_REACH, dx: 1, dy: 0 },
  { x: PIN_REACH, y: PIN_REACH, dx: 1, dy: 0 },
];

/** Потенциометр: концы (выводы 0 и 2) по горизонтали, движок (1) снизу. */
const POTENTIOMETER_LOCAL: readonly DirectedPoint[] = [
  { x: -PIN_REACH, y: 0, dx: -1, dy: 0 },
  { x: 0, y: PIN_REACH, dx: 0, dy: 1 },
  { x: PIN_REACH, y: 0, dx: 1, dy: 0 },
];

const LOCAL_PINS_BY_KIND: Partial<Record<ComponentKind, readonly DirectedPoint[]>> = {
  transistor: TRANSISTOR_LOCAL,
  potentiometer: POTENTIOMETER_LOCAL,
};

/** Поворот точки с направлением на 90° по часовой стрелке (ось Y вниз). */
export function rotate90(point: DirectedPoint): DirectedPoint {
  return {
    x: normalizeZero(-point.y),
    y: point.x,
    dx: normalizeZero(-point.dy),
    dy: point.dx,
  };
}

function rotateTimes(point: DirectedPoint, quarterTurns: number): DirectedPoint {
  let rotated = point;
  for (let i = 0; i < quarterTurns; i += 1) rotated = rotate90(rotated);
  return rotated;
}

/** Позиция и направление вывода Компонента на Холсте. */
export function pinPointOf(component: PlacedComponent, pin: number): DirectedPoint {
  const local = (LOCAL_PINS_BY_KIND[component.kind] ?? TWO_PIN_LOCAL)[pin];
  const rotated = rotateTimes(local, component.rotation / 90);
  return { x: component.x + rotated.x, y: component.y + rotated.y, dx: rotated.dx, dy: rotated.dy };
}

const WIRE_STUB = 20;

/**
 * Ортогональный маршрут Провода между выводами: короткий выход вдоль вывода,
 * затем Г- или Z-образный обход — без возврата назад сразу после выхода.
 * Сегменты строго горизонтальны/вертикальны и лежат в узлах сетки.
 * Направление (0,0) у конца — свободный конец (черновик за курсором).
 */
export function routeWire(from: DirectedPoint, to: DirectedPoint): readonly Point[] {
  const stubFrom: Point = { x: from.x + from.dx * WIRE_STUB, y: from.y + from.dy * WIRE_STUB };
  const hasOutDirection = to.dx !== 0 || to.dy !== 0;
  const stubTo: Point = hasOutDirection
    ? { x: to.x + to.dx * WIRE_STUB, y: to.y + to.dy * WIRE_STUB }
    : { x: to.x, y: to.y };

  const route: Point[] = [{ x: from.x, y: from.y }, stubFrom];
  if (stubFrom.x !== stubTo.x && stubFrom.y !== stubTo.y) {
    route.push(cornerBetween(stubFrom, from, stubTo));
  }
  route.push(stubTo);
  if (hasOutDirection) route.push({ x: to.x, y: to.y });
  return tidy(route);
}

/**
 * Угол поворота между выходом и входом. Первым идёт сегмент вдоль направления
 * вывода-источника, но только если вход не «позади» выхода — иначе маршрут
 * разворачивается поперёк (Z вместо возврата назад).
 */
function cornerBetween(stubFrom: Point, from: DirectedPoint, stubTo: Point): Point {
  const alongSourceFirst =
    from.dx === 0 && from.dy === 0
      ? Math.abs(stubTo.x - stubFrom.x) >= Math.abs(stubTo.y - stubFrom.y)
      : Math.sign(stubTo.x - stubFrom.x) * from.dx + Math.sign(stubTo.y - stubFrom.y) * from.dy > 0;
  const sourceHorizontal = from.dy === 0;
  return alongSourceFirst === sourceHorizontal
    ? { x: stubTo.x, y: stubFrom.y }
    : { x: stubFrom.x, y: stubTo.y };
}

function tidy(route: readonly Point[]): Point[] {
  const clean: Point[] = [];
  for (const point of route) {
    const last = clean[clean.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) clean.push(point);
  }
  const merged: Point[] = [];
  for (let i = 0; i < clean.length; i += 1) {
    const previous = merged[merged.length - 1];
    const next = clean[i + 1];
    if (previous && next && isCollinear(previous, clean[i], next)) continue;
    merged.push(clean[i]);
  }
  return merged;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  return (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
}
