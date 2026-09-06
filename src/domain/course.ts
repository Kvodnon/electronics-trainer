/**
 * Курс и Прогресс домен-слоя. Чистый TypeScript: без DOM и без зависимости от React.
 * Термины — по CONTEXT.md: Курс, Модуль, Теория, Задание, Прогресс.
 */
import type { ComponentKind } from './canvas';
import type { CircuitTask, Task } from './task';

/**
 * Состояние Задания в Прогрессе:
 * не начато / пройдено / вернулось на повтор (после ошибки, до решения).
 */
export type TaskState = 'not-started' | 'passed' | 'returned-for-retry';

/** Действие ученика (или самого Тренажёра), меняющее Прогресс. */
export type CourseAction =
  | { readonly type: 'task-passed'; readonly taskId: string }
  | { readonly type: 'task-returned-for-retry'; readonly taskId: string }
  | { readonly type: 'attempt-failed'; readonly taskId: string }
  | { readonly type: 'progress-reset' }
  | { readonly type: 'progress-restored'; readonly progress: CourseProgress };

/** Прогресс — состояние прохождения Курса: какие Задания пройдены. */
export interface CourseProgress {
  /** Ключ — идентификатор Задания. Отсутствие записи — «не начато». */
  readonly taskStates: Readonly<Record<string, TaskState>>;
  /**
   * Задания, проваленные хотя бы раз до прохождения. Из этой записи выводится
   * статистика «решено с первой попытки» — готовый ответ на вопрос «что я
   * знаю твёрдо». Перезапись пройденного Задания статистику не портит.
   */
  readonly failedOnce: Readonly<Record<string, true>>;
}

/** Прогресс без единого ответа. */
export const emptyProgress: CourseProgress = { taskStates: {}, failedOnce: {} };

/** Редьюсер Курса: чистая функция переходов Прогресса. */
export function progressReducer(progress: CourseProgress, action: CourseAction): CourseProgress {
  switch (action.type) {
    case 'task-passed':
      return withTaskState(progress, action.taskId, 'passed');
    case 'task-returned-for-retry': {
      // «Пройдено» терминально: повтор грозит только непройденным Заданиям.
      if (taskStateOf(progress, action.taskId) === 'passed') return progress;
      return {
        ...withTaskState(progress, action.taskId, 'returned-for-retry'),
        failedOnce: markFailedOnce(progress, action.taskId),
      };
    }
    case 'attempt-failed': {
      // Неудачная проверка Схема-задания: ученик остаётся в Задании, очередь
      // не меняется — запоминается только сам факт ошибки для статы.
      if (taskStateOf(progress, action.taskId) === 'passed') return progress;
      if (progress.failedOnce[action.taskId]) return progress;
      return { ...progress, failedOnce: markFailedOnce(progress, action.taskId) };
    }
    case 'progress-reset':
      // «Начать заново»: чистый лист Курса. Схемы Песочницы — не Прогресс,
      // редьюсер их не касается.
      return emptyProgress;
    case 'progress-restored':
      // Импорт файла данных: Прогресс заменяется снимком из файла целиком.
      return action.progress;
  }
}

function withTaskState(
  progress: CourseProgress,
  taskId: string,
  state: TaskState,
): CourseProgress {
  if (progress.taskStates[taskId] === state) return progress;
  return { ...progress, taskStates: { ...progress.taskStates, [taskId]: state } };
}

/** Словарь failedOnce с новой отметкой «провалено хотя бы раз»; повторная запись — тот же объект. */
function markFailedOnce(progress: CourseProgress, taskId: string): CourseProgress['failedOnce'] {
  if (progress.failedOnce[taskId]) return progress.failedOnce;
  return { ...progress.failedOnce, [taskId]: true };
}

/** Состояние Задания в Прогрессе; отсутствие записи — «не начато». */
export function taskStateOf(progress: CourseProgress, taskId: string): TaskState {
  return progress.taskStates[taskId] ?? 'not-started';
}

/**
 * Решено с первой попытки: пройдено, и до прохождения не было ни одной
 * неудачной попытки. Статистика живёт в Прогрессе и переживает сессии.
 */
export function solvedOnFirstAttemptOf(progress: CourseProgress, taskId: string): boolean {
  return taskStateOf(progress, taskId) === 'passed' && progress.failedOnce[taskId] !== true;
}

/** Итоги Модуля по Прогрессу. */
export interface ModuleProgress {
  readonly total: number;
  readonly passed: number;
  readonly returnedForRetry: number;
  /** Из пройденных — решено с первой попытки (статистика по Заданиям). */
  readonly solvedOnFirstAttempt: number;
  /** Все Задания Модуля пройдены — Модуль завершён. */
  readonly completed: boolean;
}

/** Прогресс по конкретному Модулю Курса. */
export function moduleProgressOf(module: CourseModule, progress: CourseProgress): ModuleProgress {
  let passed = 0;
  let returnedForRetry = 0;
  let solvedOnFirstAttempt = 0;
  for (const task of module.tasks) {
    const state = taskStateOf(progress, task.id);
    if (state === 'passed') {
      passed += 1;
      if (solvedOnFirstAttemptOf(progress, task.id)) solvedOnFirstAttempt += 1;
    }
    if (state === 'returned-for-retry') returnedForRetry += 1;
  }
  return {
    total: module.tasks.length,
    passed,
    returnedForRetry,
    solvedOnFirstAttempt,
    // Пустой Модуль завершён «пусто»: иначе он заблокировал бы Курс навсегда.
    // Непустоту Модулей гарантирует контент-линтер (src/content/contentLint.test.ts).
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

/** Это Экзамен: финальное Схема-задание Модуля (помечено в контенте). */
export function isExamTask(task: Task): task is CircuitTask {
  return task.kind === 'circuit-task' && task.isExam === true;
}

/** Экзамен Модуля или null, если Модуль экзамена не имеет. */
export function examOf(module: CourseModule): CircuitTask | null {
  return module.tasks.find(isExamTask) ?? null;
}

/**
 * Экзамен открыт: все остальные Задания Модуля пройдены. Без экзамена
 * ограничений нет.
 */
export function isExamUnlocked(module: CourseModule, progress: CourseProgress): boolean {
  const exam = examOf(module);
  if (exam === null) return true;
  return module.tasks.every(
    (task) => task.id === exam.id || taskStateOf(progress, task.id) === 'passed',
  );
}

/**
 * Очередь Заданий Модуля: не начатые — в порядке Модуля, за ними вернувшиеся
 * на повтор. Пройденные в очередь не попадают; закрытый Экзамен из очереди
 * исключён — он открывается последним, когда остальные Задания закрыты.
 * Пустая очередь — Модуль завершён.
 */
export function moduleTaskQueue(module: CourseModule, progress: CourseProgress): readonly Task[] {
  const fresh: Task[] = [];
  const retry: Task[] = [];
  const examUnlocked = isExamUnlocked(module, progress);
  for (const task of module.tasks) {
    const state = taskStateOf(progress, task.id);
    if (state === 'not-started') {
      if (isExamTask(task) && !examUnlocked) continue;
      fresh.push(task);
    }
    if (state === 'returned-for-retry') retry.push(task);
  }
  return [...fresh, ...retry];
}

/**
 * Палитра Модуля: все Компоненты его Схема-заданий, в порядке объявления.
 * Палитра объявляется в контенте Заданий — отдельного источника правды нет.
 */
export function modulePaletteOf(module: CourseModule): readonly ComponentKind[] {
  const kinds: ComponentKind[] = [];
  for (const task of module.tasks) {
    if (task.kind !== 'circuit-task') continue;
    for (const kind of task.palette) {
      if (!kinds.includes(kind)) kinds.push(kind);
    }
  }
  return kinds;
}

/**
 * Палитра Песочницы: все Компоненты, открытые текущим Прогрессом, —
 * объединение Палитр разблокированных Модулей (CONTEXT.md: Палитра
 * «расширяется с прохождением Модулей»).
 */
export function sandboxPaletteOf(
  course: CourseData,
  progress: CourseProgress,
): readonly ComponentKind[] {
  const kinds: ComponentKind[] = [];
  for (const module of course.modules) {
    if (isModuleLocked(course, progress, module.id)) continue;
    for (const kind of modulePaletteOf(module)) {
      if (!kinds.includes(kind)) kinds.push(kind);
    }
  }
  return kinds;
}

/*
 * Модель контента Курса: структурированные данные в TypeScript-модулях
 * (см. spec: «контент Заданий, Теории и Модулей»).
 */

/** Идентификатор условного обозначения Компонента; отрисовка — слой UI. */
export type ComponentSymbolId = 'resistor' | 'dc-source' | 'capacitor' | 'diode' | 'led';

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
