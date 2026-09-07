/**
 * Цифровой Холст М3: Логические элементы И/ИЛИ/НЕ, Кнопка, Индикатор и
 * Тактовый генератор, их редьюсер с историей undo/redo. Чистый TypeScript
 * без DOM и без зависимости от React (spec: «редьюсеры состояния Холста»).
 * С аналоговым Холстом делятся только геометрия и UI-слой (ADR-0002).
 *
 * Контракт соединения домена: Провод соединяет выход с входом, и в каждой
 * сети после соединения остаётся ровно один выход — булева алгебра не
 * описывает «спор» двух выходов на одном Проводе, поэтому такое соединение
 * редьюсер отклоняет, а не разрешает.
 */
import {
  nextId,
  nextRotation,
  pinKey,
  samePin,
  type PinRef,
  type Rotation,
  type Wire,
} from './canvas';
import { snapPlacement } from './canvasGeometry';
import { createUnionFind } from './unionFind';

/** Виды Компонентов цифрового Холста. */
export const digitalComponentKinds = ['and', 'or', 'not', 'button', 'indicator', 'clock'] as const;

/** Тип выводится из списка: список и тип не могут разойтись. */
export type DigitalKind = (typeof digitalComponentKinds)[number];

/** Это вид Компонента цифрового Холста? Бросок из Палитры приходит строкой. */
export function isDigitalKind(value: unknown): value is DigitalKind {
  return typeof value === 'string' && (digitalComponentKinds as readonly string[]).includes(value);
}

/**
 * Границы частоты Тактового генератора, Гц: ниже 0,5 такт теряет смысл
 * «тикающего» сигнала, выше 20 — глаз не различает состояния.
 */
export const clockFrequencyBounds = { min: 0.5, max: 20 } as const;

/** Частота генератора по умолчанию, Гц: 2 такта в секунду — видно глазу. */
export const defaultClockFrequency = 2;

/**
 * Число выводов вида: у И и ИЛИ — вход 0, вход 1 и выход 2; у НЕ — вход 0
 * и выход 1; у Кнопки и Генератора — выход; у Индикатора — вход.
 */
export function digitalPinCountOf(kind: DigitalKind): number {
  return kind === 'and' || kind === 'or' ? 3 : kind === 'not' ? 2 : 1;
}

/** Роль вывода: вход читает уровень сети, выход его задаёт. */
export type PinRole = 'input' | 'output';

/** Роль вывода вида — раскладка ролей повторяет digitalPinCountOf. */
export function digitalPinRole(kind: DigitalKind, pin: number): PinRole {
  switch (kind) {
    case 'and':
    case 'or':
      return pin === 2 ? 'output' : 'input';
    case 'not':
      return pin === 1 ? 'output' : 'input';
    case 'indicator':
      return 'input';
    case 'button':
    case 'clock':
      return 'output';
  }
}

/**
 * Компонент цифрового Холста. Правимое поле одно на вид: Кнопка — high
 * (нажата ли), Генератор — frequency (Гц); у элементов и Индикатора
 * правимого номинала нет.
 */
export interface DigitalComponent {
  readonly id: string;
  readonly kind: DigitalKind;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly high?: boolean;
  readonly frequency?: number;
}

/** Состояние цифрового Холста: Компоненты и Провода. */
export interface DigitalCanvasState {
  readonly components: readonly DigitalComponent[];
  readonly wires: readonly Wire[];
}

/** Пустой цифровой Холст. */
export const emptyDigitalCanvas: DigitalCanvasState = { components: [], wires: [] };

/**
 * Действие редактора цифрового Холста. Идентификаторы новых Компонентов и
 * Проводов назначает редьюсер — действия остаются чистыми данными.
 */
export type DigitalCanvasAction =
  | { readonly type: 'component-placed'; readonly kind: DigitalKind; readonly x: number; readonly y: number }
  | { readonly type: 'component-moved'; readonly componentId: string; readonly x: number; readonly y: number }
  | { readonly type: 'component-rotated'; readonly componentId: string }
  | { readonly type: 'component-removed'; readonly componentId: string }
  | { readonly type: 'component-value-set'; readonly componentId: string; readonly patch: DigitalValuePatch }
  | { readonly type: 'wire-drawn'; readonly from: PinRef; readonly to: PinRef }
  | { readonly type: 'wire-removed'; readonly wireId: string }
  | { readonly type: 'canvas-loaded'; readonly canvas: DigitalCanvasState }
  | { readonly type: 'canvas-reset' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

/** Правка номинала: меняются только переданные поля. */
export interface DigitalValuePatch {
  readonly high?: boolean;
  readonly frequency?: number;
}

/** История Холста: undo/redo — часть состояния, редьюсер остаётся чистым. */
export interface DigitalCanvasHistory {
  readonly past: readonly DigitalCanvasState[];
  readonly present: DigitalCanvasState;
  readonly future: readonly DigitalCanvasState[];
}

/** История пустого цифрового Холста. */
export const emptyDigitalHistory: DigitalCanvasHistory = { past: [], present: emptyDigitalCanvas, future: [] };

/** Демо-схема «Свободная сборка»: генератор и кнопка через И и НЕ на два Индикатора. */
export function demoDigitalCanvas(): DigitalCanvasState {
  const components: DigitalComponent[] = [
    { id: 'c1', kind: 'clock', x: 100, y: 140, rotation: 0, frequency: defaultClockFrequency },
    { id: 'c2', kind: 'button', x: 100, y: 320, rotation: 0, high: false },
    { id: 'c3', kind: 'and', x: 300, y: 160, rotation: 0 },
    { id: 'c4', kind: 'not', x: 300, y: 320, rotation: 0 },
    { id: 'c5', kind: 'indicator', x: 500, y: 160, rotation: 0 },
    { id: 'c6', kind: 'indicator', x: 500, y: 320, rotation: 0 },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { componentId: 'c1', pin: 0 }, to: { componentId: 'c3', pin: 0 } },
    { id: 'w2', from: { componentId: 'c2', pin: 0 }, to: { componentId: 'c3', pin: 1 } },
    { id: 'w3', from: { componentId: 'c2', pin: 0 }, to: { componentId: 'c4', pin: 0 } },
    { id: 'w4', from: { componentId: 'c3', pin: 2 }, to: { componentId: 'c5', pin: 0 } },
    { id: 'w5', from: { componentId: 'c4', pin: 1 }, to: { componentId: 'c6', pin: 0 } },
  ];
  return { components, wires };
}

/** Редьюсер цифрового Холста: чистая функция переходов редактора с историей. */
export function digitalCanvasReducer(
  history: DigitalCanvasHistory,
  action: DigitalCanvasAction,
): DigitalCanvasHistory {
  switch (action.type) {
    case 'component-placed': {
      const component: DigitalComponent = {
        id: nextId('c', history.present.components.map((c) => c.id)),
        kind: action.kind,
        ...snapPlacement({ x: action.x, y: action.y }),
        rotation: 0,
        ...(action.kind === 'clock'
          ? { frequency: defaultClockFrequency }
          : action.kind === 'button'
            ? { high: false }
            : {}),
      };
      return withHistory(history, {
        components: [...history.present.components, component],
        wires: history.present.wires,
      });
    }
    case 'component-moved':
      return withUpdatedComponent(history, action.componentId, (component) => ({
        ...component,
        ...snapPlacement({ x: action.x, y: action.y }),
      }));
    case 'component-rotated':
      return withUpdatedComponent(history, action.componentId, (component) => ({
        ...component,
        rotation: nextRotation(component.rotation),
      }));
    case 'component-removed': {
      const state = history.present;
      const components = state.components.filter((c) => c.id !== action.componentId);
      if (components.length === state.components.length) return history;
      const wires = state.wires.filter(
        (wire) => wire.from.componentId !== action.componentId && wire.to.componentId !== action.componentId,
      );
      return withHistory(history, { components, wires });
    }
    case 'component-value-set': {
      const component = history.present.components.find((c) => c.id === action.componentId);
      if (!component) return history;
      const patch = applicableValuePatch(component.kind, action.patch);
      if (!patch) return history;
      return withUpdatedComponent(history, action.componentId, (current) => ({
        ...current,
        ...patch,
      }));
    }
    case 'wire-drawn': {
      const state = history.present;
      const from = state.components.find((c) => c.id === action.from.componentId);
      const to = state.components.find((c) => c.id === action.to.componentId);
      if (!from || !to) return history;
      if (!isValidPin(from, action.from.pin) || !isValidPin(to, action.to.pin)) return history;
      if (samePin(action.from, action.to)) return history;
      if (!hasSingleDriver(state, action.from, action.to)) return history;
      // Тот же переход уже соединён — второй Провод не нужен.
      const already = state.wires.some(
        (wire) =>
          (samePin(wire.from, action.from) && samePin(wire.to, action.to)) ||
          (samePin(wire.from, action.to) && samePin(wire.to, action.from)),
      );
      if (already) return history;
      const wire: Wire = {
        id: nextId('w', state.wires.map((w) => w.id)),
        from: action.from,
        to: action.to,
      };
      return withHistory(history, { components: state.components, wires: [...state.wires, wire] });
    }
    case 'wire-removed': {
      const state = history.present;
      const wires = state.wires.filter((w) => w.id !== action.wireId);
      if (wires.length === state.wires.length) return history;
      return withHistory(history, { components: state.components, wires });
    }
    case 'canvas-loaded':
      // Загрузка схемы — новый сеанс правки: прежний черновик из истории undo
      // не возвращается.
      return emptyHistoryOf(action.canvas);
    case 'canvas-reset':
      return withHistory(history, emptyDigitalCanvas);
    case 'undo': {
      if (history.past.length === 0) return history;
      const previous = history.past[history.past.length - 1];
      return {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      };
    }
    case 'redo': {
      if (history.future.length === 0) return history;
      const [next, ...rest] = history.future;
      return {
        past: [...history.past, history.present],
        present: next,
        future: rest,
      };
    }
  }
}

/** Правка номинала: остаётся только поле своего вида, некорректная отклоняется целиком. */
function applicableValuePatch(
  kind: DigitalKind,
  patch: DigitalValuePatch,
): DigitalValuePatch | null {
  switch (kind) {
    case 'button':
      return patch.high !== undefined ? { high: patch.high } : null;
    case 'clock':
      return patch.frequency !== undefined && isValidFrequency(patch.frequency)
        ? { frequency: patch.frequency }
        : null;
    case 'and':
    case 'or':
    case 'not':
    case 'indicator':
      return null;
  }
}

/** Частота генератора: конечное число в границах clockFrequencyBounds. */
export function isValidFrequency(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= clockFrequencyBounds.min &&
    value <= clockFrequencyBounds.max
  );
}

/**
 * Сеть после добавления Провода содержит ровно один выход: соединение
 * выход-выход, вход-вход без водителя или второй выход в уже занятую сеть —
 * всё отклоняется. Вход-вход рядом с чужой сетью допустим: так вход
 * присоединяется к уже существующей сети (разветвление выхода).
 */
function hasSingleDriver(state: DigitalCanvasState, from: PinRef, to: PinRef): boolean {
  const componentById = new Map(state.components.map((c) => [c.id, c]));
  const keyOf = (ref: PinRef): string => pinKey(ref.componentId, ref.pin);
  // Существование обоих выводов уже проверено редьюсером до этого вызова,
  // поэтому ключи концов считаются без валидации.
  const nets = createUnionFind();
  for (const wire of state.wires) nets.union(keyOf(wire.from), keyOf(wire.to));

  // Объединение сетей концов: все Провода, попавшие в сеть from или to,
  // вносят оба своих конца.
  const rootFrom = nets.find(keyOf(from));
  const rootTo = nets.find(keyOf(to));
  const merged = new Map<string, PinRef>([
    [keyOf(from), from],
    [keyOf(to), to],
  ]);
  for (const wire of state.wires) {
    for (const end of [wire.from, wire.to]) {
      const root = nets.find(keyOf(end));
      if (root === rootFrom || root === rootTo) {
        merged.set(keyOf(wire.from), wire.from);
        merged.set(keyOf(wire.to), wire.to);
      }
    }
  }

  let drivers = 0;
  for (const ref of merged.values()) {
    const component = componentById.get(ref.componentId)!;
    if (digitalPinRole(component.kind, ref.pin) === 'output') drivers += 1;
  }
  return drivers === 1;
}

function isValidPin(component: DigitalComponent, pin: number): boolean {
  return Number.isInteger(pin) && pin >= 0 && pin < digitalPinCountOf(component.kind);
}

/**
 * Обновляет один Компонент и записывает результат в историю.
 * Неизвестный идентификатор — состояние не меняется вовсе (то же сравнение).
 */
function withUpdatedComponent(
  history: DigitalCanvasHistory,
  componentId: string,
  update: (component: DigitalComponent) => DigitalComponent,
): DigitalCanvasHistory {
  const state = history.present;
  let updated = false;
  const components = state.components.map((component) => {
    if (component.id !== componentId) return component;
    updated = true;
    return update(component);
  });
  if (!updated) return history;
  return withHistory(history, { components, wires: state.wires });
}

function withHistory(history: DigitalCanvasHistory, present: DigitalCanvasState): DigitalCanvasHistory {
  return {
    past: [...history.past, history.present],
    present,
    future: [],
  };
}

function emptyHistoryOf(present: DigitalCanvasState): DigitalCanvasHistory {
  return { past: [], present, future: [] };
}
