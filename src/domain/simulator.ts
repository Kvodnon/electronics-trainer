/**
 * Симулятор — аналоговый решатель постоянного тока (ADR-0001). Модифицированный
 * метод узловых потенциалов: Провода объединяют выводы в узлы, каждый Компонент
 * даёт ветвь между узлами своих выводов. Чистый TypeScript без DOM.
 *
 * Поведенческие модели М1 (учебные, см. spec: Implementation Decisions):
 * - батарея — ЭДС с внутренним сопротивлением: эквивалент Нортона, поэтому
 *   короткое замыкание даёт конечный ток ЭДС/r, а не сингулярную матрицу;
 * - резистор, лампочка, моторчик, зуммер — линейные резистивные; активность
 *   лампочек и моторчиков определяется мощностью (пороги срабатывания),
 *   зуммера — током (порог звучания);
 * - выключатель и ключ — замкнутый контакт с малым, разомкнутый с огромным
 *   сопротивлением: обрыв честно даёт ток ≈ 0, не ломая решение.
 *
 * Нелинейные модели М2: диод и светодиод — кусочно-линейные с прямым порогом.
 * Проводящее состояние — ЭДС порога с малым последовательным сопротивлением
 * (эквивалент Нортона, как у батареи); запертое — обрыв. Состояние каждого
 * диода угадывается итеративно: схема решается, состояния корректируются, пока
 * не перестанут меняться. Транзистор NPN — та же итеративная схема для трёх
 * режимов ключа: отсечка (обрыв), активный режим (источник тока β·Iб) и
 * насыщение (ЭДС V_кэ нас с малым сопротивлением).
 *
 * Три вывода (тикет 15): транзистор (база—эмиттер, коллектор—эмиттер) и
 * потенциометр (два плеча вокруг движка) дают Компоненту две ветви. Показание
 * Компонента при этом одно (у транзистора — коллекторный ток и V_кэ), а токи
 * по выводам — pinCurrents, «уходящие» из каждого вывода во внешнюю цепь.
 *
 * Конденсатор (тикет 14): для постоянного тока — разрыв, поэтому в обычном
 * решении его ветвь разомкнута, а всё установившееся напряжение остаётся
 * на нём. Переходный режим (`solveTransient`) решает схему шагами во времени,
 * подменяя конденсатор компаньоном интегрирования через DcSolveOptions.
 */
import {
  defaultCapacitance,
  defaultLedColor,
  defaultPotentiometerWiper,
  pinKey,
  type CanvasState,
  type ComponentKind,
  type LedColor,
  type PlacedComponent,
} from './canvas';

/** Внутреннее сопротивление батареи, Ом (поведенческая модель М1). */
export const BATTERY_INTERNAL_RESISTANCE = 0.1;
/** Замкнутый контакт выключателя/ключа, Ом. */
export const CLOSED_CONTACT_RESISTANCE = 1e-3;
/** Разомкнутый контакт, Ом: обрыв без вырождения матрицы. */
export const OPEN_CONTACT_RESISTANCE = 1e9;
/** Порог мощности накала лампочки, Вт. */
export const LAMP_LIT_POWER = 0.02;
/** Мощность полного накала лампочки, Вт: выше — яркость насыщается. */
export const LAMP_FULL_POWER = 0.5;
/** Порог мощности вращения моторчика, Вт. */
export const MOTOR_SPIN_POWER = 0.05;
/** Прямой порог кремниевого диода, В. */
export const DIODE_FORWARD_VOLTAGE = 0.7;
/** Последовательное сопротивление проводящего диода, Ом (поведенческая модель). */
export const DIODE_ON_RESISTANCE = 8;
/** Прямой порог светодиода по цвету свечения, В. */
export const LED_FORWARD_VOLTAGE: Record<LedColor, number> = { red: 1.8, yellow: 2.0, green: 2.2, blue: 3.0 };
/** Предельный постоянный ток светодиода, А: выше — Диагноз «превышение тока». */
export const LED_MAX_CURRENT = 0.02;
/** Порог зажигания светодиода, А: ниже свечения глазу не видно. */
export const LED_LIT_CURRENT = 0.001;
/** Ток полного накала светодиода, А: выше — яркость насыщается. */
export const LED_FULL_CURRENT = 0.02;
/** Прямой порог перехода база—эмиттер транзистора, В. */
export const TRANSISTOR_V_BE_ON = 0.7;
/** Сопротивление открытого перехода база—эмиттер, Ом (поведенческая модель). */
export const TRANSISTOR_R_BE = 8;
/** Коэффициент передачи тока транзистора (учебная модель ключа). */
export const TRANSISTOR_BETA = 100;
/** Напряжение коллектор—эмиттер в насыщении, В. */
export const TRANSISTOR_V_CE_SAT = 0.2;
/** Сопротивление насыщенного перехода коллектор—эмиттер, Ом. */
export const TRANSISTOR_R_CE_SAT = 2;
/**
 * Выходное сопротивление активного транзистора, Ом: параллельно источнику
 * тока β·Iб — держит матрицу невырожденной, на учебные токи не влияет.
 */
export const TRANSISTOR_ACTIVE_RESISTANCE = 1e6;
/** Ток базы, ниже которого транзистор считается закрытым, А (пыль утечек). */
export const TRANSISTOR_MIN_BASE_CURRENT = 1e-6;
/** Порог тока звучания зуммера, А: ниже — молчит. */
export const BUZZER_SOUND_CURRENT = 0.01;
/** Защита от колебаний перебора состояний диодов в одном острове. */
const MAX_DIODE_ITERATIONS = 50;

/**
 * Состояние конденсатора-компаньона: напряжение (В) и ток (А, знак — от
 * вывода 0 к выводу 1) на предыдущем шаге интегрирования.
 */
export interface CapacitorState {
  readonly voltage: number;
  readonly current: number;
}

/**
 * Переопределения моделей для переходного режима. Обычное решение solveDc
 * (без опций) не меняется: конденсатор — разрыв, коммутаторы — как нарисованы.
 */
export interface DcSolveOptions {
  /** Состояние коммутаторов: id → замкнут? Нет записи — нарисованное состояние. */
  readonly contactStates?: ReadonlyMap<string, boolean>;
  /**
   * Состояние конденсаторов: id → напряжение и ток шага. Задано — конденсатор
   * решается компаньоном трапецеидального интегрирования (как батарея с ЭДС
   * v + i·Δt/2C и сопротивлением Δt/2C).
   */
  readonly capacitorStates?: ReadonlyMap<string, CapacitorState>;
  /** Шаг интегрирования, с — вместе с ёмкостью задаёт компаньона. */
  readonly timeStep?: number;
  /**
   * Проба Thevenin: конденсатор с этим id заменяется источником тока 1 А,
   * источники ЭДС гасятся — напряжение на пробе численно равно сопротивлению
   * цепи между его выводами (Ом на ампер).
   */
  readonly theveninProbeOf?: string;
}

/** Ток пробы Thevenin, А. */
const THEVENIN_PROBE_CURRENT = 1;
/** Напряжение на конденсаторе-компаньоне, ниже которого остров не «живой». */
const ENERGIZED_VOLTAGE = 1e-9;

/** Сопротивление компаньона конденсатора на шаге интегрирования, Ом (Δt/2C). */
function companionResistance(timeStep: number, capacitance: number): number {
  return timeStep / (2 * capacitance);
}

/**
 * Показание Симулятора для одного Компонента. Знаки: напряжение — вывод 0
 * минус вывод 1 (у батареи это напряжение на зажимах); ток — у батареи из
 * «плюса» (вывод 0) во внешнюю цепь, у остальных от вывода 0 к выводу 1;
 * мощность — рассеиваемая у резистивных, отдаваемая у батареи (Вт).
 * У трёхвыводных Компонентов (транзистор, потенциометр) ток и напряжение —
 * главные величины модели (у транзистора — коллекторные, у потенциометра —
 * через вывод 0 насквозь); токи каждого вывода во внешнюю цепь — pinCurrents.
 */
export interface ComponentReading {
  readonly componentId: string;
  readonly kind: ComponentKind;
  readonly current: number;
  readonly voltage: number;
  readonly power: number;
  /** Токи, уходящие из каждого вывода Компонента во внешнюю цепь, А. */
  readonly pinCurrents: readonly number[];
}

/** Решение схемы постоянного тока: показание на каждый Компонент Холста. */
export interface DcSolution {
  readonly readings: readonly ComponentReading[];
  /**
   * Узел каждого вывода (ключ — pinKey): потенциал в вольтах относительно
   * земли своего острова и имя острова. Для Мультиметра: напряжение между
   * любыми двумя точками схемы; щупы разных островов общей цепи не имеют.
   */
  readonly pinNodes: ReadonlyMap<string, PinNode>;
}

/** Узел вывода: имя острова и потенциал (В) относительно земли острова. */
export interface PinNode {
  readonly island: string;
  readonly voltage: number;
}

/** Показание Компонента по идентификатору; нет такого — null. */
export function readingOf(solution: DcSolution, componentId: string): ComponentReading | null {
  return solution.readings.find((reading) => reading.componentId === componentId) ?? null;
}

/** Показания всех Компонентов указанного вида. */
export function readingsOfKind(solution: DcSolution, kind: ComponentKind): readonly ComponentReading[] {
  return solution.readings.filter((reading) => reading.kind === kind);
}

/** Показания по идентификатору Компонента — для живого поведения и оверлея. */
export function readingsByComponent(solution: DcSolution): ReadonlyMap<string, ComponentReading> {
  return new Map(solution.readings.map((reading) => [reading.componentId, reading]));
}

/**
 * Показание Провода для оверлея токов: Провод — часть узла Симулятора, его ток
 * восстанавливается по ветви Компонента на конце Провода. Это честно, только
 * когда на каждом из двух выводов висит единственный Провод: при параллельных
 * Проводах одного вывода ток между ними не определяется — значение null.
 */
export interface WireCurrent {
  readonly wireId: string;
  /** Ток Провода, А; null — ток не определяется (Провод параллелит вывод). */
  readonly current: number | null;
}

export function wireCurrents(canvas: CanvasState, solution: DcSolution): readonly WireCurrent[] {
  const wiresPerPin = new Map<string, number>();
  const touch = (ref: { readonly componentId: string; readonly pin: number }): void => {
    const key = pinKey(ref.componentId, ref.pin);
    wiresPerPin.set(key, (wiresPerPin.get(key) ?? 0) + 1);
  };
  for (const wire of canvas.wires) {
    touch(wire.from);
    touch(wire.to);
  }

  return canvas.wires.map((wire) => {
    const alone = (ref: { readonly componentId: string; readonly pin: number }): boolean =>
      wiresPerPin.get(pinKey(ref.componentId, ref.pin)) === 1;
    const component = canvas.components.find((candidate) => candidate.id === wire.from.componentId);
    if (component === undefined || !alone(wire.from) || !alone(wire.to)) {
      return { wireId: wire.id, current: null };
    }
    const reading = solution.readings.find((candidate) => candidate.componentId === wire.from.componentId);
    if (reading === undefined) return { wireId: wire.id, current: null };
    // Ток Провода = ток, уходящий из вывода Компонента во внешнюю цепь:
    // у батареи из «плюса» наружу, у остальных — из конца ветви, у
    // трёхвыводных — свой ток каждого вывода (pinCurrents).
    return { wireId: wire.id, current: reading.pinCurrents[wire.from.pin] ?? null };
  });
}

/** Лампочка горит: мощность не ниже порога срабатывания. */
export function isLampLit(reading: ComponentReading): boolean {
  return reading.power >= LAMP_LIT_POWER;
}

/**
 * Яркость лампочки от 0 до 1: живое поведение Холста. Ниже порога накала — 0,
 * дальше растёт с мощностью и насыщается при полном накале.
 */
export function lampBrightness(reading: ComponentReading): number {
  if (reading.power < LAMP_LIT_POWER) return 0;
  return Math.min(1, reading.power / LAMP_FULL_POWER);
}

/** Моторчик крутится: мощность не ниже порога срабатывания. */
export function isMotorSpinning(reading: ComponentReading): boolean {
  return reading.power >= MOTOR_SPIN_POWER;
}

/** Светодиод светится: прямой ток не ниже порога зажигания (обратный ток не светит). */
export function isLedLit(reading: ComponentReading): boolean {
  return reading.current >= LED_LIT_CURRENT;
}

/**
 * Яркость светодиода от 0 до 1: живое поведение Холста. Считается по прямому
 * току: ниже порога зажигания — 0, дальше растёт с током и насыщается при
 * полном накале. У запертого (обратного включения) светодиода яркости нет.
 */
export function ledBrightness(reading: ComponentReading): number {
  if (reading.current < LED_LIT_CURRENT) return 0;
  return Math.min(1, reading.current / LED_FULL_CURRENT);
}

/** Зуммер звучит: ток не ниже порога звучания (звук не зависит от полярности). */
export function isBuzzerSounding(reading: ComponentReading): boolean {
  return Math.abs(reading.current) >= BUZZER_SOUND_CURRENT;
}

/**
 * Режим транзистора в решении: состояние итеративного угадывания, как у диодов.
 * База открыта → не отсечка; насыщение → переход коллектор—эмиттер полностью
 * раскрыт, иначе активный режим (ток коллектора = β·Iб).
 */
export interface TransistorState {
  readonly baseOn: boolean;
  readonly saturated: boolean;
  /** Ток базы предыдущей итерации, А — источник тока активного режима. */
  readonly baseCurrent: number;
}

/** Отсечка: база закрыта, коллекторная ветвь — обрыв. */
const TRANSISTOR_OFF: TransistorState = { baseOn: false, saturated: false, baseCurrent: 0 };

/** Ниже этой величины ток и мощность — числовая пыль разомкнутых контактов. */
const NUMERICAL_DUST = 1e-7;

/**
 * Минимальное сопротивление плеча потенциометра, Ом: движок на краю пути —
 * почти контакт, но нулевая проводимость выродила бы матрицу.
 */
const WIPER_END_RESISTANCE = 1e-3;

/**
 * Сопротивление плеча потенциометра, Ом: движок делит общее сопротивление
 * по положению (wiper — доля между выводом 0 и движком).
 */
export function potentiometerPartResistance(component: PlacedComponent, part: 0 | 1): number {
  const total = component.resistance ?? Number.POSITIVE_INFINITY;
  const wiper = component.wiper ?? defaultPotentiometerWiper;
  const share = part === 0 ? wiper : 1 - wiper;
  return Math.max(total * share, WIPER_END_RESISTANCE);
}

/**
 * Сопротивление ветви по виду и номиналу Компонента (с переопределением
 * контактов). Диоды и транзистор штемпелюются по своему состоянию отдельно;
 * здесь запертый переход — обрыв, у активного транзистора ветвь ведёт себя
 * как большое выходное сопротивление.
 */
function branchResistance(branch: Branch, contactStates?: ReadonlyMap<string, boolean>): number {
  const component = branch.component;
  switch (component.kind) {
    case 'battery':
      return BATTERY_INTERNAL_RESISTANCE;
    case 'resistor':
    case 'lamp':
    case 'motor':
    case 'buzzer':
      return component.resistance ?? Number.POSITIVE_INFINITY;
    case 'switch':
    case 'pushbutton': {
      const closed = contactStates?.get(component.id) ?? (component.closed ?? false);
      return closed ? CLOSED_CONTACT_RESISTANCE : OPEN_CONTACT_RESISTANCE;
    }
    case 'diode':
    case 'led':
      // запертое состояние диода — обрыв; проводящее штемпелюется отдельно
      return OPEN_CONTACT_RESISTANCE;
    case 'potentiometer':
      // движок делит общее сопротивление на два плеча: ветвь — по своему краю
      return potentiometerPartResistance(component, branch.pinA === 0 ? 0 : 1);
    case 'transistor':
      return OPEN_CONTACT_RESISTANCE;
    case 'capacitor':
      // для постоянного тока конденсатор — разрыв; переходный режим штемпелюет компаньона
      return Number.POSITIVE_INFINITY;
  }
}

function isDiodeKind(kind: ComponentKind): boolean {
  return kind === 'diode' || kind === 'led';
}

/** Прямой порог диода по виду и цвету Компонента; в Симуляторе и Диагнозах. */
export function forwardVoltageOf(component: PlacedComponent): number {
  if (component.kind === 'led') return LED_FORWARD_VOLTAGE[component.color ?? defaultLedColor];
  return DIODE_FORWARD_VOLTAGE;
}

/**
 * Ветвь схемы: Компонент между узлами двух своих выводов. Большинство
 * Компонентов имеют одну ветвь (выводы 0 → 1); у транзистора две — переход
 * база—эмиттер и переход коллектор—эмиттер, у потенциометра две — плечи
 * вокруг движка.
 */
interface Branch {
  readonly component: PlacedComponent;
  /** Выводы Компонента на концах ветви. */
  readonly pinA: number;
  readonly pinB: number;
  readonly nodeA: number;
  readonly nodeB: number;
}

/** Выводы транзистора: база, коллектор, эмиттер (слева, справа сверху, справа снизу). */
const BASE_PIN = 0;
const COLLECTOR_PIN = 1;
const EMITTER_PIN = 2;

/** Ветви Компонента: две у трёхвыводных, одна у остальных. */
function branchesOf(
  component: PlacedComponent,
  nodeOf: (componentId: string, pin: number) => number,
): Branch[] {
  if (component.kind === 'transistor') {
    // переход база—эмиттер и переход коллектор—эмиттер
    return [
      {
        component,
        pinA: BASE_PIN,
        pinB: EMITTER_PIN,
        nodeA: nodeOf(component.id, BASE_PIN),
        nodeB: nodeOf(component.id, EMITTER_PIN),
      },
      {
        component,
        pinA: COLLECTOR_PIN,
        pinB: EMITTER_PIN,
        nodeA: nodeOf(component.id, COLLECTOR_PIN),
        nodeB: nodeOf(component.id, EMITTER_PIN),
      },
    ];
  }
  if (component.kind === 'potentiometer') {
    // выводы: 0 и 2 — концы сопротивления, 1 — движок
    return [
      { component, pinA: 0, pinB: 1, nodeA: nodeOf(component.id, 0), nodeB: nodeOf(component.id, 1) },
      { component, pinA: 1, pinB: 2, nodeA: nodeOf(component.id, 1), nodeB: nodeOf(component.id, 2) },
    ];
  }
  return [
    { component, pinA: 0, pinB: 1, nodeA: nodeOf(component.id, 0), nodeB: nodeOf(component.id, 1) },
  ];
}

/** Система непересекающихся множеств с двухпроходным сжатием путей. */
class DisjointSet {
  private readonly parent = new Map<string, string>();

  /** Неизвестный элемент — сам себе корень: множество растёт по мере union/find. */
  find(item: string): string {
    let root = item;
    for (;;) {
      const upstream = this.parent.get(root);
      if (upstream === undefined || upstream === root) break;
      root = upstream;
    }
    let current = item;
    while (current !== root) {
      const next = this.parent.get(current) ?? root;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

/**
 * Решает схему постоянного тока. Остров без «живого» источника не возбуждается:
 * все его токи нулевые. Остров с батареей (или заряженным конденсатором-компаньоном,
 * или пробой Thevenin) решается методом узловых потенциалов; «землёй» берётся
 * узел минусового вывода первой батареи острова, а без неё — минус первой
 * активной ветви.
 */
export function solveDc(canvas: CanvasState, options: DcSolveOptions = {}): DcSolution {
  // Провода объединяют выводы в узлы; корень объединения — имя узла
  const knownIds = new Set(canvas.components.map((component) => component.id));
  const pinSets = new DisjointSet();
  for (const wire of canvas.wires) {
    if (!knownIds.has(wire.from.componentId) || !knownIds.has(wire.to.componentId)) continue;
    pinSets.union(pinKey(wire.from.componentId, wire.from.pin), pinKey(wire.to.componentId, wire.to.pin));
  }

  // Узлы нумеруются по порядку первого упоминания
  const nodeIndex = new Map<string, number>();
  const nodeOf = (componentId: string, pin: number): number => {
    const root = pinSets.find(pinKey(componentId, pin));
    let index = nodeIndex.get(root);
    if (index === undefined) {
      index = nodeIndex.size;
      nodeIndex.set(root, index);
    }
    return index;
  };

  const branches: Branch[] = canvas.components.flatMap((component) => branchesOf(component, nodeOf));

  // Остров — множество узлов, соединённых ветвями; имя острова — корень объединения
  const islandSets = new DisjointSet();
  const findIsland = (node: number): string => islandSets.find(String(node));
  for (const branch of branches) {
    if (branch.nodeA !== branch.nodeB) islandSets.union(String(branch.nodeA), String(branch.nodeB));
  }

  const nodeVoltage = new Array<number>(nodeIndex.size).fill(0);
  // «Живой» источник острова: батарея, проба Thevenin или заряженный компаньон
  const energizesIsland = (branch: Branch): boolean =>
    branch.component.kind === 'battery' ||
    (branch.component.kind === 'capacitor' &&
      (options.theveninProbeOf === branch.component.id ||
        Math.abs(options.capacitorStates?.get(branch.component.id)?.voltage ?? 0) >= ENERGIZED_VOLTAGE));
  const sourceIslands = new Set<string>();
  for (const branch of branches) {
    if (energizesIsland(branch)) sourceIslands.add(findIsland(branch.nodeA));
  }

  // Проводящие диоды и состояния транзисторов: угадываются итеративно в каждом острове.
  const conductingDiodes = new Set<string>();
  const transistorStates = new Map<string, TransistorState>();
  for (const islandRoot of sourceIslands) {
    const ground = (
      branches.find(
        (branch) => branch.component.kind === 'battery' && findIsland(branch.nodeA) === islandRoot,
      ) ??
      branches.find((branch) => energizesIsland(branch) && findIsland(branch.nodeA) === islandRoot)!
    ).nodeB;
    const island = solveIsland(branches, islandRoot, ground, findIsland, nodeVoltage, options);
    for (const id of island.conductingDiodes) conductingDiodes.add(id);
    for (const [id, state] of island.transistors) transistorStates.set(id, state);
  }

  // Ветви по Компонентам: показание строится по всем ветвям Компонента сразу.
  const branchesByComponent = new Map<string, Branch[]>();
  for (const branch of branches) {
    const own = branchesByComponent.get(branch.component.id) ?? [];
    own.push(branch);
    branchesByComponent.set(branch.component.id, own);
  }

  const readings = canvas.components.map((component) =>
    readingOfComponent(
      component,
      branchesByComponent.get(component.id) ?? [],
      nodeVoltage,
      conductingDiodes,
      transistorStates,
      options,
    ),
  );
  const pinNodes = new Map<string, PinNode>();
  for (const branch of branches) {
    for (const [pin, node] of [
      [branch.pinA, branch.nodeA],
      [branch.pinB, branch.nodeB],
    ] as const) {
      pinNodes.set(pinKey(branch.component.id, pin), {
        island: findIsland(node),
        voltage: nodeVoltage[node],
      });
    }
  }
  return { readings, pinNodes };
}

/**
 * Собирает и решает узловые уравнения одного острова с «землёй» ground.
 * Диоды и транзисторы острова нелинейны, поэтому решение итеративное: все
 * диоды стартуют запертыми, все транзисторы — отсечкой; после каждого решения
 * состояния правятся (диод открылся при напряжении выше порога, транзистор —
 * по току базы и напряжению коллектор—эмиттер), пока состояния не перестанут
 * меняться. Возвращает проводящие диоды и итоговые состояния транзисторов.
 * Проба Thevenin лине́йна: нелинейные приборы остаются запертыми, итерации
 * не нужны.
 */
function solveIsland(
  branches: readonly Branch[],
  islandRoot: string,
  ground: number,
  findIsland: (node: number) => string,
  nodeVoltage: number[],
  options: DcSolveOptions,
): { conductingDiodes: Set<string>; transistors: Map<string, TransistorState> } {
  const inIsland = (branch: Branch): boolean =>
    findIsland(branch.nodeA) === islandRoot || findIsland(branch.nodeB) === islandRoot;

  /**
   * В локальный индекс попадают только узлы с проводимостью: открытая ветвь
   * (конденсатор вне переходного режима) не штемпелюет проводимость, и узел,
   * которого касаются только открытые ветви, дал бы нулевую строку матрицы.
   */
  const stampsConductance = (branch: Branch): boolean => {
    if (branch.component.kind === 'capacitor') {
      if (options.theveninProbeOf === branch.component.id) return false;
      return options.capacitorStates?.has(branch.component.id) ?? false;
    }
    return Number.isFinite(branchResistance(branch, options.contactStates));
  };
  const nodeHasConductance = new Set<number>();
  for (const branch of branches) {
    if (!inIsland(branch) || branch.nodeA === branch.nodeB || !stampsConductance(branch)) continue;
    nodeHasConductance.add(branch.nodeA);
    nodeHasConductance.add(branch.nodeB);
  }

  const localIndex = new Map<number, number>();
  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    for (const node of [branch.nodeA, branch.nodeB]) {
      if (node !== ground && !localIndex.has(node) && nodeHasConductance.has(node)) {
        localIndex.set(node, localIndex.size);
      }
    }
  }

  const conducting = new Set<string>();
  const transistors = new Map<string, TransistorState>();
  /**
   * База, однажды закрытая за нехваткой тока (утечка разомкнутого контакта),
   * не открывается снова, пока решается этот остров: иначе состояние
   * колебалось бы «открылся — ток ничтожен — закрылся — напряжение снова
   * выше порога…» до предела итераций.
   */
  const starvedBases = new Set<string>();
  for (let iteration = 0; ; iteration += 1) {
    solveWithDiodeStates(branches, inIsland, localIndex, conducting, transistors, nodeVoltage, options);

    if (options.theveninProbeOf !== undefined) break; // проба — линейная задача

    let changed = false;
    for (const branch of branches) {
      if (!inIsland(branch) || !isDiodeKind(branch.component.kind)) continue;
      const voltage = nodeVoltage[branch.nodeA] - nodeVoltage[branch.nodeB];
      const forward = forwardVoltageOf(branch.component);
      const isOn = conducting.has(branch.component.id);
      if (!isOn && voltage >= forward) {
        conducting.add(branch.component.id);
        changed = true;
      } else if (isOn && (voltage - forward) / DIODE_ON_RESISTANCE < 0) {
        conducting.delete(branch.component.id);
        changed = true;
      }
    }
    changed = updateTransistors(branches, inIsland, transistors, starvedBases, nodeVoltage) || changed;
    if (!changed || iteration >= MAX_DIODE_ITERATIONS) break;
  }
  return { conductingDiodes: conducting, transistors };
}

/**
 * Корректирует состояния транзисторов по свежему решению. Правила переходов
 * (пока база не «об голодала»): напряжение база—эмиттер дошло до порога —
 * открыться; ток базы ничтожен (или отрицателен) — закрыться; в активном
 * режиме напряжение коллектор—эмиттер упало до насыщения — сесть в насыщение;
 * в насыщении цепь коллектора требует тока больше β·Iб — вернуться в активный
 * режим. Возвращает true, если хотя бы одно состояние изменилось.
 */
function updateTransistors(
  branches: readonly Branch[],
  inIsland: (branch: Branch) => boolean,
  transistors: Map<string, TransistorState>,
  starvedBases: Set<string>,
  nodeVoltage: readonly number[],
): boolean {
  // Пара ветвей транзистора: переход база—эмиттер и переход коллектор—эмиттер.
  const pairs = new Map<string, { base?: Branch; collector?: Branch }>();
  for (const branch of branches) {
    if (!inIsland(branch) || branch.component.kind !== 'transistor') continue;
    const pair = pairs.get(branch.component.id) ?? {};
    if (branch.pinA === 0) pair.base = branch;
    else pair.collector = branch;
    pairs.set(branch.component.id, pair);
  }

  let changed = false;
  for (const [id, { base, collector }] of pairs) {
    if (base === undefined || collector === undefined) continue;
    const emitter = base.nodeB;
    const vBE = nodeVoltage[base.nodeA] - nodeVoltage[emitter];
    const vCE = nodeVoltage[collector.nodeA] - nodeVoltage[emitter];
    const state = transistors.get(id) ?? TRANSISTOR_OFF;
    const baseCurrentOf = (vBE - TRANSISTOR_V_BE_ON) / TRANSISTOR_R_BE;

    if (!state.baseOn) {
      if (!starvedBases.has(id) && vBE >= TRANSISTOR_V_BE_ON) {
        transistors.set(id, { baseOn: true, saturated: false, baseCurrent: 0 });
        changed = true;
      }
      continue;
    }
    if (baseCurrentOf < TRANSISTOR_MIN_BASE_CURRENT) {
      // тока базы нет: отсечка (заодно отсекает открытие током утечки)
      transistors.set(id, TRANSISTOR_OFF);
      starvedBases.add(id);
      changed = true;
      continue;
    }
    if (!state.saturated) {
      if (vCE < TRANSISTOR_V_CE_SAT) {
        transistors.set(id, { baseOn: true, saturated: true, baseCurrent: baseCurrentOf });
      } else if (Math.abs(baseCurrentOf - state.baseCurrent) > BASE_CURRENT_EPSILON) {
        transistors.set(id, { baseOn: true, saturated: false, baseCurrent: baseCurrentOf });
      } else {
        continue;
      }
      changed = true;
      continue;
    }
    const collectorCurrent = (vCE - TRANSISTOR_V_CE_SAT) / TRANSISTOR_R_CE_SAT;
    if (collectorCurrent > TRANSISTOR_BETA * baseCurrentOf) {
      // цепь коллектора требует тока, которого β·Iб не даёт, — это не насыщение
      transistors.set(id, { baseOn: true, saturated: false, baseCurrent: baseCurrentOf });
      changed = true;
    } else if (Math.abs(baseCurrentOf - state.baseCurrent) > BASE_CURRENT_EPSILON) {
      transistors.set(id, { baseOn: true, saturated: true, baseCurrent: baseCurrentOf });
      changed = true;
    }
  }
  return changed;
}

/** Разница токов базы между итерациями ниже этой величины сошлась. */
const BASE_CURRENT_EPSILON = 1e-12;

/** Одно решение узловых уравнений при фиксированных состояниях диодов и транзисторов. */
function solveWithDiodeStates(
  branches: readonly Branch[],
  inIsland: (branch: Branch) => boolean,
  localIndex: Map<number, number>,
  conducting: Set<string>,
  transistors: ReadonlyMap<string, TransistorState>,
  nodeVoltage: number[],
  options: DcSolveOptions,
): void {
  const probe = options.theveninProbeOf !== undefined;
  const size = localIndex.size;
  const conductance: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const injection = new Array<number>(size).fill(0);

  const stampConductance = (a: number, b: number, g: number): void => {
    if (a === b) return; // самопетля не меняет узловые уравнения
    const la = localIndex.get(a);
    const lb = localIndex.get(b);
    if (la !== undefined) conductance[la][la] += g;
    if (lb !== undefined) conductance[lb][lb] += g;
    if (la !== undefined && lb !== undefined) {
      conductance[la][lb] -= g;
      conductance[lb][la] -= g;
    }
  };

  const stampNorton = (branch: Branch, resistance: number, emf: number): void => {
    stampConductance(branch.nodeA, branch.nodeB, 1 / resistance);
    const la = localIndex.get(branch.nodeA);
    const lb = localIndex.get(branch.nodeB);
    if (la !== undefined) injection[la] += emf / resistance;
    if (lb !== undefined) injection[lb] -= emf / resistance;
  };

  /** Запертый нелинейный переход: обрыв без вырождения матрицы. */
  const stampOpenBranch = (branch: Branch): void => {
    stampConductance(branch.nodeA, branch.nodeB, 1 / OPEN_CONTACT_RESISTANCE);
  };

  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    if (branch.component.kind === 'battery') {
      // проба Thevenin гасит источники ЭДС: остаётся только внутреннее сопротивление
      const emf = probe ? 0 : (branch.component.voltage ?? 0);
      stampNorton(branch, BATTERY_INTERNAL_RESISTANCE, emf);
    } else if (branch.component.kind === 'capacitor') {
      if (options.theveninProbeOf === branch.component.id) {
        // проба: источник тока 1 А между выводами конденсатора
        const la = localIndex.get(branch.nodeA);
        const lb = localIndex.get(branch.nodeB);
        if (la !== undefined) injection[la] += THEVENIN_PROBE_CURRENT;
        if (lb !== undefined) injection[lb] -= THEVENIN_PROBE_CURRENT;
      } else {
        const state = options.capacitorStates?.get(branch.component.id);
        if (state !== undefined) {
          // компаньон трапецеидального интегрирования: конденсатор ведёт себя
          // как батарея с ЭДС v + i·Δt/2C и сопротивлением Δt/2C. При пробном
          // «нулевом» шаге это почти короткое замыкание: соседние конденсаторы
          // в пробе постоянной времени ведут себя как короткие — напряжение на
          // них не может измениться мгновенно.
          const capacitance = branch.component.capacitance ?? defaultCapacitance;
          const resistance = companionResistance(options.timeStep ?? 0, capacitance);
          if (Number.isFinite(resistance) && resistance > 0) {
            stampNorton(branch, resistance, state.voltage + state.current * resistance);
          }
        }
      }
    } else if (isDiodeKind(branch.component.kind) && conducting.has(branch.component.id)) {
      // проводящий диод — ЭДС порога с малым последовательным сопротивлением
      stampNorton(branch, DIODE_ON_RESISTANCE, forwardVoltageOf(branch.component));
    } else if (branch.component.kind === 'transistor') {
      stampTransistorBranch(branch, transistors.get(branch.component.id) ?? TRANSISTOR_OFF, {
        localIndex,
        stampConductance,
        stampNorton,
        stampOpenBranch,
        injection,
      });
    } else {
      const resistance = branchResistance(branch, options.contactStates);
      if (Number.isFinite(resistance) && resistance > 0) {
        stampConductance(branch.nodeA, branch.nodeB, 1 / resistance);
      }
    }
  }

  const potentials = solveLinearSystem(conductance, injection);
  for (const [node, local] of localIndex) nodeVoltage[node] = potentials[local];
}

/** Штемпелёры одной ветви — общий набор для модели транзистора. */
interface BranchStamps {
  readonly localIndex: Map<number, number>;
  readonly stampConductance: (a: number, b: number, g: number) => void;
  readonly stampNorton: (branch: Branch, resistance: number, emf: number) => void;
  readonly stampOpenBranch: (branch: Branch) => void;
  readonly injection: number[];
}

/**
 * Ветвь транзистора по его режиму: база—эмиттер — как диод (порог с малым
 * сопротивлением) или обрыв; коллектор—эмиттер в насыщении — ЭДС V_кэ нас с
 * малым сопротивлением, в активном режиме — источник тока β·Iб с большим
 * выходным сопротивлением, в отсечке — обрыв.
 */
function stampTransistorBranch(
  branch: Branch,
  state: TransistorState,
  stamps: BranchStamps,
): void {
  if (branch.pinA === BASE_PIN) {
    // переход база—эмиттер
    if (!state.baseOn) {
      stamps.stampOpenBranch(branch);
      return;
    }
    stamps.stampNorton(branch, TRANSISTOR_R_BE, TRANSISTOR_V_BE_ON);
    return;
  }
  // переход коллектор—эмиттер
  if (!state.baseOn) {
    stamps.stampOpenBranch(branch);
    return;
  }
  if (state.saturated) {
    stamps.stampNorton(branch, TRANSISTOR_R_CE_SAT, TRANSISTOR_V_CE_SAT);
    return;
  }
  // активный режим: ток β·Iб уходит из коллектора в эмиттер. Правило узлов:
  // положительное впрыскивание — источник вливает ток в узел, поэтому
  // коллектору ток вычитается, эмиттеру — прибавляется.
  stamps.stampConductance(branch.nodeA, branch.nodeB, 1 / TRANSISTOR_ACTIVE_RESISTANCE);
  const current = TRANSISTOR_BETA * state.baseCurrent;
  const collector = stamps.localIndex.get(branch.nodeA);
  const emitter = stamps.localIndex.get(branch.nodeB);
  if (collector !== undefined) stamps.injection[collector] -= current;
  if (emitter !== undefined) stamps.injection[emitter] += current;
}

/** Метод Гаусса с выбором ведущего элемента; матрицы Холста малы. */
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    [a[col], a[pivot]] = [a[pivot], a[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    const diagonal = a[col][col];
    if (diagonal === 0) throw new Error('Сингулярная матрица узловых уравнений');
    for (let row = col + 1; row < n; row += 1) {
      const factor = a[row][col] / diagonal;
      if (factor === 0) continue;
      for (let k = col; k < n; k += 1) a[row][k] -= factor * a[col][k];
      b[row] -= factor * b[col];
    }
  }
  const x = new Array<number>(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = b[row];
    for (let k = row + 1; k < n; k += 1) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
}

/**
 * Показание Компонента по узловым потенциалам и состояниям нелинейных
 * приборов. У трёхвыводных Компонентов ветвей две, и показание собирается
 * из них: транзистор отчитывается коллекторным током и V_кэ, потенциометр —
 * сквозным током и полным напряжением; токи выводов — в pinCurrents.
 */
function readingOfComponent(
  component: PlacedComponent,
  branches: readonly Branch[],
  nodeVoltage: readonly number[],
  conductingDiodes: ReadonlySet<string>,
  transistors: ReadonlyMap<string, TransistorState>,
  options: DcSolveOptions = {},
): ComponentReading {
  if (component.kind === 'transistor' && branches.length === 2) {
    return transistorReading(component, branches, nodeVoltage, transistors);
  }
  if (component.kind === 'potentiometer' && branches.length === 2) {
    return potentiometerReading(component, branches, nodeVoltage);
  }
  const branch = branches[0]!;
  const voltage = nodeVoltage[branch.nodeA] - nodeVoltage[branch.nodeB];
  const reading = (current: number, power = Math.abs(voltage * current)): ComponentReading => ({
    componentId: component.id,
    kind: component.kind,
    current: snapToZero(current),
    voltage,
    power: snapToZero(power),
    pinCurrents: twoPinCurrents(component.kind, snapToZero(current)),
  });
  if (component.kind === 'battery') {
    const emf = component.voltage ?? 0;
    const current = (emf - voltage) / BATTERY_INTERNAL_RESISTANCE;
    // мощность у батареи отдаваемая: знак произведения сохраняется
    return reading(current, voltage * current);
  }
  if (component.kind === 'capacitor') {
    // компаньон переходного режима: ток восстанавливается по его уравнению,
    // i = (v − v_пред)/r − i_пред; обычное решение — обрыв, ток нулевой
    const state = options.capacitorStates?.get(component.id);
    const resistance = companionResistance(options.timeStep ?? 0, component.capacitance ?? defaultCapacitance);
    const current =
      state !== undefined && resistance > 0
        ? (voltage - state.voltage) / resistance - state.current
        : 0;
    return reading(current, Math.abs(voltage * current));
  }
  if (isDiodeKind(component.kind)) {
    const current = conductingDiodes.has(component.id)
      ? (voltage - forwardVoltageOf(component)) / DIODE_ON_RESISTANCE
      : 0;
    return reading(current);
  }
  // Решение могло считаться с переопределёнными контактами (переходный
  // режим после переключения) — показание обязано описывать ту же топологию.
  const resistance = branchResistance(branch, options.contactStates);
  const current = Number.isFinite(resistance) ? voltage / resistance : 0;
  return reading(current);
}

/** Токи двухвыводного Компонента: наружу из конца ветви, внутрь из начала. */
function twoPinCurrents(kind: ComponentKind, current: number): readonly number[] {
  return kind === 'battery' ? [current, -current] : [-current, current];
}

/** Показание транзистора: коллекторный ток и напряжение коллектор—эмиттер. */
function transistorReading(
  component: PlacedComponent,
  branches: readonly Branch[],
  nodeVoltage: readonly number[],
  transistors: ReadonlyMap<string, TransistorState>,
): ComponentReading {
  const baseBranch = branches.find((branch) => branch.pinA === BASE_PIN)!;
  const collectorBranch = branches.find((branch) => branch.pinA === COLLECTOR_PIN)!;
  const emitter = nodeVoltage[baseBranch.nodeB];
  const vBE = nodeVoltage[baseBranch.nodeA] - emitter;
  const vCE = nodeVoltage[collectorBranch.nodeA] - emitter;
  const state = transistors.get(component.id) ?? TRANSISTOR_OFF;
  const baseCurrent = state.baseOn ? (vBE - TRANSISTOR_V_BE_ON) / TRANSISTOR_R_BE : 0;
  const collectorCurrent = !state.baseOn
    ? 0
    : state.saturated
      ? (vCE - TRANSISTOR_V_CE_SAT) / TRANSISTOR_R_CE_SAT
      : TRANSISTOR_BETA * baseCurrent;
  const current = snapToZero(collectorCurrent);
  return {
    componentId: component.id,
    kind: component.kind,
    current,
    voltage: vCE,
    power: snapToZero(Math.abs(vCE * collectorCurrent) + Math.abs(vBE * baseCurrent)),
    pinCurrents: [
      -baseCurrent,
      -collectorCurrent,
      baseCurrent + collectorCurrent,
    ].map(snapToZero),
  };
}

/** Показание потенциометра: сквозной ток и полное напряжение, токи плеч. */
function potentiometerReading(
  component: PlacedComponent,
  branches: readonly Branch[],
  nodeVoltage: readonly number[],
): ComponentReading {
  const firstPart = branches.find((branch) => branch.pinA === 0)!;
  const secondPart = branches.find((branch) => branch.pinA === 1)!;
  const v0 = nodeVoltage[firstPart.nodeA];
  const v1 = nodeVoltage[firstPart.nodeB];
  const v2 = nodeVoltage[secondPart.nodeB];
  const firstCurrent = (v0 - v1) / potentiometerPartResistance(component, 0);
  const secondCurrent = (v1 - v2) / potentiometerPartResistance(component, 1);
  const current = snapToZero(firstCurrent);
  return {
    componentId: component.id,
    kind: component.kind,
    current,
    voltage: v0 - v2,
    power: snapToZero(Math.abs((v0 - v1) * firstCurrent) + Math.abs((v1 - v2) * secondCurrent)),
    pinCurrents: [-firstCurrent, firstCurrent - secondCurrent, secondCurrent].map(snapToZero),
  };
}

/** Токи/мощности ниже пыли разомкнутых контактов — нули для честных показаний. */
function snapToZero(value: number): number {
  return Math.abs(value) < NUMERICAL_DUST ? 0 : value;
}
