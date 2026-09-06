import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSandboxCircuits, saveSandboxCircuits } from './sandboxStorage';
import type { SavedCircuit } from '../domain/sandbox';
import type { CanvasState } from '../domain/canvas';

// Схемы Песочницы хранятся в localStorage — в том же хранилище, что Прогресс;
// jsdom даёт настоящую реализацию. Чужой мусор не роняет приложение.

const ring: CanvasState = {
  components: [
    { id: 'c1', kind: 'battery', x: 100, y: 100, rotation: 0, voltage: 4.5 },
    { id: 'c2', kind: 'lamp', x: 220, y: 220, rotation: 90, resistance: 120 },
  ],
  wires: [
    { id: 'w1', from: { componentId: 'c1', pin: 1 }, to: { componentId: 'c2', pin: 0 } },
  ],
};

const circuit: SavedCircuit = { id: 's1', name: 'Кольцо', canvas: ring };

describe('Хранение схем Песочницы', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('пустое хранилище — схем нет', () => {
    expect(loadSandboxCircuits()).toEqual([]);
  });

  it('сохранённые схемы читаются без потерь: номиналы, повороты и Провода на месте', () => {
    saveSandboxCircuits([circuit]);
    expect(loadSandboxCircuits()).toEqual([circuit]);
  });

  it('сохранение затирает предыдущий список целиком', () => {
    saveSandboxCircuits([circuit]);
    const other: SavedCircuit = { id: 's2', name: 'Другая', canvas: { components: [], wires: [] } };
    saveSandboxCircuits([other]);
    expect(loadSandboxCircuits()).toEqual([other]);
  });

  it('мусор вместо JSON — схем нет', () => {
    window.localStorage.setItem('electronics-trainer.sandbox.v1', '{не json');
    expect(loadSandboxCircuits()).toEqual([]);
  });

  it('чужая структура — схем нет', () => {
    window.localStorage.setItem(
      'electronics-trainer.sandbox.v1',
      JSON.stringify({ circuits: 42 }),
    );
    expect(loadSandboxCircuits()).toEqual([]);
  });

  it('некорректная схема отбрасывается, корректные соседки остаются', () => {
    saveSandboxCircuits([circuit]);
    const raw = JSON.parse(window.localStorage.getItem('electronics-trainer.sandbox.v1')!);
    raw.push({ id: 's2', name: 'Поломанная', canvas: { components: [{ id: 'x' }], wires: [] } });
    raw.push({ id: 's3', name: '', canvas: { components: [], wires: [] } });
    raw.push({
      id: 's4',
      name: 'Провод в никуда',
      canvas: {
        components: [{ id: 'c1', kind: 'lamp', x: 0, y: 0, rotation: 0, resistance: 1 }],
        wires: [{ id: 'w1', from: { componentId: 'c1', pin: 0 }, to: { componentId: 'ghost', pin: 0 } }],
      },
    });
    window.localStorage.setItem('electronics-trainer.sandbox.v1', JSON.stringify(raw));

    const loaded = loadSandboxCircuits();
    expect(loaded.map((circuit) => circuit.name)).toEqual(['Кольцо']);
  });

  it('неизвестный вид Компонента и неверный поворот — схема отброшена', () => {
    const raw = [
      {
        id: 's1',
        name: 'Чужой вид',
        canvas: {
          components: [{ id: 'c1', kind: 'inductor', x: 0, y: 0, rotation: 0 }],
          wires: [],
        },
      },
      {
        id: 's2',
        name: 'Чужой поворот',
        canvas: {
          components: [{ id: 'c1', kind: 'lamp', x: 0, y: 0, rotation: 45, resistance: 1 }],
          wires: [],
        },
      },
    ];
    window.localStorage.setItem('electronics-trainer.sandbox.v1', JSON.stringify(raw));
    expect(loadSandboxCircuits()).toEqual([]);
  });

  it('ошибка записи хранилища не роняет приложение', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    expect(() => saveSandboxCircuits([circuit])).not.toThrow();
    storageFailureSpy.mockRestore();
  });

  it('ошибка чтения хранилища трактуется как «схем нет»', () => {
    const storageFailureSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('storage unavailable');
    });
    expect(loadSandboxCircuits()).toEqual([]);
    storageFailureSpy.mockRestore();
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});
