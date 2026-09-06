/**
 * Стандарт условных обозначений: набор символов, которым Холст рисует
 * Компоненты (тикет 07). Выбор ученика — данные домена; сами наборы
 * отрисовки живут в слое UI (CanvasSymbols), хранение — в слое storage.
 */

/** ГОСТ/IEC — русскоязычные учебники; ANSI — англоязычные материалы. */
export type SymbolStandard = 'gost' | 'ansi';

/** Все стандарты. */
export const symbolStandards: readonly SymbolStandard[] = ['gost', 'ansi'];

/** Стандарт по умолчанию, пока ученик не выбрал свой. */
export const defaultSymbolStandard: SymbolStandard = 'gost';

/** Значение из хранилища — правда ли стандарт обозначений? */
export function isSymbolStandard(value: unknown): value is SymbolStandard {
  return typeof value === 'string' && (symbolStandards as readonly string[]).includes(value);
}
