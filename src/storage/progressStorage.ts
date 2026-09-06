/**
 * Хранение Прогресса между сессиями (localStorage). Это слой с побочными
 * эффектами — домен остаётся чистым и о хранилище не знает. Проверки формы
 * данных общие с импортом файла: src/domain/backup.ts.
 */
import { isCourseProgress } from '../domain/backup';
import type { CourseProgress } from '../domain/course';

const STORAGE_KEY = 'electronics-trainer.progress.v1';

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
  if (!isCourseProgress(parsed)) return null;
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
