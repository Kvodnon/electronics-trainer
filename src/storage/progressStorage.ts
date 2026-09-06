/**
 * Хранение Прогресса между сессиями (localStorage). Это слой с побочными
 * эффектами — домен остаётся чистым и о хранилище не знает.
 */
import type { CourseProgress, TaskState } from '../domain/course';

const STORAGE_KEY = 'electronics-trainer.progress.v1';

const VALID_TASK_STATES: readonly TaskState[] = ['not-started', 'passed', 'returned-for-retry'];

/**
 * Читает Прогресс из хранилища. Любая беда — мусор вместо JSON, чужая
 * структура, запись другим форматом — трактуется как «Прогресса нет»:
 * ученик начинает с чистого листа, а не с падения приложения.
 * Сохранения прошлой версии (без failedOnce) читаются: попытки считались
 * чистыми — статистика «с первой попытки» по старым Заданиям честная.
 */
export function loadProgress(): CourseProgress | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isProgress(parsed)) return null;
  return { taskStates: parsed.taskStates, failedOnce: parsed.failedOnce ?? {} };
}

/** Записывает Прогресс в хранилище; при отказе хранилища молча пропускает. */
export function saveProgress(progress: CourseProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // квота или закрытый доступ: Прогресс живёт до перезагрузки страницы
  }
}

function isProgress(value: unknown): value is CourseProgress {
  if (typeof value !== 'object' || value === null) return false;
  const { taskStates, failedOnce } = value as { taskStates?: unknown; failedOnce?: unknown };
  if (typeof taskStates !== 'object' || taskStates === null || Array.isArray(taskStates)) {
    return false;
  }
  if (!Object.values(taskStates).every((state) => VALID_TASK_STATES.includes(state as TaskState))) {
    return false;
  }
  // failedOnce появился позже сохранений первой версии: отсутствие — «чисто»
  if (failedOnce === undefined) return true;
  if (typeof failedOnce !== 'object' || failedOnce === null || Array.isArray(failedOnce)) {
    return false;
  }
  return Object.values(failedOnce).every((mark) => mark === true);
}
