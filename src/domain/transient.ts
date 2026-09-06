/**
 * Переходный Симулятор (CONTEXT.md: Симулятор, тикет 14): напряжение
 * конденсаторов во времени. Схема решается шагами трапецеидального
 * интегрирования: на каждом шаге конденсатор подменяется компаньоном —
 * сопротивлением Δt/2C с ЭДС v + i·Δt/2C (эквивалент Нортона, как у батареи),
 * и solveDc дает узловые потенциалы следующего момента. Коммутаторы
 * переключаются в заданный планом момент: каждый переводится в противоположное
 * нарисованному состояние. Постоянная времени — сопротивление Thevenin,
 * которое конденсатор видит вокруг (источники погашены), умноженное на ёмкость.
 * Чистый TypeScript без DOM.
 */
import { defaultCapacitance, type CanvasState, type PlacedComponent } from './canvas';
import { solveDc, type CapacitorState, type DcSolution } from './simulator';
import type { TransientPlan } from './task';

/**
 * Решение переходного режима: моменты времени (с, равномерная сетка от 0
 * до плана) и кривые напряжения (В, модуль — ориентация символа на Холсте
 * не должна пугать ученика) по каждому конденсатору Холста. Постоянные
 * времени (с) считаются для конечного состояния схемы — после всех
 * переключений; нет резистивного пути — бесконечность.
 */
export interface TransientSolution {
  readonly times: readonly number[];
  readonly capacitorVoltages: ReadonlyMap<string, readonly number[]>;
  readonly timeConstants: ReadonlyMap<string, number>;
}

/** Минимальное число шагов на план: грубая сетка для медленных цепей. */
const MIN_STEPS = 120;
/** Предельное число шагов: защита решателя от вырожденно малых τ. */
const MAX_STEPS = 6000;
/** Шаг мельче двадцатой доли самой быстрой постоянной времени не нужен. */
const STEPS_PER_TAU = 20;
/** Сопротивление пробы выше этого — резистивного пути нет (разомкнут контакт). */
const NO_PATH_RESISTANCE = 1e8;
/**
 * Шаг «нулевого» решения: конденсатор-компаньон с таким шагом — почти
 * короткое замыкание с нулевой ЭДС, и ток компаньона из показания —
 * настоящий ток схемы. Трапеции нужен верный ток в момент переключения
 * (и в начале времени): с обнулённым первый шаг теряет ползаряда.
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
 * Решает переходный режим по плану. Конденсаторы стартуют незаряженными;
 * схема, где конденсатору не от чего зарядиться, честно даёт нулевую кривую.
 */
export function solveTransient(canvas: CanvasState, plan: TransientPlan): TransientSolution {
  const capacitors = canvas.components.filter((component) => component.kind === 'capacitor');
  const toggled = plan.switchToggleTime !== undefined ? toggledContactStates(canvas) : undefined;
  const timeConstants = new Map(
    capacitors.map((c) => [c.id, timeConstantOf(canvas, c, toggled)]),
  );

  const finite = [...timeConstants.values()].filter((tau) => Number.isFinite(tau));
  const fastest = finite.length > 0 ? Math.min(...finite) : Number.POSITIVE_INFINITY;
  const stepMax = Math.min(plan.duration / MIN_STEPS, fastest / STEPS_PER_TAU, plan.duration);
  const { steps, toggleIndex } = planSteps(plan, stepMax);
  const dt = plan.duration / steps;

  const times: number[] = [];
  const curves = new Map<string, number[]>(capacitors.map((c) => [c.id, [] as number[]]));
  let states: ReadonlyMap<string, CapacitorState> = reseededStates(
    canvas,
    capacitors,
    new Map(capacitors.map((c) => [c.id, { voltage: 0, current: 0 }])),
    undefined,
  );
  let previousContacts: ReadonlyMap<string, boolean> | undefined;

  for (let index = 0; index <= steps; index += 1) {
    const t = index * dt;
    times.push(t);
    for (const [id, state] of states) curves.get(id)!.push(Math.abs(state.voltage));
    if (index === steps) break;
    const contactStates = index >= toggleIndex && toggleIndex >= 0 ? toggled : undefined;
    if (contactStates !== previousContacts) {
      // топология сменилась: скачок тока должен дойти до интегратора
      states = reseededStates(canvas, capacitors, states, contactStates);
      previousContacts = contactStates;
    }
    const solution = solveDc(canvas, { contactStates, capacitorStates: states, timeStep: dt });
    states = nextStates(capacitors, solution, states);
  }

  return { times, capacitorVoltages: curves, timeConstants };
}

/**
 * Начальные состояния: конденсаторы незаряжены, а их начальные токи —
 * из «нулевого» решения (при нулевом напряжении и почти нулевом
 * сопротивлении компаньона ток совпадает с настоящим начальным током).
 */
/**
 * Начальные состояния: конденсаторы незаряжены, а их начальные токи — из
 * «нулевого» решения: при нулевом напряжении и почти нулевом сопротивлении
 * компаньона его ток совпадает с настоящим током схемы. Трапеции нужен
 * верный i₀ — с нулевым первый шаг теряет ползаряда, и кривая съезжает.
 * Тем же приёмом токи пересеиваются после переключения коммутаторов:
 * скачок тока через конденсатор обязан дойти до интегратора.
 */
function reseededStates(
  canvas: CanvasState,
  capacitors: readonly PlacedComponent[],
  states: ReadonlyMap<string, CapacitorState>,
  contactStates: ReadonlyMap<string, boolean> | undefined,
): ReadonlyMap<string, CapacitorState> {
  const seeded = new Map(states);
  try {
    const probe = solveDc(canvas, {
      contactStates,
      capacitorStates: states,
      timeStep: INITIAL_STEP_SECONDS,
    });
    for (const capacitor of capacitors) {
      const reading = probe.readings.find((candidate) => candidate.componentId === capacitor.id);
      const before = states.get(capacitor.id);
      if (reading === undefined || before === undefined) continue;
      // напряжение держится прежним (компаньон почти замыкает накоротко),
      // а ток подставляется тот, который новая топология требует
      seeded.set(capacitor.id, { voltage: before.voltage, current: reading.current });
    }
  } catch {
    // «нулевое» решение не сошлось — остаются прежние токи, кривая всё равно честная
  }
  return seeded;
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
  if (curve === undefined || curve.length === 0) return null;
  if (curve.length === 1) return curve[0];
  const dt = solution.times[1] - solution.times[0];
  const position = time / dt;
  const before = Math.max(0, Math.min(curve.length - 2, Math.floor(position)));
  const fraction = Math.max(0, Math.min(1, position - before));
  return curve[before] * (1 - fraction) + curve[before + 1] * fraction;
}

/**
 * Состояния конденсаторов на следующем шаге: напряжение и ток — из решения
 * схемы; показание компаньона уже считает ток по уравнению трапеций.
 */
function nextStates(
  capacitors: readonly PlacedComponent[],
  solution: DcSolution,
  previous: ReadonlyMap<string, CapacitorState>,
): ReadonlyMap<string, CapacitorState> {
  const next = new Map<string, CapacitorState>();
  for (const capacitor of capacitors) {
    const before = previous.get(capacitor.id);
    if (before === undefined) continue;
    const reading = solution.readings.find((candidate) => candidate.componentId === capacitor.id);
    if (reading === undefined) {
      next.set(capacitor.id, before);
      continue;
    }
    next.set(capacitor.id, { voltage: reading.voltage, current: reading.current });
  }
  return next;
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
    const reading = probe.readings.find((candidate) => candidate.componentId === capacitor.id);
    const resistance = Math.abs(reading?.voltage ?? 0);
    if (resistance >= NO_PATH_RESISTANCE) return Number.POSITIVE_INFINITY;
    const tau = resistance * (capacitor.capacitance ?? defaultCapacitance);
    return Number.isFinite(tau) ? tau : Number.POSITIVE_INFINITY;
  } catch {
    // проба врезалась в сингулярную матрицу — резистивного пути нет
    return Number.POSITIVE_INFINITY;
  }
}
