import { describe, expect, it } from 'vitest';
import { course } from './course';
import { module1, module1Palette } from './m1';
import { module2 } from './m2';
import { isComponentKind, type CanvasState, type ComponentKind, type PlacedComponent, type Wire } from '../domain/canvas';
import { defaultValuesOf } from '../domain/canvas';
import type { CourseModule } from '../domain/course';
import type {
  ChoiceQuestion,
  CircuitCondition,
  CircuitTask,
  NumericQuestion,
  Task,
} from '../domain/task';
import { checkConditions } from '../domain/circuitConditions';
import { solveDc } from '../domain/simulator';
import { evaluate } from '../domain/evaluate';
import { emptyProgress, progressReducer, sandboxPaletteOf } from '../domain/course';

/**
 * Контент-линтер (тикет 12): структурные гарантии всего Курса. Каждый Вопрос —
 * с Разбором (у выбора — на каждый вариант), каждое Схема-задание — с
 * условиями-измерениями и минимум двумя ступенями Подсказок, заглушек не
 * осталось. Отдельная секция проверяет объём М1 и доказывает решаемость
 * каждого его Схема-задания эталон-решением: эталон — не про проверку
 * ученика (ADR-0001), а про тестирование самого контента.
 */

const PLACEHOLDER_RE = /(TODO|FIXME|LOREM|PLACEHOLDER|ЗАГЛУШК|\?\?\?)/i;

const MEASUREMENT_KINDS = new Set([
  'current-through',
  'voltage-across',
  'power-of',
  'component-active',
  'rc-time-constant',
  'capacitor-voltage-at',
]);

/** Условия, которым нужен переходный режим в Задании. */
const TRANSIENT_KINDS = new Set(['rc-time-constant', 'capacitor-voltage-at']);

function questionsOf(module: CourseModule): Task[] {
  return module.tasks.filter((task) => task.kind !== 'circuit-task');
}

function circuitTasksOf(module: CourseModule): CircuitTask[] {
  return module.tasks.filter((task): task is CircuitTask => task.kind === 'circuit-task');
}

function isMeasurement(condition: CircuitCondition): boolean {
  return MEASUREMENT_KINDS.has(condition.kind);
}

function assertNonEmpty(value: string, where: string): void {
  expect(value.trim().length, `${where}: текст пуст`).toBeGreaterThan(0);
}

describe('Линтер: модули и идентификаторы', () => {
  it('идентификаторы модулей уникальны и непусты', () => {
    const ids = course.modules.map((module) => module.id);
    for (const id of ids) assertNonEmpty(id, 'идентификатор Модуля');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('модуль не пуст: есть Теория и Задания (гарантия для блокировки Курса)', () => {
    for (const module of course.modules) {
      expect(module.theory.length, `в Модуле ${module.id} нет Теории`).toBeGreaterThan(0);
      expect(module.tasks.length, `в Модуле ${module.id} нет Заданий`).toBeGreaterThan(0);
    }
  });

  it('идентификаторы Заданий уникальны во всём Курсе', () => {
    const ids = course.modules.flatMap((module) => module.tasks.map((task) => task.id));
    for (const id of ids) assertNonEmpty(id, 'идентификатор Задания');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('карточки Теории заполнены и имеют уникальные идентификаторы', () => {
    for (const module of course.modules) {
      const ids = module.theory.map((card) => card.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const card of module.theory) {
        assertNonEmpty(card.title, `карточка ${card.id}: заголовок`);
        expect(card.paragraphs.length, `карточка ${card.id}: нет текста`).toBeGreaterThan(0);
        for (const paragraph of card.paragraphs) {
          assertNonEmpty(paragraph, `карточка ${card.id}: абзац`);
        }
      }
    }
  });

  it('Экзамен — последнее Схема-задание Модуля, и он один', () => {
    for (const module of course.modules) {
      const exams = module.tasks.filter((task) => task.kind === 'circuit-task' && task.isExam);
      expect(exams.length, `в Модуле ${module.id} Экзамен не один`).toBeLessThanOrEqual(1);
      const last = module.tasks[module.tasks.length - 1];
      if (exams.length > 0) {
        expect(last.kind === 'circuit-task' && last.isExam, `в Модуле ${module.id} Экзамен не последний`).toBe(true);
      }
    }
  });
});

describe('Линтер: Вопросы', () => {
  it('у Вопроса с выбором — не меньше двух вариантов, корректный верный и Разбор на каждый', () => {
    for (const module of course.modules) {
      for (const task of module.tasks) {
        if (task.kind !== 'choice-question') continue;
        const question = task as ChoiceQuestion;
        const where = `Вопрос ${question.id}`;
        assertNonEmpty(question.prompt, where);
        expect(question.choices.length, `${where}: меньше двух вариантов`).toBeGreaterThanOrEqual(2);
        const choiceIds = question.choices.map((choice) => choice.id);
        expect(new Set(choiceIds).size, `${where}: варианты не уникальны`).toBe(choiceIds.length);
        expect(
          choiceIds,
          `${where}: correctChoiceId «${question.correctChoiceId}» не среди вариантов`,
        ).toContain(question.correctChoiceId);
        for (const choice of question.choices) {
          assertNonEmpty(choice.text, `${where}: вариант ${choice.id}`);
          assertNonEmpty(choice.razbor, `${where}: Разбор варианта ${choice.id}`);
        }
      }
    }
  });

  it('у числового Вопроса — Разбор, пошаговое решение и здравый эталон', () => {
    for (const module of course.modules) {
      for (const task of module.tasks) {
        if (task.kind !== 'numeric-question') continue;
        const question = task as NumericQuestion;
        const where = `Вопрос ${question.id}`;
        assertNonEmpty(question.prompt, where);
        assertNonEmpty(question.razbor, `${where}: Разбор`);
        expect(question.solutionSteps.length, `${where}: решение не пошаговое`).toBeGreaterThanOrEqual(2);
        for (const step of question.solutionSteps) assertNonEmpty(step, `${where}: шаг решения`);
        expect(Number.isFinite(question.expectedValue), `${where}: эталон не число`).toBe(true);
        if (question.tolerance !== undefined) {
          expect(question.tolerance, `${where}: допуск вне (0; 0.5]`).toBeGreaterThan(0);
          expect(question.tolerance, `${where}: допуск вне (0; 0.5]`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  });

  it('ступени Подсказок, где заданы, непусты', () => {
    for (const module of course.modules) {
      for (const task of module.tasks) {
        if (!task.hints) continue;
        const where = `Задание ${task.id}`;
        assertNonEmpty(task.hints.question, `${where}: подсказка-вопрос`);
        assertNonEmpty(task.hints.almostSolution, `${where}: почти решение`);
      }
    }
  });
});

describe('Линтер: Схема-задания', () => {
  it('Палитра непуста и состоит из известных Компонентов', () => {
    for (const module of course.modules) {
      for (const task of circuitTasksOf(module)) {
        expect(task.palette.length, `Задание ${task.id}: пустая Палитра`).toBeGreaterThan(0);
        for (const kind of task.palette) {
          expect(isComponentKind(kind), `Задание ${task.id}: неизвестный вид «${kind}»`).toBe(true);
        }
      }
    }
  });

  it('условия есть, и среди них — измерение, а не только топология', () => {
    for (const module of course.modules) {
      for (const task of circuitTasksOf(module)) {
        expect(task.conditions.length, `Задание ${task.id}: нет условий`).toBeGreaterThan(0);
        expect(
          task.conditions.some(isMeasurement),
          `Задание ${task.id}: только структурные условия, измерений нет`,
        ).toBe(true);
      }
    }
  });

  it('границы измерений конечны, упорядочены и строго положительны', () => {
    for (const module of course.modules) {
      for (const task of circuitTasksOf(module)) {
        for (const condition of task.conditions) {
          if (!('range' in condition)) continue;
          const { from, to } = condition.range;
          const where = `Задание ${task.id}, условие ${condition.kind}`;
          expect(Number.isFinite(from), where).toBe(true);
          expect(Number.isFinite(to), where).toBe(true);
          // Нулевая нижняя граница проходила бы и на мёртвой схеме: 0 В на
          // отсоединённом Компоненте попал бы в диапазон [0; …].
          expect(from, `${where}: нижняя граница должна быть больше нуля`).toBeGreaterThan(0);
          expect(from, `${where}: границы перепутаны`).toBeLessThanOrEqual(to);
        }
      }
    }
  });

  it('у каждого Схема-задания — минимум две ступени Подсказок', () => {
    for (const module of course.modules) {
      for (const task of circuitTasksOf(module)) {
        const where = `Задание ${task.id}`;
        expect(task.hints, `${where}: нет Подсказок`).toBeDefined();
        assertNonEmpty(task.hints!.question, `${where}: подсказка-вопрос`);
        assertNonEmpty(task.hints!.almostSolution, `${where}: почти решение`);
      }
    }
  });

  it('условия во времени требуют переходный режим, а план Задания здрав', () => {
    for (const module of course.modules) {
      for (const task of circuitTasksOf(module)) {
        const where = `Задание ${task.id}`;
        const needsTransient = task.conditions.some((condition) => TRANSIENT_KINDS.has(condition.kind));
        if (needsTransient) {
          expect(task.transient, `${where}: условие во времени без плана переходного режима`).toBeDefined();
        }
        if (task.transient === undefined) continue;
        expect(
          Number.isFinite(task.transient.duration) && task.transient.duration > 0,
          `${where}: длительность переходного режима должна быть положительной`,
        ).toBe(true);
        if (task.transient.switchToggleTime !== undefined) {
          const at = task.transient.switchToggleTime;
          expect(
            Number.isFinite(at) && at >= 0 && at < task.transient.duration,
            `${where}: момент переключения должен лежать внутри плана`,
          ).toBe(true);
        }
        for (const condition of task.conditions) {
          if (condition.kind !== 'capacitor-voltage-at') continue;
          expect(
            Number.isFinite(condition.time) && condition.time > 0 && condition.time <= task.transient.duration,
            `${where}: момент измерения напряжения должен лежать внутри плана`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('Линтер: заглушек не осталось', () => {
  function* stringsOfTask(task: Task): Iterable<string> {
    yield task.prompt;
    if (task.hints) {
      yield task.hints.question;
      yield task.hints.almostSolution;
    }
    if (task.kind === 'choice-question') {
      for (const choice of task.choices) {
        yield choice.text;
        yield choice.razbor;
      }
    }
    if (task.kind === 'numeric-question') {
      yield task.razbor;
      yield* task.solutionSteps;
    }
  }

  function* stringsOfModule(module: CourseModule): Iterable<string> {
    yield module.title;
    yield module.summary;
    for (const card of module.theory) {
      yield card.title;
      yield* card.paragraphs;
      for (const formula of card.formulas ?? []) {
        yield formula.text;
        if (formula.caption) yield formula.caption;
      }
    }
    for (const task of module.tasks) yield* stringsOfTask(task);
  }

  it('ни в одной пользовательской строке Курса нет маркеров заглушки', () => {
    for (const module of course.modules) {
      for (const text of stringsOfModule(module)) {
        expect(text, `маркер заглушки в строке: «${text.slice(0, 60)}…»`).not.toMatch(PLACEHOLDER_RE);
      }
    }
  });
});

describe('Объём контента М1 (тикет 12)', () => {
  it('четыре темы Теории', () => {
    expect(module1.theory).toHaveLength(4);
  });

  it('от 12 до 16 Вопросов обоих видов', () => {
    const questions = questionsOf(module1);
    expect(questions.length).toBeGreaterThanOrEqual(12);
    expect(questions.length).toBeLessThanOrEqual(16);
    expect(questions.some((task) => task.kind === 'choice-question')).toBe(true);
    expect(questions.some((task) => task.kind === 'numeric-question')).toBe(true);
  });

  it('от 5 до 7 Схема-заданий и ровно один Экзамен', () => {
    const circuits = circuitTasksOf(module1);
    expect(circuits.filter((task) => !task.isExam).length).toBeGreaterThanOrEqual(5);
    expect(circuits.filter((task) => !task.isExam).length).toBeLessThanOrEqual(7);
    expect(circuits.filter((task) => task.isExam)).toHaveLength(1);
  });
});

/** Компонент с номиналами по умолчанию и заданными правками. */
function comp(id: string, kind: ComponentKind, values: Partial<PlacedComponent> = {}): PlacedComponent {
  return { id, kind, x: 0, y: 0, rotation: 0, ...defaultValuesOf(kind), ...values };
}

/** Последовательное кольцо: вывод 1 каждого Компонента — с выводом 0 следующего. */
function ring(...components: readonly PlacedComponent[]): CanvasState {
  const wires: Wire[] = components.map((component, index) => {
    const next = components[(index + 1) % components.length];
    return {
      id: `w${index + 1}`,
      from: { componentId: component.id, pin: 1 },
      to: { componentId: next.id, pin: 0 },
    };
  });
  return { components: [...components], wires };
}

/** Схема-задание Модуля по идентификатору. */
function circuitTaskIn(module: CourseModule, id: string): CircuitTask {
  const task = module.tasks.find(
    (candidate): candidate is CircuitTask => candidate.kind === 'circuit-task' && candidate.id === id,
  );
  if (!task) throw new Error(`фикстура: нет Схема-задания «${id}»`);
  return task;
}

/**
 * Эталон-схема проходит все условия Задания через главный шов evaluate:
 * вердикт строится тем же путём, что и для ответа ученика (переходный
 * режим, Диагнозы и переключение ключей — всё как в живом приложении).
 */
function assertSolvable(task: CircuitTask, canvas: CanvasState): void {
  const verdict = evaluate(task, { kind: 'circuit-answer', canvas });
  if (verdict.kind !== 'circuit-task') throw new Error('фикстура: ожидался вердикт Схема-задания');
  const failed = verdict.conditionChecks.filter((check) => !check.passed).map((check) => check.text);
  expect(failed, `Задание ${task.id} должно решаться эталон-схемой`).toEqual([]);
}

describe('Схема-задания М1 решаемы: эталон-решения проходят все условия', () => {
  /** Параллельные ветви на батарее: каждый Компонент висит на её выводах. */
  function parallelTo(base: PlacedComponent, branches: readonly PlacedComponent[]): CanvasState {
    const wires: Wire[] = branches.flatMap((component, index) => [
      { id: `w${index}a`, from: { componentId: base.id, pin: 0 }, to: { componentId: component.id, pin: 0 } },
      { id: `w${index}b`, from: { componentId: base.id, pin: 1 }, to: { componentId: component.id, pin: 1 } },
    ]);
    return { components: [base, ...branches], wires };
  }

  function circuitTaskOf(id: string): CircuitTask {
    return circuitTaskIn(module1, id);
  }

  it('первая цепь: батарея, замкнутый выключатель, лампочка', () => {
    assertSolvable(
      circuitTaskOf('m1-first-circuit'),
      ring(comp('bat', 'battery'), comp('sw', 'switch', { closed: true }), comp('lamp', 'lamp')),
    );
  });

  it('ток по расчёту: резистор 900 Ом на батарее', () => {
    assertSolvable(
      circuitTaskOf('m1-target-current'),
      ring(comp('bat', 'battery'), comp('r1', 'resistor', { resistance: 900 })),
    );
  });

  it('две лампы последовательно: напряжение делится пополам', () => {
    assertSolvable(
      circuitTaskOf('m1-series-lamps'),
      ring(comp('bat', 'battery'), comp('lamp1', 'lamp'), comp('lamp2', 'lamp')),
    );
  });

  it('две лампы параллельно: токи ветвей складываются', () => {
    assertSolvable(
      circuitTaskOf('m1-parallel-lamps'),
      parallelTo(comp('bat', 'battery'), [comp('lamp1', 'lamp'), comp('lamp2', 'lamp')]),
    );
  });

  it('делитель: два резистора по 1 кОм делят 9 В пополам', () => {
    assertSolvable(
      circuitTaskOf('m1-divider-task'),
      ring(comp('bat', 'battery'), comp('r1', 'resistor'), comp('r2', 'resistor')),
    );
  });

  it('моторчик с токоограничивающим резистором', () => {
    assertSolvable(
      circuitTaskOf('m1-motor-task'),
      ring(comp('bat', 'battery'), comp('r1', 'resistor', { resistance: 68 }), comp('motor', 'motor')),
    );
  });

  it('Экзамен: лампа с током 40–60 мА и деление напряжения с резистором', () => {
    assertSolvable(
      circuitTaskOf('m1-exam'),
      ring(
        comp('bat', 'battery'),
        comp('sw', 'switch', { closed: true }),
        comp('r1', 'resistor', { resistance: 68 }),
        comp('lamp', 'lamp'),
      ),
    );
  });

  it('эталон-схемы не проходят чужие Задания (условия действительно измеряют своё)', () => {
    // Схема первой цепи (одна лампа, ток ≈75 мА) не должна закрыть делитель:
    // у условия делителя два резистора, а здесь один.
    const borrowed = ring(comp('bat', 'battery'), comp('sw', 'switch', { closed: true }), comp('lamp', 'lamp'));
    const failed = checkConditions(borrowed, solveDc(borrowed), circuitTaskOf('m1-divider-task').conditions);
    expect(failed.some((check) => !check.passed)).toBe(true);
  });
});

describe('Схема-задания М2 решаемы: эталон-решения проходят все условия (тикет 13)', () => {
  function circuitTaskOf(id: string): CircuitTask {
    return circuitTaskIn(module2, id);
  }

  /**
   * Кольцо с прямым включением диода: «плюс» батареи — на вывод 0 (анод)
   * первого Компонента, дальше по цепочке к «минусу». В обычном ring() ток
   * входит в каждый Компонент со стороны вывода 1 — диоды там заперты.
   */
  function forwardRing(a: PlacedComponent, b: PlacedComponent): CanvasState {
    const battery = comp('bat', 'battery');
    return {
      components: [a, b, battery],
      wires: [
        { id: 'w1', from: { componentId: 'bat', pin: 0 }, to: { componentId: a.id, pin: 0 } },
        { id: 'w2', from: { componentId: a.id, pin: 1 }, to: { componentId: b.id, pin: 0 } },
        { id: 'w3', from: { componentId: b.id, pin: 1 }, to: { componentId: 'bat', pin: 1 } },
      ],
    };
  }

  it('«зажги светодиод»: светодиод + резистор 1 кОм в прямом включении дают ток в границах', () => {
    assertSolvable(
      circuitTaskOf('m2-led-resistor'),
      forwardRing(comp('led', 'led'), comp('r1', 'resistor')),
    );
  });

  it('«зажги светодиод»: обратное включение светодиода решение не проходит (направление измеряется)', () => {
    const canvas = ring(comp('led', 'led', { color: 'red' }), comp('bat', 'battery'), comp('r1', 'resistor'));
    const failed = checkConditions(canvas, solveDc(canvas), circuitTaskOf('m2-led-resistor').conditions);
    expect(failed.some((check) => !check.passed)).toBe(true);
  });

  it('диод в прямом направлении: ток в границах с резистором по умолчанию', () => {
    assertSolvable(
      circuitTaskOf('m2-diode-forward'),
      forwardRing(comp('d', 'diode'), comp('r1', 'resistor')),
    );
  });

  it('«заряди конденсатор к сроку»: резистор 19 кОм даёт τ = 1,9 с и ≈ 6,6 В к моменту t = 3 с', () => {
    // ключ нарисован разомкнутым — переходный режим сам замыкает его в t = 0,5 с
    assertSolvable(
      circuitTaskOf('m2-capacitor-charge'),
      ring(
        comp('sw', 'switch', { closed: false }),
        comp('r1', 'resistor', { resistance: 19_000 }),
        comp('c', 'capacitor'),
        comp('bat', 'battery'),
      ),
    );
  });

  it('«заряди конденсатор к сроку»: резистор по умолчанию (1 кОм) решение не проходит — τ измеряется', () => {
    // слишком быстрый заряд: конденсатор уже полон задолго до контрольного момента
    const canvas = ring(
      comp('sw', 'switch', { closed: false }),
      comp('r1', 'resistor'),
      comp('c', 'capacitor'),
      comp('bat', 'battery'),
    );
    const verdict = evaluate(circuitTaskOf('m2-capacitor-charge'), { kind: 'circuit-answer', canvas });
    if (verdict.kind !== 'circuit-task') throw new Error('фикстура: ожидался вердикт Схема-задания');
    expect(verdict.outcome).not.toBe('correct');
    expect(verdict.conditionChecks.some((check) => !check.passed)).toBe(true);
  });
});

describe('Палитра М2 привязана к Прогрессу (тикет 13)', () => {
  /** Прогресс, в котором перечисленные Задания пройдены. */
  function passed(...taskIds: readonly string[]) {
    return taskIds.reduce(
      (progress, taskId) => progressReducer(progress, { type: 'task-passed', taskId }),
      emptyProgress,
    );
  }

  it('пока М1 не пройдена, Компонентов М2 в открытой Палитре нет', () => {
    const palette = sandboxPaletteOf(course, emptyProgress);
    // Палитра М1 целиком (порядок — по объявлениям Палитр Заданий)
    expect([...palette].sort()).toEqual([...module1Palette].sort());
    expect(palette).not.toContain('diode');
    expect(palette).not.toContain('led');
  });

  it('Модуль М2 открылся — диод и светодиод приходят в Песочницу', () => {
    const progress = passed(...module1.tasks.map((task) => task.id));
    const palette = sandboxPaletteOf(course, progress);
    expect(palette).toContain('led');
    expect(palette).toContain('diode');
    // пройденные Модули свои Компоненты не теряют
    expect(module1Palette.every((kind: ComponentKind) => palette.includes(kind))).toBe(true);
  });

  it('Палитра Модуля М2 — его Схема-задания объявляют диод и светодиод', () => {
    const palette = sandboxPaletteOf(course, passed(...course.modules.flatMap((m) => m.tasks.map((t) => t.id))));
    expect(palette.filter((kind) => kind === 'diode' || kind === 'led')).toEqual(['led', 'diode']);
  });
});
