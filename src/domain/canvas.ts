/**
 * Холст домен-слоя: Компоненты, Провода и их история. Чистый TypeScript
 * без DOM и без зависимости от React (см. spec: «редьюсеры состояния Холста»).
 * Термины — по CONTEXT.md: Холст, Палитра, Компонент, Провод.
 */
import { snapPlacement } from './canvasGeometry';

/** Виды Компонентов Палитры М1. Растёт вместе с Модулями (М2+). */
export const componentKinds = [
  'battery',
  'resistor',
  'lamp',
  'switch',
  'pushbutton',
  'motor',
  'diode',
  'led',
  'capacitor',
  'transistor',
  'potentiometer',
  'buzzer',
] as const;

/** Тип выводится из списка: список и тип не могут разойтись. */
export type ComponentKind = (typeof componentKinds)[number];

/** Цвет свечения светодиода: заодно задаёт его прямой порог (у синего он выше). */
export type LedColor = 'red' | 'yellow' | 'green' | 'blue';

/** Все цвета светодиода в порядке карточки Теории. */
export const ledColors: readonly LedColor[] = ['red', 'yellow', 'green', 'blue'];

/** Цвет по умолчанию: постановка из Палитры и показания без явного цвета. */
export const defaultLedColor: LedColor = 'red';

/**
 * Ёмкость конденсатора по умолчанию, Ф: 100 мкФ — учебный номинал, при
 * котором постоянные времени с типовыми резисторами получаются в секундах.
 */
export const defaultCapacitance = 100e-6;

/**
 * Общее сопротивление потенциометра по умолчанию, Ом: 10 кОм — типовой
 * учебный номинал для делителя напряжения.
 */
export const defaultPotentiometerResistance = 10000;

/** Положение движка потенциометра по умолчанию: посередине, делит пополам. */
export const defaultPotentiometerWiper = 0.5;

/** Сопротивление зуммера по умолчанию, Ом — учебный активный звукоизлучатель. */
export const defaultBuzzerResistance = 50;

/** Это цвет свечения светодиода? */
export function isLedColor(value: unknown): value is LedColor {
  return typeof value === 'string' && (ledColors as readonly string[]).includes(value);
}

/** Это вид Компонента Палитры? */
export function isComponentKind(value: unknown): value is ComponentKind {
  return typeof value === 'string' && (componentKinds as readonly string[]).includes(value);
}

/**
 * Число выводов вида: у транзистора — база (0), коллектор (1) и эмиттер (2);
 * у потенциометра — два конца (0 и 2) и движок (1). Остальные — два вывода.
 */
export function pinCountOf(kind: ComponentKind): number {
  return kind === 'transistor' || kind === 'potentiometer' ? 3 : 2;
}

/** Поворот Компонента шагами 90° по часовой стрелке. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Компонент на Холсте: вид из Палитры, центр в координатах сетки, поворот
 * и номиналы. Номинал зависит от вида: батарея — voltage (В);
 * резистор, лампа, мотор, зуммер — resistance (Ом); выключатель и ключ — closed;
 * светодиод — color (цвет свечения и заодно прямой порог); диод и транзистор
 * правимого номинала не имеют; конденсатор — capacitance (Ф);
 * потенциометр — resistance (общее) и wiper (движок, доля от 0 до 1 между
 * выводом 0 и движком).
 */
export interface PlacedComponent {
  readonly id: string;
  readonly kind: ComponentKind;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
  readonly voltage?: number;
  readonly resistance?: number;
  readonly closed?: boolean;
  readonly color?: LedColor;
  readonly capacitance?: number;
  readonly wiper?: number;
}

/** Ссылка на вывод Компонента: идентификатор и номер вывода. */
export interface PinRef {
  readonly componentId: string;
  readonly pin: number;
}

/** Ключ вывода в словарях домена: один формат для Симулятора, Диагнозов и оверлея. */
export function pinKey(componentId: string, pin: number): string {
  return `${componentId}:${pin}`;
}

/** Провод: соединение двух выводов Компонентов. */
export interface Wire {
  readonly id: string;
  readonly from: PinRef;
  readonly to: PinRef;
}

/** Состояние Холста: поставленные Компоненты и протянутые Провода. */
export interface CanvasState {
  readonly components: readonly PlacedComponent[];
  readonly wires: readonly Wire[];
}

/** Пустой Холст. */
export const emptyCanvas: CanvasState = { components: [], wires: [] };

/**
 * Действие редактора Холста. Идентификаторы новых Компонентов и Проводов
 * назначает редьюсер — действия остаются чистыми данными.
 */
export type CanvasAction =
  | { readonly type: 'component-placed'; readonly kind: ComponentKind; readonly x: number; readonly y: number }
  | { readonly type: 'component-moved'; readonly componentId: string; readonly x: number; readonly y: number }
  | { readonly type: 'component-rotated'; readonly componentId: string }
  | { readonly type: 'component-removed'; readonly componentId: string }
  | { readonly type: 'component-value-set'; readonly componentId: string; readonly patch: ComponentValuePatch }
  | { readonly type: 'wire-drawn'; readonly from: PinRef; readonly to: PinRef }
  | { readonly type: 'wire-removed'; readonly wireId: string }
  | { readonly type: 'canvas-loaded'; readonly canvas: CanvasState }
  | { readonly type: 'canvas-reset' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' };

/** Правка номинала Компонента: меняются только переданные поля. */
export interface ComponentValuePatch {
  readonly voltage?: number;
  readonly resistance?: number;
  readonly closed?: boolean;
  readonly color?: LedColor;
  readonly capacitance?: number;
  readonly wiper?: number;
}

/** История Холста: undo/redo — часть состояния, редьюсер остаётся чистым. */
export interface CanvasHistory {
  readonly past: readonly CanvasState[];
  readonly present: CanvasState;
  readonly future: readonly CanvasState[];
}

/** История пустого Холста. */
export const emptyHistory: CanvasHistory = { past: [], present: emptyCanvas, future: [] };

/** Номиналы Компонента по умолчанию при постановке из Палитры. */
const DEFAULT_VALUES: Record<ComponentKind, Omit<PlacedComponent, 'id' | 'kind' | 'x' | 'y' | 'rotation'>> = {
  battery: { voltage: 9 },
  resistor: { resistance: 1000 },
  lamp: { resistance: 120 },
  switch: { closed: false },
  pushbutton: { closed: false },
  motor: { resistance: 50 },
  diode: {},
  led: { color: 'red' },
  capacitor: { capacitance: defaultCapacitance },
  transistor: {},
  potentiometer: { resistance: defaultPotentiometerResistance, wiper: defaultPotentiometerWiper },
  buzzer: { resistance: defaultBuzzerResistance },
};

/** Какое номинальное поле носит вид Компонента. */
export type ValueField = 'voltage' | 'resistance' | 'closed' | 'color' | 'capacitance' | 'none';

const VALUE_FIELD: Record<ComponentKind, ValueField> = {
  battery: 'voltage',
  resistor: 'resistance',
  lamp: 'resistance',
  motor: 'resistance',
  switch: 'closed',
  pushbutton: 'closed',
  diode: 'none',
  led: 'color',
  capacitor: 'capacitance',
  transistor: 'none',
  potentiometer: 'resistance',
  buzzer: 'resistance',
};

/** Поле номинала вида: батарея — напряжение, резистор/лампа/мотор — сопротивление, коммутаторы — состояние. */
export function valueFieldOf(kind: ComponentKind): ValueField {
  return VALUE_FIELD[kind];
}

/** Номиналы вида по умолчанию — для предпросмотра в Палитре. */
export function defaultValuesOf(
  kind: ComponentKind,
): Omit<PlacedComponent, 'id' | 'kind' | 'x' | 'y' | 'rotation'> {
  return DEFAULT_VALUES[kind];
}

/**
 * Свободное место для Компонента по клику в Палитре: построчный обход
 * Холста, первая позиция без соседей в радиусе ~габарита символа.
 * Аналоговому и цифровому Холстам нужна одна раскладка, поэтому параметр —
 * минимальная форма состояния (только позиции Компонентов).
 */
export function suggestPlacementPosition(canvas: {
  readonly components: readonly { readonly x: number; readonly y: number }[];
}): { x: number; y: number } {
  const occupied = (x: number, y: number) =>
    canvas.components.some((c) => Math.abs(c.x - x) < 110 && Math.abs(c.y - y) < 90);
  for (let y = 100; y <= 480; y += 120) {
    for (let x = 100; x <= 720; x += 120) {
      if (!occupied(x, y)) return { x, y };
    }
  }
  // Всё заставлено — кладём в первый угол, поверх (ученик подвинет)
  return { x: 100, y: 100 };
}

/** Следующий свободный идентификатор вида «c1», «w2»: максимум среди занятых. */
export function nextId(prefix: string, taken: readonly string[]): string {
  let max = 0;
  for (const id of taken) {
    if (id.startsWith(prefix)) {
      const number = Number(id.slice(prefix.length));
      if (Number.isFinite(number) && number > max) max = number;
    }
  }
  return `${prefix}${max + 1}`;
}

/** Это один и тот же вывод? */
export function samePin(a: PinRef, b: PinRef): boolean {
  return a.componentId === b.componentId && a.pin === b.pin;
}

function isValidPin(component: PlacedComponent, pin: number): boolean {
  return Number.isInteger(pin) && pin >= 0 && pin < pinCountOf(component.kind);
}

/** Следующий поворот шагами 90° по часовой стрелке. */
export function nextRotation(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/** Редьюсер Холста: чистая функция переходов редактора с историей undo/redo. */
export function canvasReducer(history: CanvasHistory, action: CanvasAction): CanvasHistory {
  switch (action.type) {
    case 'component-placed': {
      const component: PlacedComponent = {
        id: nextId('c', history.present.components.map((c) => c.id)),
        kind: action.kind,
        ...snapPlacement({ x: action.x, y: action.y }),
        rotation: 0,
        ...DEFAULT_VALUES[action.kind],
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
      // Проводы удалённого Компонента уходят вместе с ним
      const wires = state.wires.filter(
        (wire) => wire.from.componentId !== action.componentId && wire.to.componentId !== action.componentId,
      );
      return withHistory(history, { components, wires });
    }
    case 'wire-removed': {
      const state = history.present;
      const wires = state.wires.filter((w) => w.id !== action.wireId);
      if (wires.length === state.wires.length) return history;
      return withHistory(history, { components: state.components, wires });
    }
    case 'wire-drawn': {
      const state = history.present;
      const from = state.components.find((c) => c.id === action.from.componentId);
      const to = state.components.find((c) => c.id === action.to.componentId);
      // Выводы должны существовать и различаться.
      if (!from || !to) return history;
      if (!isValidPin(from, action.from.pin) || !isValidPin(to, action.to.pin)) return history;
      if (samePin(action.from, action.to)) return history;
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
    case 'canvas-loaded':
      // Загрузка сохранённой схемы — новый сеанс правки: прежний черновик
      // из истории undo не возвращается.
      return emptyHistoryOf(action.canvas);
    case 'canvas-reset':
      return withHistory(history, emptyCanvas);
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

/**
 * Правка номинала: остаётся только поле своего вида (лампа не «напрягается»
 * чужим напряжением) и только конечное положительное число — обрыв цепи
 * рисуется удалением Компонента, а не нулевым сопротивлением. Некорректная
 * правка отклоняется целиком. У потенциометра два поля: сопротивление
 * и движок (доля от 0 до 1), правятся и вместе, и по отдельности.
 */
function applicableValuePatch(
  kind: ComponentKind,
  patch: ComponentValuePatch,
): ComponentValuePatch | null {
  switch (VALUE_FIELD[kind]) {
    case 'voltage':
      return patch.voltage !== undefined && isPositiveNumber(patch.voltage)
        ? { voltage: patch.voltage }
        : null;
    case 'resistance':
      return kind === 'potentiometer'
        ? potentiometerPatch(patch)
        : patch.resistance !== undefined && isPositiveNumber(patch.resistance)
          ? { resistance: patch.resistance }
          : null;
    case 'closed':
      return patch.closed !== undefined ? { closed: patch.closed } : null;
    case 'color':
      return patch.color !== undefined && isLedColor(patch.color) ? { color: patch.color } : null;
    case 'capacitance':
      return patch.capacitance !== undefined && isPositiveNumber(patch.capacitance)
        ? { capacitance: patch.capacitance }
        : null;
    case 'none':
      // у диода и транзистора нет правимого номинала — правка отклоняется целиком
      return null;
  }
}

/** Правка потенциометра: сопротивление и/или положение движка. */
function potentiometerPatch(patch: ComponentValuePatch): ComponentValuePatch | null {
  const resistance =
    patch.resistance !== undefined
      ? isPositiveNumber(patch.resistance)
        ? { resistance: patch.resistance }
        : null
      : {};
  const wiper =
    patch.wiper !== undefined ? (isWiperValue(patch.wiper) ? { wiper: patch.wiper } : null) : {};
  if (resistance === null || wiper === null) return null;
  return Object.keys(resistance).length + Object.keys(wiper).length > 0
    ? { ...resistance, ...wiper }
    : null;
}

/** Положение движка: доля от 0 (у вывода 0) до 1 (у вывода 2). */
function isWiperValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Обновляет один Компонент и записывает результат в историю.
 * Неизвестный идентификатор — состояние не меняется вовсе (то же сравнение).
 */
function withUpdatedComponent(
  history: CanvasHistory,
  componentId: string,
  update: (component: PlacedComponent) => PlacedComponent,
): CanvasHistory {
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

function withHistory(history: CanvasHistory, present: CanvasState): CanvasHistory {
  return {
    past: [...history.past, history.present],
    present,
    future: [],
  };
}

function emptyHistoryOf(present: CanvasState): CanvasHistory {
  return { past: [], present, future: [] };
}
