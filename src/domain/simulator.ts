/**
 * Симулятор — аналоговый решатель постоянного тока (ADR-0001). Модифицированный
 * метод узловых потенциалов: Провода объединяют выводы в узлы, каждый Компонент
 * даёт ветвь между узлами своих выводов. Чистый TypeScript без DOM.
 *
 * Поведенческие модели М1 (учебные, см. spec: Implementation Decisions):
 * - батарея — ЭДС с внутренним сопротивлением: эквивалент Нортона, поэтому
 *   короткое замыкание даёт конечный ток ЭДС/r, а не сингулярную матрицу;
 * - резистор, лампочка, моторчик — линейные резистивные; активность лампочек
 *   и моторчиков определяется мощностью (пороги срабатывания);
 * - выключатель и ключ — замкнутый контакт с малым, разомкнутый с огромным
 *   сопротивлением: обрыв честно даёт ток ≈ 0, не ломая решение.
 */
import { pinKey, type CanvasState, type ComponentKind, type PlacedComponent } from './canvas';

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

/**
 * Показание Симулятора для одного Компонента. Знаки: напряжение — вывод 0
 * минус вывод 1 (у батареи это напряжение на зажимах); ток — у батареи из
 * «плюса» (вывод 0) во внешнюю цепь, у остальных от вывода 0 к выводу 1;
 * мощность — рассеиваемая у резистивных, отдаваемая у батареи (Вт).
 */
export interface ComponentReading {
  readonly componentId: string;
  readonly kind: ComponentKind;
  readonly current: number;
  readonly voltage: number;
  readonly power: number;
}

/** Решение схемы постоянного тока: показание на каждый Компонент Холста. */
export interface DcSolution {
  readonly readings: readonly ComponentReading[];
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
    // Ток из Компонента в Провод: у батареи — наружу из «плюса» (вывод 0),
    // у остальных — из вывода 1 (ток течёт от вывода 0 к выводу 1 внутри).
    const pinSign = wire.from.pin === 0 ? 1 : -1;
    const kindSign = component.kind === 'battery' ? 1 : -1;
    return { wireId: wire.id, current: kindSign * pinSign * reading.current };
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

/** Ниже этой величины ток и мощность — числовая пыль разомкнутых контактов. */
const NUMERICAL_DUST = 1e-7;

/** Сопротивление ветви по виду и номиналу Компонента. */
function branchResistance(component: PlacedComponent): number {
  switch (component.kind) {
    case 'battery':
      return BATTERY_INTERNAL_RESISTANCE;
    case 'resistor':
    case 'lamp':
    case 'motor':
      return component.resistance ?? Number.POSITIVE_INFINITY;
    case 'switch':
    case 'pushbutton':
      return component.closed ? CLOSED_CONTACT_RESISTANCE : OPEN_CONTACT_RESISTANCE;
  }
}

/** Ветвь схемы: Компонент между узлами своих выводов (0 → A, 1 → B). */
interface Branch {
  readonly component: PlacedComponent;
  readonly nodeA: number;
  readonly nodeB: number;
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
 * Решает схему постоянного тока. Остров без батареи не возбуждается: все его
 * токи нулевые. Остров с батареей решается методом узловых потенциалов;
 * «землёй» берётся узел минусового вывода первой батареи острова.
 */
export function solveDc(canvas: CanvasState): DcSolution {
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

  const branches: Branch[] = canvas.components.map((component) => ({
    component,
    nodeA: nodeOf(component.id, 0),
    nodeB: nodeOf(component.id, 1),
  }));

  // Остров — множество узлов, соединённых ветвями; имя острова — корень объединения
  const islandSets = new DisjointSet();
  const findIsland = (node: number): string => islandSets.find(String(node));
  for (const branch of branches) {
    if (branch.nodeA !== branch.nodeB) islandSets.union(String(branch.nodeA), String(branch.nodeB));
  }

  const nodeVoltage = new Array<number>(nodeIndex.size).fill(0);
  const islandsWithBattery = new Set<string>();
  for (const branch of branches) {
    if (branch.component.kind === 'battery') islandsWithBattery.add(findIsland(branch.nodeA));
  }

  for (const islandRoot of islandsWithBattery) {
    const ground = branches.find(
      (branch) =>
        branch.component.kind === 'battery' && findIsland(branch.nodeA) === islandRoot,
    )!.nodeB;
    solveIsland(branches, islandRoot, ground, findIsland, nodeVoltage);
  }

  const readings = branches.map((branch) => readingOfBranch(branch, nodeVoltage));
  return { readings };
}

/** Собирает и решает узловые уравнения одного острова с «землёй» ground. */
function solveIsland(
  branches: readonly Branch[],
  islandRoot: string,
  ground: number,
  findIsland: (node: number) => string,
  nodeVoltage: number[],
): void {
  const inIsland = (branch: Branch): boolean =>
    findIsland(branch.nodeA) === islandRoot || findIsland(branch.nodeB) === islandRoot;

  const localIndex = new Map<number, number>();
  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    for (const node of [branch.nodeA, branch.nodeB]) {
      if (node !== ground && !localIndex.has(node)) localIndex.set(node, localIndex.size);
    }
  }

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

  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    if (branch.component.kind === 'battery') {
      const g = 1 / BATTERY_INTERNAL_RESISTANCE;
      const current = (branch.component.voltage ?? 0) / BATTERY_INTERNAL_RESISTANCE;
      stampConductance(branch.nodeA, branch.nodeB, g);
      const la = localIndex.get(branch.nodeA);
      const lb = localIndex.get(branch.nodeB);
      if (la !== undefined) injection[la] += current;
      if (lb !== undefined) injection[lb] -= current;
    } else {
      const resistance = branchResistance(branch.component);
      if (Number.isFinite(resistance) && resistance > 0) {
        stampConductance(branch.nodeA, branch.nodeB, 1 / resistance);
      }
    }
  }

  const potentials = solveLinearSystem(conductance, injection);
  for (const [node, local] of localIndex) nodeVoltage[node] = potentials[local];
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

/** Показание ветви по узловым потенциалам. */
function readingOfBranch(branch: Branch, nodeVoltage: readonly number[]): ComponentReading {
  const { component } = branch;
  const voltage = nodeVoltage[branch.nodeA] - nodeVoltage[branch.nodeB];
  if (component.kind === 'battery') {
    const emf = component.voltage ?? 0;
    const current = (emf - voltage) / BATTERY_INTERNAL_RESISTANCE;
    return {
      componentId: component.id,
      kind: component.kind,
      current: snapToZero(current),
      voltage,
      power: snapToZero(voltage * current),
    };
  }
  const resistance = branchResistance(component);
  const current = Number.isFinite(resistance) ? voltage / resistance : 0;
  return {
    componentId: component.id,
    kind: component.kind,
    current: snapToZero(current),
    voltage,
    power: snapToZero(Math.abs(voltage * current)),
  };
}

/** Токи/мощности ниже пыли разомкнутых контактов — нули для честных показаний. */
function snapToZero(value: number): number {
  return Math.abs(value) < NUMERICAL_DUST ? 0 : value;
}
