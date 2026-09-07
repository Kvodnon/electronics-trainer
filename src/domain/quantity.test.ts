import { describe, expect, it } from 'vitest';
import { formatQuantity, formatQuantityRange, formatTimesRatio, parseQuantity } from './quantity';

// Парсер числового Ответа — чистая функция домена: «сырая» строка ученика →
// значение в базовой единице либо понятное сообщение об ошибке.

describe('parseQuantity: суффиксы и базовая единица', () => {
  it('«0,01» и «10мА» — один и тот же ответ (0,01 А)', () => {
    expect(parseQuantity('0,01', 'А')).toEqual({ status: 'ok', value: 0.01 });
    expect(parseQuantity('10мА', 'А')).toEqual({ status: 'ok', value: 0.01 });
  });

  it('отсутствие суффикса — базовая единица (А, В, Ом)', () => {
    expect(parseQuantity('0.01', 'А')).toEqual({ status: 'ok', value: 0.01 });
    expect(parseQuantity('9', 'В')).toEqual({ status: 'ok', value: 9 });
    expect(parseQuantity('1000', 'Ом')).toEqual({ status: 'ok', value: 1000 });
  });

  it('суффикс может быть написан слитно или через пробел', () => {
    expect(parseQuantity('10мА', 'А')).toEqual({ status: 'ok', value: 0.01 });
    expect(parseQuantity('10 мА', 'А')).toEqual({ status: 'ok', value: 0.01 });
    expect(parseQuantity('  2 кОм ', 'Ом')).toEqual({ status: 'ok', value: 2000 });
  });

  it('суффиксы кратных и дольных единиц каждой величины', () => {
    expect(parseQuantity('5мВ', 'В')).toEqual({ status: 'ok', value: 0.005 });
    expect(parseQuantity('3кВ', 'В')).toEqual({ status: 'ok', value: 3000 });
    expect(parseQuantity('1МОм', 'Ом')).toEqual({ status: 'ok', value: 1e6 });
    expect(parseQuantity('100Ом', 'Ом')).toEqual({ status: 'ok', value: 100 });
  });

  it('ёмкость: пФ, нФ, мкФ, мФ и фарады (М2: конденсатор)', () => {
    // умножение на множитель-суффикс даёт погрешность двойки — сравниваем с допуском
    const valueOf = (raw: string): number => {
      const result = parseQuantity(raw, 'Ф');
      expect(result.status).toBe('ok');
      return result.status === 'ok' ? result.value : Number.NaN;
    };
    expect(valueOf('100мкФ')).toBeCloseTo(1e-4, 15);
    expect(valueOf('100 мкФ')).toBeCloseTo(1e-4, 15);
    expect(valueOf('10нФ')).toBeCloseTo(1e-8, 15);
    expect(valueOf('22пФ')).toBeCloseTo(2.2e-11, 15);
    expect(valueOf('0,47мФ')).toBeCloseTo(4.7e-4, 15);
    expect(valueOf('2')).toBe(2);
  });

  it('время: мс, мкс и секунды (М2: постоянная времени)', () => {
    expect(parseQuantity('500мс', 'с')).toEqual({ status: 'ok', value: 0.5 });
    expect(parseQuantity('1,5', 'с')).toEqual({ status: 'ok', value: 1.5 });
    const micro = parseQuantity('25мкс', 'с');
    expect(micro.status).toBe('ok');
    if (micro.status === 'ok') expect(micro.value).toBeCloseTo(2.5e-5, 15);
  });

  it('знак числа сохраняется', () => {
    expect(parseQuantity('-5мВ', 'В')).toEqual({ status: 'ok', value: -0.005 });
    expect(parseQuantity('+2', 'А')).toEqual({ status: 'ok', value: 2 });
  });

  it('регистр суффикса значим: м — милли, М — мега, «МА» не распознаётся', () => {
    expect(parseQuantity('10МА', 'А').status).toBe('error');
    expect(parseQuantity('10мОм', 'Ом').status).toBe('error');
  });
});

describe('parseQuantity: десятичные разделители', () => {
  it('запятая и точка равнозначны', () => {
    expect(parseQuantity('0,5', 'А')).toEqual({ status: 'ok', value: 0.5 });
    expect(parseQuantity('0.5', 'А')).toEqual({ status: 'ok', value: 0.5 });
  });

  it('допустимы «,5» и «10,» — опечатка в конце не ломает ввод', () => {
    expect(parseQuantity(',5', 'А')).toEqual({ status: 'ok', value: 0.5 });
    expect(parseQuantity('10,', 'А')).toEqual({ status: 'ok', value: 10 });
  });
});

describe('parseQuantity: неверный ввод отклоняется с понятным сообщением', () => {
  it('пустой ввод', () => {
    const result = parseQuantity('   ', 'А');
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toMatch(/введите/i);
  });

  it('мусор без числа', () => {
    const result = parseQuantity('абракадабра', 'А');
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toMatch(/не удалось прочитать число/i);
  });

  it('неизвестный суффикс — сообщение называет его и подсказывает допустимые', () => {
    const result = parseQuantity('10кг', 'А');
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toContain('кг');
    expect(result.status === 'error' && result.message).toContain('мА');
  });

  it('суффикс чужой величины отклоняется с подсказкой по своей величине', () => {
    const result = parseQuantity('10мА', 'В');
    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toContain('мВ');
    expect(result.status === 'error' && result.message).toContain('кВ');
  });

  it('два разделителя и пробел-разделитель разрядов не читаются как число', () => {
    expect(parseQuantity('1.2.3', 'А').status).toBe('error');
    expect(parseQuantity('10,5.5', 'А').status).toBe('error');
    expect(parseQuantity('1 000', 'А').status).toBe('error');
  });
});

describe('formatQuantity: значение в базовой единице → читаемая запись', () => {
  it('подбирает приставку по порядку величины', () => {
    expect(formatQuantity(0.0095, 'А')).toBe('9,5 мА');
    expect(formatQuantity(10500, 'Ом')).toBe('10,5 кОм');
    expect(formatQuantity(2000000, 'Ом')).toBe('2 МОм');
    expect(formatQuantity(9, 'В')).toBe('9 В');
  });

  it('ноль и отрицательные значения', () => {
    expect(formatQuantity(0, 'В')).toBe('0 В');
    expect(formatQuantity(-0.005, 'В')).toBe('-5 мВ');
  });

  it('ёмкость и время — с удобной приставкой (М2)', () => {
    expect(formatQuantity(1e-4, 'Ф')).toBe('100 мкФ');
    expect(formatQuantity(2.2e-11, 'Ф')).toBe('22 пФ');
    expect(formatQuantity(1.9, 'с')).toBe('1,9 с');
    expect(formatQuantity(0.5, 'с')).toBe('500 мс');
    expect(formatQuantityRange(1.7, 2.1, 'с')).toBe('1,7–2,1 с');
  });
});

describe('formatQuantityRange: диапазон измерения → читаемая запись', () => {
  it('обе границы — с одной и той же приставкой по верхней границе', () => {
    expect(formatQuantityRange(0.05, 0.1, 'А')).toBe('50–100 мА');
    expect(formatQuantityRange(6, 12, 'В')).toBe('6–12 В');
    expect(formatQuantityRange(1000, 2000, 'Ом')).toBe('1–2 кОм');
  });

  it('нижняя граница нуля не тянет приставку вниз', () => {
    expect(formatQuantityRange(0, 0.02, 'Вт')).toBe('0–20 мВт');
  });
});

describe('formatTimesRatio: безразмерное ослабление «во столько-то раз» (тикет 21)', () => {
  it('целые склоняются по правилам русского счёта', () => {
    expect(formatTimesRatio(5)).toBe('5 раз');
    expect(formatTimesRatio(2)).toBe('2 раза');
    expect(formatTimesRatio(31)).toBe('31 раз');
    expect(formatTimesRatio(11)).toBe('11 раз');
    expect(formatTimesRatio(22)).toBe('22 раза');
    expect(formatTimesRatio(1)).toBe('1 раз');
  });

  it('дробные количества — всегда «раза»; запись с русской запятой', () => {
    expect(formatTimesRatio(31.4)).toBe('31,4 раза');
    expect(formatTimesRatio(1.05)).toBe('1,05 раза');
  });
});
