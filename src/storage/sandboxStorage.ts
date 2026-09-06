/**
 * Хранение схем Песочницы между сессиями (localStorage) — тот же подход, что
 * у Прогресса: слой с побочными эффектами, домен остаётся чистым. Битые
 * записи отбрасываются по одной: чужой мусор не должен прятать уцелевшие
 * схемы ученика. Проверки формы данных общие с импортом файла:
 * src/domain/backup.ts.
 */
import { isSavedCircuit } from '../domain/backup';
import type { SavedCircuit } from '../domain/sandbox';

const STORAGE_KEY = 'electronics-trainer.sandbox.v1';

/**
 * Читает сохранённые схемы. Беда верхнего уровня — мусор вместо JSON, чужая
 * структура — трактуется как «схем нет»; внутри списка некорректные схемы
 * пропускаются, корректные остаются читаемы.
 */
export function loadSandboxCircuits(): readonly SavedCircuit[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSavedCircuit);
}

/** Записывает список схем в хранилище; при отказе хранилища молча пропускает. */
export function saveSandboxCircuits(circuits: readonly SavedCircuit[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(circuits));
  } catch {
    // квота или закрытый доступ: схемы живут до перезагрузки страницы
  }
}
