/**
 * Геометрия цифрового Холста: раскладка выводов Компонентов при повороте.
 * Сетка, границы и ортогональная трассировка Проводов — общие с аналоговым
 * Холстом (canvasGeometry): ADR-0002 разрешает общий код уровня Холста.
 */
import { PIN_REACH, rotate90, type DirectedPoint } from './canvasGeometry';
import type { DigitalComponent, DigitalKind } from './digitalCanvas';

/** Входы И/ИЛИ по краям слева, выход по центру справа — классическая раскладка элемента. */
const GATE_INPUT_FIRST: DirectedPoint = { x: -PIN_REACH, y: -PIN_REACH / 2, dx: -1, dy: 0 };
const GATE_INPUT_SECOND: DirectedPoint = { x: -PIN_REACH, y: PIN_REACH / 2, dx: -1, dy: 0 };
const GATE_OUTPUT: DirectedPoint = { x: PIN_REACH, y: 0, dx: 1, dy: 0 };

/** Источник отдаёт сигнал вправо, Индикатор принимает слева. */
const INPUT_LEFT: DirectedPoint = { x: -PIN_REACH, y: 0, dx: -1, dy: 0 };
const OUTPUT_RIGHT: DirectedPoint = { x: PIN_REACH, y: 0, dx: 1, dy: 0 };

/** Порядок выводов в локальных координатах повторяет digitalPinCountOf и digitalPinRole. */
const LOCAL_PINS_BY_KIND: Record<DigitalKind, readonly DirectedPoint[]> = {
  and: [GATE_INPUT_FIRST, GATE_INPUT_SECOND, GATE_OUTPUT],
  or: [GATE_INPUT_FIRST, GATE_INPUT_SECOND, GATE_OUTPUT],
  not: [INPUT_LEFT, OUTPUT_RIGHT],
  button: [OUTPUT_RIGHT],
  indicator: [INPUT_LEFT],
  clock: [OUTPUT_RIGHT],
};

function rotateTimes(point: DirectedPoint, quarterTurns: number): DirectedPoint {
  let rotated = point;
  for (let i = 0; i < quarterTurns; i += 1) rotated = rotate90(rotated);
  return rotated;
}

/** Позиция и направление вывода Компонента на цифровом Холсте. */
export function digitalPinPointOf(component: DigitalComponent, pin: number): DirectedPoint {
  const local = LOCAL_PINS_BY_KIND[component.kind][pin];
  const rotated = rotateTimes(local, component.rotation / 90);
  return { x: component.x + rotated.x, y: component.y + rotated.y, dx: rotated.dx, dy: rotated.dy };
}
