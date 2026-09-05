/**
 * Числовой парсер Ответа: «сырая» строка ученика → значение в базовой единице
 * либо понятное сообщение об ошибке. Чистый TypeScript без DOM.
 * Запятая и точка равнозначны; отсутствие суффикса — базовая единица (А, В, Ом).
 */

/** Базовая единица величины числового Вопроса. */
export type QuantityUnit = 'А' | 'В' | 'Ом';

/** Результат разбора: либо значение в базовой единице, либо сообщение ученику. */
export type QuantityParseResult =
  | { readonly status: 'ok'; readonly value: number }
  | { readonly status: 'error'; readonly message: string };

/**
 * Суффиксы величины с множителями. Регистр значим: м — милли, М — мега,
 * поэтому «МА» не читается как «мА».
 */
const UNIT_SUFFIXES: Record<
  QuantityUnit,
  readonly { readonly suffix: string; readonly factor: number }[]
> = {
  'А': [
    { suffix: 'мА', factor: 1e-3 },
    { suffix: 'А', factor: 1 },
  ],
  'В': [
    { suffix: 'мВ', factor: 1e-3 },
    { suffix: 'В', factor: 1 },
    { suffix: 'кВ', factor: 1e3 },
  ],
  'Ом': [
    { suffix: 'Ом', factor: 1 },
    { suffix: 'кОм', factor: 1e3 },
    { suffix: 'МОм', factor: 1e6 },
  ],
};

/** Все допустимые суффиксы величины — для подсказок в сообщениях и UI. */
export function unitSuffixes(unit: QuantityUnit): readonly string[] {
  return UNIT_SUFFIXES[unit].map((entry) => entry.suffix);
}

/** Русское название величины для подсказок: «А» → «амперы». */
const UNIT_NOUNS: Record<QuantityUnit, string> = {
  'А': 'амперы',
  'В': 'вольты',
  'Ом': 'омы',
};

export function unitNoun(unit: QuantityUnit): string {
  return UNIT_NOUNS[unit];
}

/** Число, за ним суффикс — слитно или через пробел. */
const NUMBER_WITH_SUFFIX_RE = /^([+-]?)(\d+(?:[.,]\d*)?|[.,]\d+)(.*)$/;

/**
 * Разбирает Ответ ученика. Возвращает значение в базовой единице (А, В, Ом) —
 * «0,01» и «10мА» дают одинаковый результат.
 */
export function parseQuantity(raw: string, unit: QuantityUnit): QuantityParseResult {
  const trimmed = raw.trim();
  const entries = UNIT_SUFFIXES[unit];
  const example = `«10» или «10${entries[0].suffix}»`;

  if (trimmed === '') {
    return { status: 'error', message: `Введите ответ — например, ${example}.` };
  }

  const match = NUMBER_WITH_SUFFIX_RE.exec(trimmed);
  if (!match) {
    return {
      status: 'error',
      message: `Не удалось прочитать число в «${trimmed}». Десятичный разделитель — запятая или точка: ${example}.`,
    };
  }

  const suffix = match[3].trim();
  if (/[0-9.,]/.test(suffix)) {
    return {
      status: 'error',
      message: `Не удалось прочитать число в «${trimmed}»: десятичный разделитель только один, разряды пробелом не разделяются.`,
    };
  }

  const entry = suffix === '' ? { factor: 1 } : entries.find((candidate) => candidate.suffix === suffix);
  if (!entry) {
    const list = unitSuffixes(unit).join(', ');
    return {
      status: 'error',
      message: `Неизвестная единица «${suffix}». Пишите число без суффикса (тогда это ${unit}) или с одной из: ${list}.`,
    };
  }

  const value = Number(`${match[1]}${match[2]}`.replace(',', '.')) * entry.factor;
  return { status: 'ok', value };
}

/** Приставки для читаемой записи: выбирается по порядку величины. */
const PREFIX_STEPS: readonly { readonly factor: number; readonly prefix: string }[] = [
  { factor: 1e6, prefix: 'М' },
  { factor: 1e3, prefix: 'к' },
  { factor: 1, prefix: '' },
  { factor: 1e-3, prefix: 'м' },
];

/**
 * Значение в базовой единице → запись с удобной приставкой и русской запятой:
 * 0.0095 А → «9,5 мА», 10500 Ом → «10,5 кОм».
 */
export function formatQuantity(value: number, unit: QuantityUnit): string {
  const abs = Math.abs(value);
  const step = PREFIX_STEPS.find((s) => abs >= s.factor) ?? { factor: 1, prefix: '' };
  const rounded = Number((value / step.factor).toPrecision(3));
  return `${String(rounded).replace('.', ',')} ${step.prefix}${unit}`;
}
