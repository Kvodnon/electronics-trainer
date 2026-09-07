import {
  digitalCanvasReducer,
  emptyDigitalHistory,
  type DigitalCanvasHistory,
  type DigitalCanvasState,
  type DigitalKind,
} from '../domain/digitalCanvas';
import type { PinRef } from '../domain/canvas';

/**
 * Эталон-сборки цифровых схем для тестов: редьюсером Холста, тем же, что
 * собирает схему ученик, поэтому одиночный водитель каждой сети гарантирован.
 * Эталон — не про проверку ученика (ADR-0001), а про доказательство
 * решаемости Заданий и эквивалентности разных топологий.
 */

/** История с поставленными в ряд Компонентами: c1, c2, … */
export function placeDigital(kinds: readonly DigitalKind[]): DigitalCanvasHistory {
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

/** Соединяет выводы Проводом через редьюсер: недопустимое соединение он отклонит. */
export function wireDigital(history: DigitalCanvasHistory, from: PinRef, to: PinRef): DigitalCanvasHistory {
  return digitalCanvasReducer(history, { type: 'wire-drawn', from, to });
}

const pin = (componentId: string, pin: number): PinRef => ({ componentId, pin });

/** Схема из поставленных в ряд Компонентов с Проводами; идентификаторы — c1, c2, … по порядку. */
export function digitalAssembly(
  kinds: readonly DigitalKind[],
  wires: readonly (readonly [from: PinRef, to: PinRef])[],
): DigitalCanvasState {
  let history = placeDigital(kinds);
  for (const [from, to] of wires) history = wireDigital(history, from, to);
  return history.present;
}

/**
 * XOR суммой произведений: a·¬b + ¬a·b. Кнопки c1 (a) и c2 (b) — входы
 * в порядке установки, Индикатор c8 — выход.
 */
export function xorFromSumOfProducts(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'not', 'not', 'and', 'and', 'or', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c2', 0), pin('c4', 0)],
      [pin('c1', 0), pin('c5', 0)],
      [pin('c4', 1), pin('c5', 1)],
      [pin('c2', 0), pin('c6', 0)],
      [pin('c3', 1), pin('c6', 1)],
      [pin('c5', 2), pin('c7', 0)],
      [pin('c6', 2), pin('c7', 1)],
      [pin('c7', 2), pin('c8', 0)],
    ],
  );
}

/** Эквивалентный XOR другой топологии: ¬(a·b)·(a+b) — та же таблица, другая схема. */
export function xorFromProductOfSums(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'and', 'not', 'or', 'and', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c2', 0), pin('c3', 1)],
      [pin('c3', 2), pin('c4', 0)],
      [pin('c1', 0), pin('c5', 0)],
      [pin('c2', 0), pin('c5', 1)],
      [pin('c4', 1), pin('c6', 0)],
      [pin('c5', 2), pin('c6', 1)],
      [pin('c6', 2), pin('c7', 0)],
    ],
  );
}

/**
 * Полусумматор: сумма a⊕b и перенос a·b на двух Индикаторах — c9 (сумма),
 * c10 (перенос).
 */
export function halfAdderFromGates(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'not', 'not', 'and', 'and', 'or', 'and', 'indicator', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c2', 0), pin('c4', 0)],
      [pin('c1', 0), pin('c5', 0)],
      [pin('c4', 1), pin('c5', 1)],
      [pin('c2', 0), pin('c6', 0)],
      [pin('c3', 1), pin('c6', 1)],
      [pin('c5', 2), pin('c7', 0)],
      [pin('c6', 2), pin('c7', 1)],
      [pin('c1', 0), pin('c8', 0)],
      [pin('c2', 0), pin('c8', 1)],
      [pin('c7', 2), pin('c9', 0)],
      [pin('c8', 2), pin('c10', 0)],
    ],
  );
}

/**
 * RS-триггер из двух ИЛИ-НЕ: каждый ИЛИ-НЕ собран из ИЛИ и НЕ, перекрёстные
 * связи замыкают выход одного на вход другого. Входы c1 (R) и c2 (S),
 * выходы c7 (Q) и c8 (НЕ-Q).
 */
export function rsLatchFromNorCompositions(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'or', 'not', 'or', 'not', 'indicator', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c6', 1), pin('c3', 1)],
      [pin('c3', 2), pin('c4', 0)],
      [pin('c2', 0), pin('c5', 0)],
      [pin('c4', 1), pin('c5', 1)],
      [pin('c5', 2), pin('c6', 0)],
      [pin('c4', 1), pin('c7', 0)],
      [pin('c6', 1), pin('c8', 0)],
    ],
  );
}

/** Ловушка: та же пара кнопок, но на выходе элемент И — таблица XOR не сходится. */
export function andGateTrap(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'and', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c2', 0), pin('c3', 1)],
      [pin('c3', 2), pin('c4', 0)],
    ],
  );
}

/** Пара ИЛИ-НЕ без перекрёстных связей: таблицу установки проходит, память не доказывает. */
export function openLoopNorPair(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'or', 'not', 'or', 'not', 'indicator', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c3', 2), pin('c4', 0)],
      [pin('c2', 0), pin('c5', 0)],
      [pin('c5', 2), pin('c6', 0)],
      [pin('c4', 1), pin('c7', 0)],
      [pin('c6', 1), pin('c8', 0)],
    ],
  );
}

/** Сигнал равенства: (a·b) + (¬a·¬b) — единицы на диагонали таблицы. */
export function xnorFromAndOrNot(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'not', 'not', 'and', 'and', 'or', 'indicator'],
    [
      [pin('c1', 0), pin('c3', 0)],
      [pin('c2', 0), pin('c4', 0)],
      [pin('c1', 0), pin('c5', 0)],
      [pin('c2', 0), pin('c5', 1)],
      [pin('c3', 1), pin('c6', 0)],
      [pin('c4', 1), pin('c6', 1)],
      [pin('c5', 2), pin('c7', 0)],
      [pin('c6', 2), pin('c7', 1)],
      [pin('c7', 2), pin('c8', 0)],
    ],
  );
}

/** Мажоритарный «два из трёх»: И на каждую пару входов, пары — через два ИЛИ. */
export function majorityFromAndOr(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'button', 'and', 'and', 'and', 'or', 'or', 'indicator'],
    [
      [pin('c1', 0), pin('c4', 0)],
      [pin('c2', 0), pin('c4', 1)],
      [pin('c1', 0), pin('c5', 0)],
      [pin('c3', 0), pin('c5', 1)],
      [pin('c2', 0), pin('c6', 0)],
      [pin('c3', 0), pin('c6', 1)],
      [pin('c4', 2), pin('c7', 0)],
      [pin('c5', 2), pin('c7', 1)],
      [pin('c6', 2), pin('c8', 0)],
      [pin('c7', 2), pin('c8', 1)],
      [pin('c8', 2), pin('c9', 0)],
    ],
  );
}

/**
 * Полный сумматор: сумма (a⊕b)⊕c из двух каскадных XOR (каждый — sum of
 * products), перенос a·b + (a⊕b)·c. Входы c1 (a), c2 (b), c3 (перенос),
 * выходы c17 (сумма) и c18 (перенос). Со свапнутыми выходами — ловушка на
 * порядок Индикаторов: проверка различает «сумму» и «перенос».
 */
export function fullAdderFromGates(swappedOutputs = false): DigitalCanvasState {
  const canvas = digitalAssembly(
    [
      'button',
      'button',
      'button',
      'not',
      'not',
      'and',
      'and',
      'or',
      'not',
      'not',
      'and',
      'and',
      'or',
      'and',
      'and',
      'or',
      'indicator',
      'indicator',
    ],
    [
      [pin('c1', 0), pin('c4', 0)],
      [pin('c2', 0), pin('c5', 0)],
      [pin('c3', 0), pin('c9', 0)],
      [pin('c1', 0), pin('c6', 0)],
      [pin('c5', 1), pin('c6', 1)],
      [pin('c2', 0), pin('c7', 0)],
      [pin('c4', 1), pin('c7', 1)],
      [pin('c6', 2), pin('c8', 0)],
      [pin('c7', 2), pin('c8', 1)],
      [pin('c8', 2), pin('c10', 0)],
      [pin('c8', 2), pin('c11', 0)],
      [pin('c9', 1), pin('c11', 1)],
      [pin('c10', 1), pin('c12', 0)],
      [pin('c3', 0), pin('c12', 1)],
      [pin('c11', 2), pin('c13', 0)],
      [pin('c12', 2), pin('c13', 1)],
      [pin('c1', 0), pin('c14', 0)],
      [pin('c2', 0), pin('c14', 1)],
      [pin('c8', 2), pin('c15', 0)],
      [pin('c3', 0), pin('c15', 1)],
      [pin('c14', 2), pin('c16', 0)],
      [pin('c15', 2), pin('c16', 1)],
      [pin('c13', 2), pin('c17', 0)],
      [pin('c16', 2), pin('c18', 0)],
    ],
  );
  if (!swappedOutputs) return canvas;
  const swapped = canvas.wires.map((wire) => {
    if (wire.to.componentId === 'c17') return { ...wire, to: { componentId: 'c18', pin: 0 } };
    if (wire.to.componentId === 'c18') return { ...wire, to: { componentId: 'c17', pin: 0 } };
    return wire;
  });
  return { components: canvas.components, wires: swapped };
}

/** Ловушка для «двух из трёх»: каскад ИЛИ голосует за «хотя бы один» — единица уже на одном входе. */
export function orChainMajorityTrap(): DigitalCanvasState {
  return digitalAssembly(
    ['button', 'button', 'button', 'or', 'or', 'indicator'],
    [
      [pin('c1', 0), pin('c4', 0)],
      [pin('c2', 0), pin('c4', 1)],
      [pin('c4', 2), pin('c5', 0)],
      [pin('c3', 0), pin('c5', 1)],
      [pin('c5', 2), pin('c6', 0)],
    ],
  );
}

/** Кнопка в заданном состоянии: состояния входов на строках таблицы назначает проверка. */
export function withButtonLevel(
  canvas: DigitalCanvasState,
  componentId: string,
  high: boolean,
): DigitalCanvasState {
  return {
    components: canvas.components.map((component) =>
      component.id === componentId ? { ...component, high } : component,
    ),
    wires: canvas.wires,
  };
}
