import { describe, expect, it } from 'vitest';
import { parseBackup, serializeBackup } from './backup';
import type { BackupData } from './backup';
import type { CanvasState } from './canvas';
import type { CourseProgress } from './course';

// Формат файла экспорта/импорта: Прогресс плюс схемы Песочницы. Битый или
// чужой файл отклоняется с объяснением, а не принятием на веру.

const progress: CourseProgress = {
  taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'returned-for-retry' },
  failedOnce: { 'm1-ohm-02': true },
};

const ring: CanvasState = {
  components: [
    { id: 'c1', kind: 'battery', x: 100, y: 100, rotation: 0, voltage: 4.5 },
    { id: 'c2', kind: 'lamp', x: 220, y: 220, rotation: 90, resistance: 120 },
  ],
  wires: [
    { id: 'w1', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } },
  ],
};

const data: BackupData = {
  progress,
  circuits: [{ id: 's1', name: 'Кольцо', canvas: ring }],
};

describe('Формат файла экспорта', () => {
  it('файл этого приложения читается обратно без потерь', () => {
    const parsed = parseBackup(serializeBackup(data));

    expect(parsed).toEqual({ ok: true, data });
  });

  it('в файле есть метка приложения и версия формата', () => {
    const file = JSON.parse(serializeBackup(data));

    expect(file.kind).toBe('electronics-trainer-backup');
    expect(file.version).toBe(1);
  });
});

describe('Импорт: отказ битого и чужого файла', () => {
  it('мусор вместо JSON — отказ с объяснением', () => {
    const parsed = parseBackup('{не json');

    expect(parsed).toEqual({
      ok: false,
      error: 'Файл повреждён: не удаётся прочитать JSON.',
    });
  });

  it('чужой JSON без метки приложения — отказ', () => {
    const parsed = parseBackup(JSON.stringify({ hello: 'мир' }));

    expect(parsed).toEqual({
      ok: false,
      error: 'Это не файл Тренажёра «Электроника с нуля».',
    });
  });

  it('метка другого приложения — отказ', () => {
    const parsed = parseBackup(
      JSON.stringify({ kind: 'other-app-backup', version: 1, progress, sandboxCircuits: [] }),
    );

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('не файл Тренажёра');
  });

  it('чужая версия формата — отказ с номером поддерживаемой версии', () => {
    const raw = JSON.parse(serializeBackup(data));
    raw.version = 2;
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed).toEqual({
      ok: false,
      error: 'Файл создан другой версией Тренажёра: поддерживается версия 1.',
    });
  });

  it('Повреждённый Прогресс — отказ с указанием на Прогресс', () => {
    const raw = JSON.parse(serializeBackup(data));
    raw.progress = { taskStates: { 'm1-ohm-01': 'почти пройдено' } };
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('Прогресс');
  });

  it('Прогресса в файле нет — отказ', () => {
    const raw = JSON.parse(serializeBackup(data));
    delete raw.progress;
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('Прогресс');
  });

  it('списка схем Песочницы в файле нет — отказ', () => {
    const raw = JSON.parse(serializeBackup(data));
    delete raw.sandboxCircuits;
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('Песочницы');
  });

  it('повреждённая схема называется по имени в объяснении', () => {
    const raw = JSON.parse(serializeBackup(data));
    raw.sandboxCircuits.push({
      id: 's2',
      name: 'Поломанная',
      canvas: {
        components: [{ id: 'c1', kind: 'lamp', x: 0, y: 0, rotation: 0, resistance: 1 }],
        wires: [{ id: 'w1', from: { componentId: 'c1', pin: 0 }, to: { componentId: 'ghost', pin: 0 } }],
      },
    });
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('«Поломанная»');
  });

  it('схема без имени в объяснении названа по номеру записи', () => {
    const raw = JSON.parse(serializeBackup(data));
    raw.sandboxCircuits[0].name = '';
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed.ok).toBe(false);
    expect((parsed as { error: string }).error).toContain('№1');
  });
});

describe('Импорт: терпимость к сохранениям старых версий', () => {
  it('Прогресс без failedOnce читается: попытки считаются чистыми', () => {
    const raw = JSON.parse(serializeBackup(data));
    delete raw.progress.failedOnce;
    const parsed = parseBackup(JSON.stringify(raw));

    expect(parsed).toEqual({
      ok: true,
      data: { progress: { taskStates: progress.taskStates, failedOnce: {} }, circuits: data.circuits },
    });
  });
});
