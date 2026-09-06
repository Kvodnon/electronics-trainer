/**
 * Числовой парсер Ответа: «сырая» строка ученика → значение в базовой единице
 * либо понятное сообщение об ошибке. Чистый TypeScript без DOM.
 * Запятая и точка равнозначны; отсутствие суффикса — базовая единица (А, В, Ом).
 */

/** Базовая единица величины: тока, напряжения, сопротивления, мощности —
 * а с М2 ещё ёмкости (конденсатор) и времени (постоянная времени RC). */
export type QuantityUnit = 'А' | 'В' | 'Ом' | 'Вт' | 'Ф' | 'с';

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
    { suffix: 'мкА', factor: 1e-6 },
    { suffix: 'мА', factor: 1e-3 },
    { suffix: 'А', factor: 1 },
  ],
  'В': [
    { suffix: 'мкВ', factor: 1e-6 },
    { suffix: 'мВ', factor: 1e-3 },
    { suffix: 'В', factor: 1 },
    { suffix: 'кВ', factor: 1e3 },
  ],
  'Ом': [
    { suffix: 'Ом', factor: 1 },
    { suffix: 'кОм', factor: 1e3 },
    { suffix: 'МОм', factor: 1e6 },
  ],
  'Вт': [
    { suffix: 'мВт', factor: 1e-3 },
    { suffix: 'Вт', factor: 1 },
  ],
  'Ф': [
    { suffix: 'пФ', factor: 1e-12 },
    { suffix: 'нФ', factor: 1e-9 },
    { suffix: 'мкФ', factor: 1e-6 },
    { suffix: 'мФ', factor: 1e-3 },
    { suffix: 'Ф', factor: 1 },
  ],
  'с': [
    { suffix: 'мкс', factor: 1e-6 },
    { suffix: 'мс', factor: 1e-3 },
    { suffix: 'с', factor: 1 },
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
  'Вт': 'ватты',
  'Ф': 'фарады',
  'с': 'секунды',
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
  const baseSuffix = entries.find((entry) => entry.factor === 1)!.suffix;
  const example = `«10» или «10${baseSuffix}»`;

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
  { factor: 1e-6, prefix: 'мк' },
  { factor: 1e-9, prefix: 'н' },
  { factor: 1e-12, prefix: 'п' },
];

/** Приставка по порядку величины: выбирается первым подходящим шагом сверху. */
function prefixStepOf(abs: number): { factor: number; prefix: string } {
  return PREFIX_STEPS.find((s) => abs >= s.factor) ?? { factor: 1, prefix: '' };
}

/**
 * Значение в базовой единице → запись с удобной приставкой и русской запятой:
 * 0.0095 А → «9,5 мА», 10500 Ом → «10,5 кОм».
 */
export function formatQuantity(value: number, unit: QuantityUnit): string {
  const step = prefixStepOf(Math.abs(value));
  const rounded = Number((value / step.factor).toPrecision(3));
  return `${String(rounded).replace('.', ',')} ${step.prefix}${unit}`;
}

/**
 * Диапазон в базовой единице → запись с общей приставкой (по верхней
 * границе): 0,05–0,1 А → «50–100 мА». Общая приставка не даёт строке
 * Разбора пестреть разными масштабами одной величины.
 */
export function formatQuantityRange(from: number, to: number, unit: QuantityUnit): string {
  const step = prefixStepOf(Math.max(Math.abs(from), Math.abs(to)));
  const format = (value: number) => String(Number((value / step.factor).toPrecision(3))).replace('.', ',');
  return `${format(from)}–${format(to)} ${step.prefix}${unit}`;
}
