/**
 * Событийный булевый движок М3 (ADR-0002): сигналы строго 0/1. Изменение
 * источника (Кнопка, Генератор) — событие: оно распространяется через
 * Логические элементы до установления, и каждый вывод Холста получает
 * свой уровень. Чистая функция от состояния Холста и момента времени,
 * без DOM и без зависимости от React; интерфейсу достаточно пересчитать
 * её на каждое изменение схемы или тик часов.
 *
 * Элементы — комбинационные: выход — функция входов, вычисляемая до
 * неподвижной точки. Циклы в Палитре М3 не собираются осмысленно
 * (триггеры — за пределами тикета), но свободная сборка их допускает,
 * поэтому число проходов ограничено: схема с генератором не может
 * зависнуть интерфейс.
 */
import { pinKey, type PinRef } from './canvas';
import {
  defaultClockFrequency,
  digitalPinCountOf,
  digitalPinRole,
  type DigitalCanvasState,
  type DigitalComponent,
  type DigitalKind,
} from './digitalCanvas';
import { createUnionFind, type UnionFind } from './unionFind';

/** Строгий сигнал: 0 или 1, третьего не дано. */
export type Bit = 0 | 1;

/**
 * Меандр Генератора: первая половина периода — 1, вторая — 0. Фаза
 * нормализуется и для отрицательного времени: движок остаётся тотальным.
 */
export function clockLevelAt(frequency: number, now: number): Bit {
  const phase = (((now * frequency) % 1) + 1) % 1;
  return phase < 0.5 ? 1 : 0;
}

/** Уровень источника в момент now: Кнопка — нажата ли, Генератор — фаза. */
function sourceLevel(component: DigitalComponent, now: number): Bit {
  if (component.kind === 'clock') {
    return clockLevelAt(component.frequency ?? defaultClockFrequency, now);
  }
  return component.high ? 1 : 0;
}

/** Функция Логического элемента по его входам в порядке выводов. */
const GATE_FUNCTIONS: Partial<Record<DigitalKind, (inputs: readonly Bit[]) => Bit>> = {
  and: ([a, b]) => (a === 1 && b === 1 ? 1 : 0),
  or: ([a, b]) => (a === 1 || b === 1 ? 1 : 0),
  not: ([a]) => (a === 1 ? 0 : 1),
};

/** Предельное число проходов установления: хватает и для глубоких цепочек, и для обрыва циклов. */
const MAX_SETTLE_STEPS = 64;

/**
 * Уровни всех выводов Холста в момент now: словарь по ключу pinKey
 * (componentId:pin) покрывает каждый вывод каждого поставленного
 * Компонента. Неприсоединённый вход читает 0 — упрощение учебного уровня:
 * у настоящих серий микросхем плавающий вход ведёт себя по-разному.
 * Некорректная схема с двумя выходами в одной сети (минуя редьюсер,
 * например из загруженного файла) остаётся определённой: побеждает
 * выход последнего по порядку Компонента.
 *
 * `initial` — уровни выводов с прошлого прогона той же схемы: проверка
 * таблицы истинности триггера переносит состояние от строки к строке,
 * иначе «держит» не отличимо от чистого листа. Сети источников
 * перезаряжаются заново в любом случае — состояния Кнопок между строками
 * меняет сама проверка.
 */
/**
 * Сети цифрового Холста: Провода объединяют выводы, каждый вывод начинает
 * одинокую сеть — неприсоединённые тоже получают уровень. Провод с
 * несуществующим выводом (схема из загруженного файла минуя редьюсер) сеть
 * не объединяет. Общий механизм движка и Диагноза: у сетей один владелец,
 * чтобы определения «что такое сеть» не разошлись.
 */
export function digitalNetsOf(canvas: DigitalCanvasState): UnionFind {
  const componentById = new Map(canvas.components.map((c) => [c.id, c]));
  const nets = createUnionFind();
  for (const component of canvas.components) {
    for (let pin = 0; pin < digitalPinCountOf(component.kind); pin += 1) {
      nets.find(pinKey(component.id, pin));
    }
  }
  const hasPin = (ref: PinRef): boolean => {
    const component = componentById.get(ref.componentId);
    return (
      component !== undefined &&
      Number.isInteger(ref.pin) &&
      ref.pin >= 0 &&
      ref.pin < digitalPinCountOf(component.kind)
    );
  };
  for (const wire of canvas.wires) {
    if (!hasPin(wire.from) || !hasPin(wire.to)) continue;
    nets.union(pinKey(wire.from.componentId, wire.from.pin), pinKey(wire.to.componentId, wire.to.pin));
  }
  return nets;
}

export function evaluateDigital(
  canvas: DigitalCanvasState,
  now: number,
  initial?: ReadonlyMap<string, Bit>,
): ReadonlyMap<string, Bit> {
  const nets = digitalNetsOf(canvas);

  // Начальные уровни: источник водит свою сеть; сеть без источника — 0 или
  // уровень с прошлого прогона.
  const levels = new Map<string, Bit>();
  for (const component of canvas.components) {
    for (let pin = 0; pin < digitalPinCountOf(component.kind); pin += 1) {
      const key = pinKey(component.id, pin);
      const root = nets.find(key);
      if (levels.has(root)) continue;
      levels.set(root, initial?.get(key) ?? 0);
    }
  }
  for (const component of canvas.components) {
    // Вывод 0 — выход только у источников; уровни элементов считает установление.
    if (digitalPinRole(component.kind, 0) !== 'output') continue;
    levels.set(nets.find(pinKey(component.id, 0)), sourceLevel(component, now));
  }

  // Установление: выходы элементов пересчитываются по входам до тишины.
  for (let step = 0; step < MAX_SETTLE_STEPS; step += 1) {
    let changed = false;
    for (const component of canvas.components) {
      const gateFunction = GATE_FUNCTIONS[component.kind];
      if (gateFunction === undefined) continue;
      const inputCount = digitalPinCountOf(component.kind) - 1;
      const inputs: Bit[] = [];
      for (let pin = 0; pin < inputCount; pin += 1) {
        inputs.push(levels.get(nets.find(pinKey(component.id, pin))) ?? 0);
      }
      const outputPin = digitalPinCountOf(component.kind) - 1;
      const level = gateFunction(inputs);
      const outputKey = nets.find(pinKey(component.id, outputPin));
      if (levels.get(outputKey) !== level) {
        levels.set(outputKey, level);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const pins = new Map<string, Bit>();
  for (const component of canvas.components) {
    for (let pin = 0; pin < digitalPinCountOf(component.kind); pin += 1) {
      const key = pinKey(component.id, pin);
      pins.set(key, levels.get(nets.find(key)) ?? 0);
    }
  }
  return pins;
}
