/**
 * Фазорный (комплексный) режим Симулятора (тикет 20, spec: «стадии: DC,
 * переходные процессы, комплексный режим»). Схема на синусоидальном токе
 * решается методом узловых потенциалов в комплексных числах: резистор даёт
 * проводимость 1/R, конденсатор — jωC, катушка — 1/(jωL), источник ~ —
 * эквивалент Нортона (ЭДС-фазор с малым внутренним сопротивлением). Частота
 * и фаза всей схемы задаются первым источником ~ на Холсте.
 *
 * Схемы с батареей и источником ~ одновременно решаются суперпозицией
 * (`solveCircuit`): постоянная составляющая — обычный solveDc с погашенным
 * источником ~ (остаётся его внутреннее сопротивление), переменная — фазорное
 * решение с погашенными батареями (остаётся их внутреннее сопротивление).
 * Полная величина собирается во времени как V_dc + A·sin(ωt + φ), а её
 * действующее значение — √(DC² + (A/√2)²).
 *
 * Нелинейные приборы (диоды, транзистор) в фазорном режиме линеаризовать
 * нечего — их ветви считаются обрывом; поведение выпрямителей раскрывает
 * переходный режим, решающий схему шаг за шагом с синусом на источнике.
 * Чистый TypeScript без DOM.
 */
import { defaultAcFrequency, pinKey, type CanvasState, type ComponentKind, type PlacedComponent } from './canvas';
import { buildTopology, type TopologyBranch } from './topology';
import {
  AC_SOURCE_INTERNAL_RESISTANCE,
  BATTERY_INTERNAL_RESISTANCE,
  CLOSED_CONTACT_RESISTANCE,
  OPEN_CONTACT_RESISTANCE,
  potentiometerPartResistance,
  readingsByComponent,
  readingOf,
  solveDc,
  wireCurrentsFrom,
  type ComponentReading,
  type DcSolveOptions,
  type DcSolution,
} from './simulator';

/** Комплексное число — фазор тока или напряжения (амплитуда, не RMS). */
export interface Complex {
  readonly re: number;
  readonly im: number;
}

const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cDiv = (a: Complex, b: Complex): Complex => {
  const denominator = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
};
/** Модуль фазора — амплитуда (пиковое значение) величины. */
export const cAbs = (a: Complex): number => Math.hypot(a.re, a.im);

/** Фаза фазора в градусах, (−180; 180]: относительно фазы источника. */
export function phaseDegOf(z: Complex): number {
  return (Math.atan2(z.im, z.re) * 180) / Math.PI;
}

/**
 * Действующее значение полной величины из постоянной составляющей и
 * амплитуды переменной: √(DC² + (A/√2)²). Разные частоты не складываются
 * иначе — ученические схемы М4 живут на одной частоте источника.
 */
export function rmsOf(dc: number, amplitude: number): number {
  return Math.hypot(dc, amplitude / Math.SQRT2);
}

/** Фазорное показание Компонента: комплексные амплитуды тока и напряжения. */
export interface PhasorReading {
  readonly componentId: string;
  readonly kind: ComponentKind;
  /** Комплексная амплитуда тока главной ветви, А (пиковое значение). */
  readonly current: Complex;
  /** Комплексная амплитуда напряжения на Компоненте, В (пиковое значение). */
  readonly voltage: Complex;
  /** Токи, уходящие из каждого вывода во внешнюю цепь (комплексные амплитуды). */
  readonly pinCurrents: readonly Complex[];
}

/** Узел вывода в фазорном решении: имя острова и потенциал-фазор (В). */
export interface PhasorPinNode {
  readonly island: string;
  readonly voltage: Complex;
}

/** Фазорное решение: частота, показания Компонентов и потенциалы выводов. */
export interface PhasorSolution {
  /** Частота, Гц — задаётся первым источником ~ на Холсте. */
  readonly frequency: number;
  readonly angularFrequency: number;
  readonly readings: readonly PhasorReading[];
  readonly pinPhasors: ReadonlyMap<string, PhasorPinNode>;
}

/**
 * Полное решение схемы: суперпозиция постоянной и переменной составляющих.
 * `phasor` равен null, если на схеме нет источника ~: тогда решение — чистый
 * постоянный ток, и все потребители фазоров видят прежнее поведение.
 */
export interface CircuitSolution {
  readonly dc: DcSolution;
  readonly phasor: PhasorSolution | null;
}

/** Опции решения: установившийся режим по нарисованным или по переключённым контактам. */
export interface CircuitSolveOptions {
  /** Состояние коммутаторов: id → замкнут? Нет записи — нарисованное состояние. */
  readonly contactStates?: ReadonlyMap<string, boolean>;
}

/** Частота первого найденного источника ~, Гц; нет источников — null. */
export function acFrequencyOf(canvas: CanvasState): number | null {
  const source = canvas.components.find((component) => component.kind === 'acsource');
  return source === undefined ? null : (source.frequency ?? defaultAcFrequency);
}

/**
 * Решает схему целиком: постоянная составляющая + фазорная. Источники ~
 * погашаются в DC-проходе, батареи — в фазорном; суммирование делает
 * суперпозиция (линейная схема). Схема, которая не решается (сингулярная
 * матрица), даёт null — живое поведение просто гаснет.
 */
export function solveCircuit(
  canvas: CanvasState,
  options: CircuitSolveOptions = {},
): CircuitSolution | null {
  try {
    const dc = solveDc(canvas, options as DcSolveOptions);
    const frequency = acFrequencyOf(canvas);
    const phasor = frequency === null ? null : solvePhasor(canvas, frequency, options);
    return { dc, phasor };
  } catch {
    return null;
  }
}

/** Комплексная проводимость ветви, См; обрыв (диоды, транзистор) — почти ноль. */
function branchAdmittance(
  branch: TopologyBranch,
  angularFrequency: number,
  contactStates?: ReadonlyMap<string, boolean>,
): Complex {
  const component = branch.component;
  switch (component.kind) {
    case 'battery':
      return { re: 1 / BATTERY_INTERNAL_RESISTANCE, im: 0 };
    case 'acsource':
      return { re: 1 / AC_SOURCE_INTERNAL_RESISTANCE, im: 0 };
    case 'resistor':
    case 'lamp':
    case 'motor':
    case 'buzzer': {
      const resistance = component.resistance ?? Number.POSITIVE_INFINITY;
      return Number.isFinite(resistance) ? { re: 1 / resistance, im: 0 } : { re: 0, im: 0 };
    }
    case 'switch':
    case 'pushbutton': {
      const closed = contactStates?.get(component.id) ?? (component.closed ?? false);
      return { re: 1 / (closed ? CLOSED_CONTACT_RESISTANCE : OPEN_CONTACT_RESISTANCE), im: 0 };
    }
    case 'potentiometer': {
      const part = potentiometerPartResistance(component, branch.pinA === 0 ? 0 : 1);
      return { re: 1 / part, im: 0 };
    }
    case 'capacitor': {
      const capacitance = component.capacitance ?? 0;
      return { re: 0, im: angularFrequency * capacitance };
    }
    case 'inductor': {
      const inductance = component.inductance ?? 0;
      return { re: 0, im: -1 / (angularFrequency * inductance) };
    }
    case 'diode':
    case 'led':
    case 'transistor':
      // нелинейный прибор в установившемся синусоидальном режиме — обрыв
      return { re: 1 / OPEN_CONTACT_RESISTANCE, im: 0 };
  }
}

/**
 * Решает схему в фазорном режиме. Острова без источника ~ не возбуждаются
 * (нули); остров с источником решается комплексными узловыми уравнениями,
 * «земля» — минусовый вывод первого источника. Сингулярная матрица даёт
 * null — как несошедшееся решение.
 */
export function solvePhasor(
  canvas: CanvasState,
  frequency: number,
  options: CircuitSolveOptions = {},
): PhasorSolution | null {
  const { branches, islandOf } = buildTopology(canvas);
  const angularFrequency = 2 * Math.PI * frequency;

  const energizesIsland = (branch: TopologyBranch): boolean => branch.component.kind === 'acsource';
  const sourceIslands = new Set<string>();
  for (const branch of branches) {
    if (energizesIsland(branch)) sourceIslands.add(islandOf(branch.nodeA));
  }

  const nodePhasors = new Map<number, Complex>();
  for (const islandRoot of sourceIslands) {
    const sourceBranch = branches.find(
      (branch) => branch.component.kind === 'acsource' && islandOf(branch.nodeA) === islandRoot,
    );
    if (sourceBranch === undefined) continue;
    const solved = solveIslandPhasors(branches, islandRoot, sourceBranch.nodeB, islandOf, {
      angularFrequency,
      contactStates: options.contactStates,
    });
    if (solved === null) return null;
    for (const [node, voltage] of solved) nodePhasors.set(node, voltage);
  }

  const voltageOf = (node: number): Complex => nodePhasors.get(node) ?? { re: 0, im: 0 };
  const readings = canvas.components.map((component) =>
    phasorReadingOf(component, branches, angularFrequency, voltageOf),
  );

  const pinPhasors = new Map<string, PhasorPinNode>();
  for (const branch of branches) {
    for (const [pin, node] of [
      [branch.pinA, branch.nodeA],
      [branch.pinB, branch.nodeB],
    ] as const) {
      pinPhasors.set(pinKey(branch.component.id, pin), {
        island: islandOf(node),
        voltage: voltageOf(node),
      });
    }
  }
  return { frequency, angularFrequency, readings, pinPhasors };
}

/**
 * Собирает и решает комплексные узловые уравнения одного острова с «землёй»
 * ground. Задача линейна — итераций не нужно (в отличие от диодов DC).
 * Сингулярная матрица (например, резонанс LC без нагрузки) — null.
 */
function solveIslandPhasors(
  branches: readonly TopologyBranch[],
  islandRoot: string,
  ground: number,
  islandOf: (node: number) => string,
  environment: {
    readonly angularFrequency: number;
    readonly contactStates?: ReadonlyMap<string, boolean>;
  },
): Map<number, Complex> | null {
  const inIsland = (branch: TopologyBranch): boolean =>
    islandOf(branch.nodeA) === islandRoot || islandOf(branch.nodeB) === islandRoot;

  const localIndex = new Map<number, number>();
  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    for (const node of [branch.nodeA, branch.nodeB]) {
      if (node !== ground && !localIndex.has(node)) localIndex.set(node, localIndex.size);
    }
  }

  const size = localIndex.size;
  const admittance: Complex[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ re: 0, im: 0 })),
  );
  const injection: Complex[] = Array.from({ length: size }, () => ({ re: 0, im: 0 }));

  const stampAdmittance = (branch: TopologyBranch, y: Complex): void => {
    if (branch.nodeA === branch.nodeB) return; // самопетля не меняет узловые уравнения
    const la = localIndex.get(branch.nodeA);
    const lb = localIndex.get(branch.nodeB);
    if (la !== undefined) admittance[la][la] = cAdd(admittance[la][la], y);
    if (lb !== undefined) admittance[lb][lb] = cAdd(admittance[lb][lb], y);
    if (la !== undefined && lb !== undefined) {
      admittance[la][lb] = cSub(admittance[la][lb], y);
      admittance[lb][la] = cSub(admittance[lb][la], y);
    }
  };

  for (const branch of branches) {
    if (!inIsland(branch)) continue;
    const y = branchAdmittance(branch, environment.angularFrequency, environment.contactStates);
    stampAdmittance(branch, y);
    if (branch.component.kind !== 'acsource') continue;
    // ЭДС-фазор источника: амплитуда Компонента, фаза принята за нуль отсчёта
    const emf: Complex = { re: branch.component.voltage ?? 0, im: 0 };
    const la = localIndex.get(branch.nodeA);
    const lb = localIndex.get(branch.nodeB);
    const emfCurrent = {
      re: emf.re * (1 / AC_SOURCE_INTERNAL_RESISTANCE),
      im: emf.im * (1 / AC_SOURCE_INTERNAL_RESISTANCE),
    };
    if (la !== undefined) injection[la] = cAdd(injection[la], emfCurrent);
    if (lb !== undefined) injection[lb] = cSub(injection[lb], emfCurrent);
  }

  let potentials: Complex[];
  try {
    potentials = solveComplexSystem(admittance, injection);
  } catch {
    return null;
  }
  const result = new Map<number, Complex>([[ground, { re: 0, im: 0 }]]);
  for (const [node, local] of localIndex) result.set(node, potentials[local]);
  return result;
}

/** Метод Гаусса в комплексных числах с выбором ведущего элемента; матрицы Холста малы. */
function solveComplexSystem(a: Complex[][], b: readonly Complex[]): Complex[] {
  const n = b.length;
  const matrix = a.map((row) => [...row]);
  const rhs = [...b];
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (cAbs(matrix[row][col]) > cAbs(matrix[pivot][col])) pivot = row;
    }
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]];
    const diagonal = matrix[col][col];
    if (cAbs(diagonal) === 0) throw new Error('Сингулярная матрица узловых уравнений');
    for (let row = col + 1; row < n; row += 1) {
      const factor = cDiv(matrix[row][col], diagonal);
      if (cAbs(factor) === 0) continue;
      for (let k = col; k < n; k += 1) matrix[row][k] = cSub(matrix[row][k], cMul(factor, matrix[col][k]));
      rhs[row] = cSub(rhs[row], cMul(factor, rhs[col]));
    }
  }
  const x: Complex[] = new Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = rhs[row];
    for (let k = row + 1; k < n; k += 1) sum = cSub(sum, cMul(matrix[row][k], x[k]));
    x[row] = cDiv(sum, matrix[row][row]);
  }
  return x;
}

/** Токи ниже этой величины — пыль обрывов и запертых переходов. */
const PHASOR_DUST = 1e-9;

const ZERO: Complex = { re: 0, im: 0 };

/** Фазорное показание Компонента по ветвям и потенциалам узлов. */
function phasorReadingOf(
  component: PlacedComponent,
  branches: readonly TopologyBranch[],
  angularFrequency: number,
  voltageOf: (node: number) => Complex,
): PhasorReading {
  const own = branches.filter((branch) => branch.component.id === component.id);
  const branchCurrent = (branch: TopologyBranch): Complex => {
    const y = branchAdmittance(branch, angularFrequency);
    const voltage = cSub(voltageOf(branch.nodeA), voltageOf(branch.nodeB));
    // у источника ~ в ветви стоит ЭДС-фазор: показание — как у батареи в DC,
    // (ЭДС − напряжение)/r, положительный ток выходит из «плюса» (вывода 0);
    // у пассивных ветвей — закон Ома
    const current =
      branch.component.kind === 'acsource'
        ? cMul(cSub({ re: branch.component.voltage ?? 0, im: 0 }, voltage), y)
        : cMul(voltage, y);
    return cAbs(current) < PHASOR_DUST ? ZERO : current;
  };

  if (component.kind === 'transistor' && own.length === 2) {
    // нелинейный прибор: обе ветви — обрыв, показывать нечего, кроме узлов
    const collector = own.find((branch) => branch.pinA === 1)!;
    return {
      componentId: component.id,
      kind: component.kind,
      current: ZERO,
      voltage: cSub(voltageOf(collector.nodeA), voltageOf(collector.nodeB)),
      pinCurrents: [ZERO, ZERO, ZERO],
    };
  }
  if (component.kind === 'potentiometer' && own.length === 2) {
    const firstPart = own.find((branch) => branch.pinA === 0)!;
    const secondPart = own.find((branch) => branch.pinA === 1)!;
    const firstCurrent = branchCurrent(firstPart);
    const secondCurrent = branchCurrent(secondPart);
    return {
      componentId: component.id,
      kind: component.kind,
      current: firstCurrent,
      voltage: cSub(voltageOf(firstPart.nodeA), voltageOf(secondPart.nodeB)),
      pinCurrents: [cScaleMinus(firstCurrent), cSub(firstCurrent, secondCurrent), secondCurrent],
    };
  }
  const branch = own[0];
  const current = branch === undefined ? ZERO : branchCurrent(branch);
  const voltage = branch === undefined ? ZERO : cSub(voltageOf(branch.nodeA), voltageOf(branch.nodeB));
  const outward = component.kind === 'battery' || component.kind === 'acsource';
  return {
    componentId: component.id,
    kind: component.kind,
    current,
    voltage,
    pinCurrents: outward ? [current, cScaleMinus(current)] : [cScaleMinus(current), current],
  };
}

const cScaleMinus = (a: Complex): Complex => ({ re: -a.re, im: -a.im });

/** Фазорное показание Компонента по идентификатору; нет такого — null. */
export function phasorReading(solution: PhasorSolution, componentId: string): PhasorReading | null {
  return solution.readings.find((reading) => reading.componentId === componentId) ?? null;
}

/**
 * Показания для живого поведения Холста: в схемах с источником ~ активность
 * (свечение, вращение, звук) считается по действующим значениям — лампочка
 * на переменном токе светится так же, как на постоянном той же мощности.
 * В чисто постоянных схемах возвращаются прежние показания без изменений.
 */
export function effectiveReadings(
  canvas: CanvasState,
  solution: CircuitSolution,
): ReadonlyMap<string, ComponentReading> {
  if (solution.phasor === null) return readingsByComponent(solution.dc);
  const phasorById = new Map(solution.phasor.readings.map((reading) => [reading.componentId, reading]));
  const effective = new Map<string, ComponentReading>();
  for (const component of canvas.components) {
    const dc = readingOf(solution.dc, component.id);
    const ac = phasorById.get(component.id);
    if (dc === null || ac === undefined) continue;
    const current = rmsOf(Math.abs(dc.current), cAbs(ac.current));
    const voltage = rmsOf(Math.abs(dc.voltage), cAbs(ac.voltage));
    effective.set(component.id, {
      componentId: component.id,
      kind: component.kind,
      current,
      voltage,
      power: current * voltage,
      pinCurrents: dc.pinCurrents,
    });
  }
  return effective;
}

/** Амплитуды переменной составляющей для оверлея: токи Проводов и Компоненты. */
export interface AcAmplitudes {
  /** Частота переменной составляющей, Гц. */
  readonly frequency: number;
  readonly componentAmplitudes: ReadonlyMap<
    string,
    { readonly current: number; readonly voltage: number }
  >;
  readonly wireAmplitudes: ReadonlyMap<string, number | null>;
}

/**
 * Амплитуды для оверлея по полному решению; нет источника ~ — null (оверлей
 * показывает постоянные значения, как раньше).
 */
export function acAmplitudesOf(canvas: CanvasState, solution: CircuitSolution): AcAmplitudes | null {
  if (solution.phasor === null) return null;
  const phasor = solution.phasor;
  const componentAmplitudes = new Map<string, { current: number; voltage: number }>();
  for (const reading of phasor.readings) {
    componentAmplitudes.set(reading.componentId, {
      current: cAbs(reading.current),
      voltage: cAbs(reading.voltage),
    });
  }
  const byId = new Map(phasor.readings.map((reading) => [reading.componentId, reading]));
  const wireAmplitudes = wireCurrentsFrom(canvas, (componentId, pin) => {
    const reading = byId.get(componentId);
    const pinCurrent = reading?.pinCurrents[pin];
    return pinCurrent === undefined ? null : cAbs(pinCurrent);
  });
  return {
    frequency: phasor.frequency,
    componentAmplitudes,
    wireAmplitudes: new Map(wireAmplitudes.map((entry) => [entry.wireId, entry.current])),
  };
}
