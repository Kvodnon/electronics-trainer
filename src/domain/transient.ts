/**
 * Переходный Симулятор (CONTEXT.md: Симулятор, тикет 14): напряжение
 * конденсаторов во времени. Схема решается шагами трапецеидального
 * интегрирования: на каждом шаге конденсатор подменяется компаньоном —
 * сопротивлением Δt/2C с ЭДС v + i·Δt/2C, а катушка (тикет 20) —
 * сопротивлением 2L/Δt с ЭДС −(i·2L/Δt + v): её ток не может измениться
 * скачком, и компаньон держит ток предыдущего шага. Источники ~ на каждом
 * шаге получают свою мгновенную ЭДС — синус амплитуды на частоте Компонента,
 * поэтому выпрямители и AC-цепи честно считаются во времени. Коммутаторы
 * переключаются в заданный планом момент: каждый переводится в
 * противоположное нарисованному состояние. Постоянная времени — сопротивление
 * Thevenin, которое конденсатор видит вокруг (источники погашены), умноженное
 * на ёмкость. Чистый TypeScript без DOM.
 */
import {
  defaultAcAmplitude,
  defaultAcFrequency,
  defaultCapacitance,
  type CanvasState,
  type PlacedComponent,
} from './canvas';
import {
  readingOf,
  solveDc,
  type CapacitorState,
  type ComponentReading,
  type DcSolution,
  type InductorState,
} from './simulator';
import type { TransientPlan } from './task';

/**
 * Решение переходного режима: моменты времени (с, равномерная сетка от 0
 * до плана) и кривые напряжения (В, модуль — ориентация символа на Холсте
 * не должна пугать ученика) по каждому конденсатору Холста. Постоянные
 * времени (с) считаются для конечного состояния схемы — после всех
 * переключений; нет резистивного пути — бесконечность. Кривые напряжения и
 * тока (А) ведутся по всем Компонентам: график «до и после диода»
 * выпрямителя читает их же.
 */
export interface TransientSolution {
  readonly times: readonly number[];
  readonly capacitorVoltages: ReadonlyMap<string, readonly number[]>;
  readonly timeConstants: ReadonlyMap<string, number>;
  /** Напряжение (В) на каждом Компоненте по времени. */
  readonly componentVoltages: ReadonlyMap<string, readonly number[]>;
  /** Ток (А) через каждый Компонент по времени. */
  readonly componentCurrents: ReadonlyMap<string, readonly number[]>;
}

/** Минимальное число шагов на план: грубая сетка для медленных цепей. */
const MIN_STEPS = 120;
/** Предельное число шагов: защита решателя от вырожденно малых τ. */
const MAX_STEPS = 6000;
/** Шаг мельче двадцатой доли самой быстрой постоянной времени не нужен. */
const STEPS_PER_TAU = 20;
/** Шаг мельче сороковой доли периода источника ~ не нужен. */
const STEPS_PER_PERIOD = 40;
/** Сопротивление пробы выше этого — резистивного пути нет (разомкнут контакт). */
const NO_PATH_RESISTANCE = 1e8;
/**
 * Шаг «нулевого» решения: конденсатор-компаньон с таким шагом — почти
 * короткое замыкание с нулевой ЭДС (катушка — наоборот, почти разрыв,
 * держащий ток), и показания компаньонов — настоящие токи и напряжения
 * схемы. Трапеции нужны верные ток и напряжение в момент переключения
 * (и в начале времени): с обнулёнными первый шаг теряет ползаряда.
 */
const INITIAL_STEP_SECONDS = 1e-12;

/**
 * Сетка времени: шаг не крупнее stepMax, а при наличии переключения — ещё и
 * так, чтобы момент переключения попал ровно на границу шагов (иначе ключ
 * «щёлкает» где-то внутри шага, и кривая съезжает на величину до полушага).
 */
function planSteps(plan: TransientPlan, stepMax: number): { steps: number; toggleIndex: number } {
  const base = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.ceil(plan.duration / stepMax)));
  if (plan.switchToggleTime === undefined) return { steps: base, toggleIndex: -1 };
  const ratio = plan.switchToggleTime / plan.duration;
  for (let candidate = base; candidate <= Math.min(base + 60, MAX_STEPS); candidate += 1) {
    const at = candidate * ratio;
    if (Math.abs(at - Math.round(at)) < 1e-6) {
      return { steps: candidate, toggleIndex: Math.round(at) };
    }
  }
  return { steps: base, toggleIndex: Math.round(base * ratio) };
}

/**
 * Состояния всех коммутаторов после переключения: каждый выключатель и ключ —
 * в противоположном нарисованному состоянии.
 */
export function toggledContactStates(canvas: CanvasState): ReadonlyMap<string, boolean> {
  const flipped = new Map<string, boolean>();
  for (const component of canvas.components) {
    if (component.kind === 'switch' || component.kind === 'pushbutton') {
      flipped.set(component.id, !(component.closed ?? false));
    }
  }
  return flipped;
}

/**
 * Решает переходный режим по плану. Конденсаторы стартуют незаряженными,
 * катушки — без тока; схема, где конденсатору не от чего зарядиться, честно
 * даёт нулевую кривую.
 */
export function solveTransient(canvas: CanvasState, plan: TransientPlan): TransientSolution {
  const capacitors = canvas.components.filter((component) => component.kind === 'capacitor');
  const inductors = canvas.components.filter((component) => component.kind === 'inductor');
  const acSources = canvas.components.filter((component) => component.kind === 'acsource');
  const toggled = plan.switchToggleTime !== undefined ? toggledContactStates(canvas) : undefined;
  const timeConstants = new Map(
    capacitors.map((c) => [c.id, timeConstantOf(canvas, c, toggled)]),
  );

  const finite = [...timeConstants.values()].filter((tau) => Number.isFinite(tau));
  const fastest = finite.length > 0 ? Math.min(...finite) : Number.POSITIVE_INFINITY;
  const shortestPeriod = Math.min(
    ...acSources.map((s) => 1 / (s.frequency ?? defaultAcFrequency)),
    Number.POSITIVE_INFINITY,
  );
  const stepMax = Math.min(
    plan.duration / MIN_STEPS,
    fastest / STEPS_PER_TAU,
    shortestPeriod / STEPS_PER_PERIOD,
    plan.duration,
  );
  const { steps, toggleIndex } = planSteps(plan, stepMax);
  const dt = plan.duration / steps;

  const times: number[] = [];
  const curves = new Map<string, number[]>(capacitors.map((c) => [c.id, [] as number[]]));
  const voltageCurves = new Map<string, number[]>(canvas.components.map((c) => [c.id, [] as number[]]));
  const currentCurves = new Map<string, number[]>(canvas.components.map((c) => [c.id, [] as number[]]));
  let capacitorStates: ReadonlyMap<string, CapacitorState> = new Map(
    capacitors.map((c) => [c.id, { voltage: 0, current: 0 }]),
  );
  let inductorStates: ReadonlyMap<string, InductorState> = new Map(
    inductors.map((c) => [c.id, { current: 0, voltage: 0 }]),
  );
  let readings: ReadonlyMap<string, ComponentReading>;
  ({ capacitorStates, inductorStates, readings } = reseededStates(
    canvas,
    capacitors,
    inductors,
    capacitorStates,
    inductorStates,
    undefined,
    acSources,
    0,
  ));
  let previousContacts: ReadonlyMap<string, boolean> | undefined;

  for (let index = 0; index <= steps; index += 1) {
    const t = index * dt;
    times.push(t);
    for (const [id, state] of capacitorStates) curves.get(id)!.push(Math.abs(state.voltage));
    for (const [id, reading] of readings) {
      const voltageCurve = voltageCurves.get(id);
      const currentCurve = currentCurves.get(id);
      if (voltageCurve !== undefined) voltageCurve.push(reading.voltage);
      if (currentCurve !== undefined) currentCurve.push(reading.current);
    }
    if (index === steps) break;
    const contactStates = index >= toggleIndex && toggleIndex >= 0 ? toggled : undefined;
    if (contactStates !== previousContacts) {
      // топология сменилась: скачок тока должен дойти до интегратора
      ({ capacitorStates, inductorStates, readings } = reseededStates(
        canvas,
        capacitors,
        inductors,
        capacitorStates,
        inductorStates,
        contactStates,
        acSources,
        t,
      ));
      previousContacts = contactStates;
    }
    const solution = solveDc(canvas, {
      contactStates,
      capacitorStates,
      inductorStates,
      timeStep: dt,
      // ЭДС источников ~ берётся в целевом моменте шага: показания решения —
      // значения именно для t + dt, кривые ложатся на сетку без сдвига
      sourceEmfs: sourceEmfsAt(acSources, t + dt),
    });
    ({ capacitorStates, inductorStates, readings } = nextStates(
      capacitors,
      inductors,
      solution,
      capacitorStates,
      inductorStates,
    ));
  }

  return {
    times,
    capacitorVoltages: curves,
    timeConstants,
    componentVoltages: voltageCurves,
    componentCurrents: currentCurves,
  };
}

/**
 * Начальные состояния после смены топологии: конденсаторы держат напряжение,
 * катушки — ток (скачком не меняются ни то, ни другое), а их вторая величина
 * пересеивается из «нулевого» решения: при почти нулевом шаге компаньон
 * конденсатора — почти короткое замыкание (его ток совпадает с настоящим
 * током схемы), компаньон катушки — почти разрыв, держащий прежний ток и
 * честно показывающий новое напряжение на выводах. Трапеции нужны верные
 * ток и напряжение в точке переключения — с обнулёнными первый шаг теряет
 * ползаряда или полтока. Заодно возвращает показания всех Компонентов в этот
 * момент — начальная точка кривых.
 */
function reseededStates(
  canvas: CanvasState,
  capacitors: readonly PlacedComponent[],
  inductors: readonly PlacedComponent[],
  capacitorStates: ReadonlyMap<string, CapacitorState>,
  inductorStates: ReadonlyMap<string, InductorState>,
  contactStates: ReadonlyMap<string, boolean> | undefined,
  acSources: readonly PlacedComponent[],
  time: number,
): {
  capacitorStates: ReadonlyMap<string, CapacitorState>;
  inductorStates: ReadonlyMap<string, InductorState>;
  readings: ReadonlyMap<string, ComponentReading>;
} {
  const seededCapacitors = new Map(capacitorStates);
  const seededInductors = new Map(inductorStates);
  let probeReadings: ReadonlyMap<string, ComponentReading> = new Map();
  try {
    const probe = solveDc(canvas, {
      contactStates,
      capacitorStates,
      inductorStates,
      timeStep: INITIAL_STEP_SECONDS,
      sourceEmfs: sourceEmfsAt(acSources, time),
    });
    probeReadings = new Map(probe.readings.map((reading) => [reading.componentId, reading]));
    for (const capacitor of capacitors) {
      const reading = probeReadings.get(capacitor.id);
      const before = capacitorStates.get(capacitor.id);
      if (reading === undefined || before === undefined) continue;
      // напряжение держится прежним (компаньон почти замыкает накоротко),
      // а ток подставляется тот, который новая топология требует
      seededCapacitors.set(capacitor.id, { voltage: before.voltage, current: reading.current });
    }
    for (const inductor of inductors) {
      const reading = probeReadings.get(inductor.id);
      const before = inductorStates.get(inductor.id);
      if (reading === undefined || before === undefined) continue;
      // зеркально: ток держится прежним (компаньон почти разрывает цепь),
      // а напряжение подставляется то, которое новая топология требует
      seededInductors.set(inductor.id, { current: before.current, voltage: reading.voltage });
    }
  } catch {
    // «нулевое» решение не сошлось — остаются прежние состояния, кривая всё равно честная
  }
  return { capacitorStates: seededCapacitors, inductorStates: seededInductors, readings: probeReadings };
}

/** Мгновенные ЭДС источников ~: синус амплитуды на частоте Компонента. */
function sourceEmfsAt(
  acSources: readonly PlacedComponent[],
  time: number,
): ReadonlyMap<string, number> {
  return new Map(
    acSources.map((source) => [
      source.id,
      (source.voltage ?? defaultAcAmplitude) *
        Math.sin(2 * Math.PI * (source.frequency ?? defaultAcFrequency) * time),
    ]),
  );
}

/**
 * Значение кривой в момент time (линейная интерполяция между узлами сетки);
 * нет такой кривой или она пуста — null.
 */
export function valueAtTime(
  times: readonly number[],
  curve: readonly number[],
  time: number,
): number | null {
  if (curve.length === 0) return null;
  if (curve.length === 1) return curve[0];
  const dt = times[1] - times[0];
  const position = time / dt;
  const before = Math.max(0, Math.min(curve.length - 2, Math.floor(position)));
  const fraction = Math.max(0, Math.min(1, position - before));
  return curve[before] * (1 - fraction) + curve[before + 1] * fraction;
}

/**
 * Напряжение конденсатора в момент time (линейная интерполяция между узлами
 * сетки); нет такого конденсатора — null.
 */
export function voltageAt(
  solution: TransientSolution,
  capacitorId: string,
  time: number,
): number | null {
  const curve = solution.capacitorVoltages.get(capacitorId);
  if (curve === undefined) return null;
  return valueAtTime(solution.times, curve, time);
}

/**
 * Напряжение на Компоненте в момент time по кривой переходного режима —
 * график «до и после диода» и условия по форме сигнала читают его; нет
 * такого Компонента — null.
 */
export function componentVoltageAt(
  solution: TransientSolution,
  componentId: string,
  time: number,
): number | null {
  const curve = solution.componentVoltages.get(componentId);
  if (curve === undefined) return null;
  return valueAtTime(solution.times, curve, time);
}

/**
 * Состояния конденсаторов и катушек на следующем шаге: напряжение/ток — из
 * решения схемы; показания компаньонов уже считают свои уравнения по правилу
 * трапеций. Вместе с состояниями возвращаются показания всех Компонентов —
 * точки кривых следующего момента.
 */
function nextStates(
  capacitors: readonly PlacedComponent[],
  inductors: readonly PlacedComponent[],
  solution: DcSolution,
  previousCapacitors: ReadonlyMap<string, CapacitorState>,
  previousInductors: ReadonlyMap<string, InductorState>,
): {
  capacitorStates: ReadonlyMap<string, CapacitorState>;
  inductorStates: ReadonlyMap<string, InductorState>;
  readings: ReadonlyMap<string, ComponentReading>;
} {
  const readings = new Map(solution.readings.map((reading) => [reading.componentId, reading]));
  const capacitorStates = new Map(previousCapacitors);
  for (const capacitor of capacitors) {
    const before = previousCapacitors.get(capacitor.id);
    const reading = readings.get(capacitor.id);
    if (before === undefined || reading === undefined) continue;
    capacitorStates.set(capacitor.id, { voltage: reading.voltage, current: reading.current });
  }
  const inductorStates = new Map(previousInductors);
  for (const inductor of inductors) {
    const before = previousInductors.get(inductor.id);
    const reading = readings.get(inductor.id);
    if (before === undefined || reading === undefined) continue;
    inductorStates.set(inductor.id, { current: reading.current, voltage: reading.voltage });
  }
  return { capacitorStates, inductorStates, readings };
}

/**
 * Постоянная времени: сопротивление Thevenin вокруг конденсатора × ёмкость.
 * Источники ЭДС гасятся, прочие конденсаторы заменяются коротким замыканием —
 * напряжение на них не может измениться мгновенно, и именно так они ведут
 * себя в первый момент.
 */
function timeConstantOf(
  canvas: CanvasState,
  capacitor: PlacedComponent,
  contactStates: ReadonlyMap<string, boolean> | undefined,
): number {
  try {
    const probe = solveDc(canvas, {
      contactStates,
      theveninProbeOf: capacitor.id,
      capacitorStates: new Map(
        canvas.components
          .filter((component) => component.kind === 'capacitor')
          .map((component) => [component.id, { voltage: 0, current: 0 }]),
      ),
      timeStep: INITIAL_STEP_SECONDS,
    });
    const reading = readingOf(probe, capacitor.id);
    const resistance = Math.abs(reading?.voltage ?? 0);
    if (resistance >= NO_PATH_RESISTANCE) return Number.POSITIVE_INFINITY;
    const tau = resistance * (capacitor.capacitance ?? defaultCapacitance);
    return Number.isFinite(tau) ? tau : Number.POSITIVE_INFINITY;
  } catch {
    // проба врезалась в сингулярную матрицу — резистивного пути нет
    return Number.POSITIVE_INFINITY;
  }
}
