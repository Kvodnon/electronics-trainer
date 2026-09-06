/**
 * Хранение выбранного стандарта обозначений между сессиями (localStorage).
 * Это слой с побочными эффектами — домен остаётся чистым и о хранилище не знает.
 */
import { isSymbolStandard, type SymbolStandard } from '../domain/symbols';

const STORAGE_KEY = 'electronics-trainer.symbol-standard.v1';

/**
 * Читает стандарт из хранилища. Любая беда — мусор, чужая запись —
 * трактуется как «стандарта нет»: приложение возьмёт значение по умолчанию.
 */
export function loadSymbolStandard(): SymbolStandard | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return isSymbolStandard(raw) ? raw : null;
}

/** Записывает стандарт в хранилище; при отказе хранилища молча пропускает. */
export function saveSymbolStandard(standard: SymbolStandard): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, standard);
  } catch {
    // квота или закрытый доступ: выбор живёт до перезагрузки страницы
  }
}
