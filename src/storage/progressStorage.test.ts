import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProgress, saveProgress } from './progressStorage';
import type { CourseProgress } from '../domain/course';

// Прогресс хранится в localStorage браузера; jsdom даёт настоящую реализацию.

const прогресс: CourseProgress = {
  taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'returned-for-retry' },
};

describe('Сохранение Прогресса между сессиями', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('пустое хранилище — Прогресса нет', () => {
    expect(loadProgress()).toBeNull();
  });

  it('сохранённый Прогресс читается без искажений', () => {
    saveProgress(прогресс);
    expect(loadProgress()).toEqual(прогресс);
  });

  it('новое сохранение затирает предыдущее', () => {
    saveProgress(прогресс);
    saveProgress({ taskStates: {} });
    expect(loadProgress()).toEqual({ taskStates: {} });
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
    const эмуляцияОтказа = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    expect(() => saveProgress(прогресс)).not.toThrow();
    эмуляцияОтказа.mockRestore();
  });

  it('ошибка чтения хранилища трактуется как «Прогресса нет»', () => {
    const эмуляцияОтказа = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage unavailable');
    });
    expect(loadProgress()).toBeNull();
    эмуляцияОтказа.mockRestore();
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});
