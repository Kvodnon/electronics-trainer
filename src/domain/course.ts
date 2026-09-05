/**
 * Курс и Прогресс домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Курс, Модуль, Теория, Задание, Прогресс.
 */
import type { Task } from './task';

/**
 * Состояние Задания в Прогрессе:
 * не начато / пройдено / вернулось на повтор (после ошибки, до решения).
 */
export type TaskState = 'not-started' | 'passed' | 'returned-for-retry';

/** Действие ученика, меняющее Прогресс. */
export type CourseAction =
  | { readonly type: 'task-passed'; readonly taskId: string }
  | { readonly type: 'task-returned-for-retry'; readonly taskId: string };

/** Прогресс — состояние прохождения Курса: какие Задания пройдены. */
export interface CourseProgress {
  /** Ключ — идентификатор Задания. Отсутствие записи — «не начато». */
  readonly taskStates: Readonly<Record<string, TaskState>>;
}

/** Прогресс без единого ответа. */
export const emptyProgress: CourseProgress = { taskStates: {} };

/** Редьюсер Курса: чистая функция переходов Прогресса. */
export function progressReducer(progress: CourseProgress, action: CourseAction): CourseProgress {
  switch (action.type) {
    case 'task-passed':
      return withTaskState(progress, action.taskId, 'passed');
    case 'task-returned-for-retry': {
      // «Пройдено» терминально: повтор грозит только непройденным Заданиям.
      if (taskStateOf(progress, action.taskId) === 'passed') return progress;
      return withTaskState(progress, action.taskId, 'returned-for-retry');
    }
  }
}

function withTaskState(
  progress: CourseProgress,
  taskId: string,
  state: TaskState,
): CourseProgress {
  if (progress.taskStates[taskId] === state) return progress;
  return { taskStates: { ...progress.taskStates, [taskId]: state } };
}

/** Состояние Задания в Прогрессе; отсутствие записи — «не начато». */
export function taskStateOf(progress: CourseProgress, taskId: string): TaskState {
  return progress.taskStates[taskId] ?? 'not-started';
}

/** Итоги Модуля по Прогрессу. */
export interface ModuleProgress {
  readonly total: number;
  readonly passed: number;
  readonly returnedForRetry: number;
  /** Все Задания Модуля пройдены — Модуль завершён. */
  readonly completed: boolean;
}

/** Прогресс по конкретному Модулю Курса. */
export function moduleProgressOf(module: CourseModule, progress: CourseProgress): ModuleProgress {
  let passed = 0;
  let returnedForRetry = 0;
  for (const задание of module.tasks) {
    const state = taskStateOf(progress, задание.id);
    if (state === 'passed') passed += 1;
    if (state === 'returned-for-retry') returnedForRetry += 1;
  }
  return {
    total: module.tasks.length,
    passed,
    returnedForRetry,
    // Пустой Модуль завершён «пусто»: иначе он заблокировал бы Курс навсегда.
    // Непустоту Модулей гарантирует контент-линтер (тикет 12).
    completed: passed === module.tasks.length,
  };
}

/** Модуль, который ещё не пройден и потому держит данный Модуль закрытым. */
export function blockingModuleOf(
  course: CourseData,
  progress: CourseProgress,
  moduleId: string,
): CourseModule | null {
  const index = course.modules.findIndex((module) => module.id === moduleId);
  if (index === -1) {
    throw new Error(`Курс не содержит Модуль «${moduleId}»`);
  }
  return (
    course.modules
      .slice(0, index)
      .find((module) => !moduleProgressOf(module, progress).completed) ?? null
  );
}

/** Заблокирован ли Модуль: следующий Модуль закрыт, пока не пройден предыдущий. */
export function isModuleLocked(
  course: CourseData,
  progress: CourseProgress,
  moduleId: string,
): boolean {
  return blockingModuleOf(course, progress, moduleId) !== null;
}

/**
 * Очередь Заданий Модуля: не начатые — в порядке Модуля, за ними вернувшиеся
 * на повтор. Пройденные в очередь не попадают; пустая очередь — Модуль завершён.
 */
export function moduleTaskQueue(module: CourseModule, progress: CourseProgress): readonly Task[] {
  const fresh: Task[] = [];
  const retry: Task[] = [];
  for (const задание of module.tasks) {
    const state = taskStateOf(progress, задание.id);
    if (state === 'not-started') fresh.push(задание);
    if (state === 'returned-for-retry') retry.push(задание);
  }
  return [...fresh, ...retry];
}

/*
 * Модель контента Курса: структурированные данные в TypeScript-модулях
 * (см. spec: «контент Заданий, Теории и Модулей»).
 */

/** Идентификатор условного обозначения Компонента; отрисовка — слой UI. */
export type ComponentSymbolId = 'resistor' | 'dc-source' | 'capacitor';

/** Формула на карточке Теории. */
export interface Formula {
  /** Запись формулы, например «I = U / R». */
  readonly text: string;
  /** Что означает формула или как ею пользоваться. */
  readonly caption?: string;
}

/** Карточка Теории: короткий обучающий экран перед Заданиями темы. */
export interface TheoryCard {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly formulas?: readonly Formula[];
  /** Условные обозначения Компонентов — показываются в двух стандартах рядом. */
  readonly symbols?: readonly ComponentSymbolId[];
}

/** Модуль — самостоятельный этап Курса: Теория, затем Задания. */
export interface CourseModule {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly theory: readonly TheoryCard[];
  readonly tasks: readonly Task[];
}

/** Курс — линейная последовательность Модулей. */
export interface CourseData {
  readonly modules: readonly CourseModule[];
}
