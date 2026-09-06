import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProgress, saveProgress } from './progressStorage';
import type { CourseProgress } from '../domain/course';

// Прогресс хранится в localStorage браузера; jsdom даёт настоящую реализацию.

const progress: CourseProgress = {
  taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'returned-for-retry' },
  failedOnce: { 'm1-ohm-02': true },
};

describe('Сохранение Прогресса между сессиями', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('пустое хранилище — Прогресса нет', () => {
    expect(loadProgress()).toBeNull();
  });

  it('сохранённый Прогресс читается без искажений', () => {
    saveProgress(progress);
    expect(loadProgress()).toEqual(progress);
  });

  it('новое сохранение затирает предыдущее', () => {
    saveProgress(progress);
    saveProgress({ taskStates: {}, failedOnce: {} });
    expect(loadProgress()).toEqual({ taskStates: {}, failedOnce: {} });
  });

  it('сохранение прошлой версии без failedOnce — читается, попытки считаются чистыми', () => {
    // Прогресс, записанный тикетом 03: статы «с первой попытки» ещё не было
    window.localStorage.setItem(
      'electronics-trainer.progress.v1',
      JSON.stringify({ taskStates: { 'm1-ohm-01': 'passed' } }),
    );
    expect(loadProgress()).toEqual({ taskStates: { 'm1-ohm-01': 'passed' }, failedOnce: {} });
  });

  it('битая запись failedOnce — Прогресс отброшен целиком', () => {
    window.localStorage.setItem(
      'electronics-trainer.progress.v1',
      JSON.stringify({ taskStates: {}, failedOnce: { 'm1-ohm-01': 'да' } }),
    );
    expect(loadProgress()).toBeNull();
  });

  it('мусор вместо JSON — Прогресса нет, начинается с чистого листа', () => {
    window.localStorage.setItem('electronics-trainer.progress.v1', '{не json');
    expect(loadProgress()).toBeNull();
  });

  it('чужая структура данных — Прогресса нет', () => {
    window.localStorage.setItem('electronics-trainer.progress.v1', JSON.stringify({ foo: 1 }));
    expect(loadProgress()).toBeNull();
  });

  it('неизвестное состояние Задания — Прогресс отброшен целиком', () => {
    window.localStorage.setItem(
      'electronics-trainer.progress.v1',
      JSON.stringify({ taskStates: { 'm1-ohm-01': 'half-passed' } }),
    );
    expect(loadProgress()).toBeNull();
  });

  it('ошибка записи хранилища не роняет приложение', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    expect(() => saveProgress(progress)).not.toThrow();
    storageFailureSpy.mockRestore();
  });

  it('ошибка чтения хранилища трактуется как «Прогресса нет»', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage unavailable');
    });
    expect(loadProgress()).toBeNull();
    storageFailureSpy.mockRestore();
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});
