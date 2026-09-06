import { describe, expect, it } from 'vitest';
import { formatQuantity, formatQuantityRange, parseQuantity } from './quantity';

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
