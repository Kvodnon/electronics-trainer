/**
 * Хранение Прогресса между сессиями (localStorage). Это слой с побочными
 * эффектами — домен остаётся чистым и о хранилище не знает.
 */
import type { CourseProgress, TaskState } from '../domain/course';

const STORAGE_KEY = 'electronics-trainer.progress.v1';

const taskStates: readonly TaskState[] = ['not-started', 'passed', 'returned-for-retry'];

/**
 * Читает Прогресс из хранилища. Любая беда — мусор вместо JSON, чужая
 * структура, запись другим форматом — трактуется как «Прогресса нет»:
 * ученик начинает с чистого листа, а не с падения приложения.
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
  return isProgress(parsed) ? parsed : null;
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
  const states = (value as { taskStates?: unknown }).taskStates;
  if (typeof states !== 'object' || states === null || Array.isArray(states)) return false;
  return Object.values(states).every((state) => taskStates.includes(state as TaskState));
}
