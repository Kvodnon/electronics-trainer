import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSymbolStandard, saveSymbolStandard } from './symbolStandardStorage';

// Выбранный стандарт обозначений хранится в localStorage браузера;
// jsdom даёт настоящую реализацию.

describe('Сохранение стандарта обозначений между сессиями', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('пустое хранилище — стандарта нет', () => {
    expect(loadSymbolStandard()).toBeNull();
  });

  it('сохранённый ANSI читается без искажений', () => {
    saveSymbolStandard('ansi');
    expect(loadSymbolStandard()).toBe('ansi');
  });

  it('сохранённый ГОСТ читается без искажений', () => {
    saveSymbolStandard('gost');
    expect(loadSymbolStandard()).toBe('gost');
  });

  it('новое сохранение затирает предыдущее', () => {
    saveSymbolStandard('ansi');
    saveSymbolStandard('gost');
    expect(loadSymbolStandard()).toBe('gost');
  });

  it('мусор в хранилище — стандарта нет, приложение берёт значение по умолчанию', () => {
    window.localStorage.setItem('electronics-trainer.symbol-standard.v1', 'degost');
    expect(loadSymbolStandard()).toBeNull();
  });

  it('значение в JSON-обёртке — не стандарт, стандарта нет', () => {
    window.localStorage.setItem('electronics-trainer.symbol-standard.v1', '"ansi"');
    expect(loadSymbolStandard()).toBeNull();
  });

  it('ошибка записи хранилища не роняет приложение', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    expect(() => saveSymbolStandard('ansi')).not.toThrow();
    storageFailureSpy.mockRestore();
  });

  it('ошибка чтения хранилища трактуется как «стандарта нет»', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage unavailable');
    });
    expect(loadSymbolStandard()).toBeNull();
    storageFailureSpy.mockRestore();
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});
