import { describe, expect, it } from 'vitest';
import { canvasReducer, emptyHistory, emptyCanvas, type CanvasState } from './canvas';
import { isValidCircuitName, removeCircuit, upsertCircuit, type SavedCircuit } from './sandbox';

/**
 * Сохранённые схемы Песочницы — домен поверх Холста: имя и снимок схемы.
 * Проверяется чистая функция upsert: сохранение по имени и идемпотентность.
 */

function canvasWithBattery(): CanvasState {
  return canvasReducer(emptyHistory, { type: 'component-placed', kind: 'battery', x: 100, y: 100 })
    .present;
}

function canvasWithLamp(): CanvasState {
  return canvasReducer(emptyHistory, { type: 'component-placed', kind: 'lamp', x: 220, y: 100 })
    .present;
}

describe('Сохранение именованных схем', () => {
  it('новая схема с новым именем добавляется в конец с сгенерированным id', () => {
    const saved = upsertCircuit([], 'Делитель', canvasWithBattery());

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'Делитель', canvas: canvasWithBattery() });
    expect(saved[0].id).toBe('s1');
  });

  it('сохранение под занятым именем перезаписывает схему, а не плодит копию', () => {
    const first = upsertCircuit([], 'Кольцо', canvasWithBattery());
    const second = upsertCircuit(first, 'Кольцо', canvasWithLamp());

    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
    expect(second[0].canvas.components[0].kind).toBe('lamp');
  });

  it('id не переиспользуются после удаления: максимум существующих плюс один', () => {
    let circuits: readonly SavedCircuit[] = [];
    circuits = upsertCircuit(circuits, 'А', canvasWithBattery());
    circuits = upsertCircuit(circuits, 'Б', canvasWithLamp());
    const withoutFirst = circuits.filter((circuit) => circuit.name !== 'А');

    const next = upsertCircuit(withoutFirst, 'В', emptyCanvas);
    expect(next.map((circuit) => circuit.id)).toEqual(['s2', 's3']);
  });

  it('имя обрезается от пробелов; пустое имя — сохранения нет', () => {
    const trimmed = upsertCircuit([], '  Кольцо  ', canvasWithBattery());
    expect(trimmed[0].name).toBe('Кольцо');

    expect(upsertCircuit([], '   ', canvasWithBattery())).toEqual([]);
    expect(upsertCircuit([], '', canvasWithBattery())).toEqual([]);
  });

  it('функция чистая: исходный список и снимки схем не меняются', () => {
    const original = upsertCircuit([], 'Кольцо', canvasWithBattery());
    const snapshot = structuredClone(original);
    const canvas = canvasWithLamp();

    upsertCircuit(original, 'Кольцо', canvas);
    upsertCircuit(original, 'Другое', canvas);

    expect(original).toEqual(snapshot);
    expect(canvas.components).toHaveLength(1);
  });
});

describe('Удаление и правило имени', () => {
  it('удаление убирает только схему с этим id; незнакомый id ничего не меняет', () => {
    let circuits = upsertCircuit([], 'А', canvasWithBattery());
    circuits = upsertCircuit(circuits, 'Б', canvasWithLamp());

    const withoutFirst = removeCircuit(circuits, circuits[0].id);
    expect(withoutFirst.map((circuit) => circuit.name)).toEqual(['Б']);
    expect(removeCircuit(circuits, 's404')).toBe(circuits);
  });

  it('имя валидно, если после обрезки пробелов оно непусто', () => {
    expect(isValidCircuitName('Кольцо')).toBe(true);
    expect(isValidCircuitName('  Кольцо ')).toBe(true);
    expect(isValidCircuitName('   ')).toBe(false);
    expect(isValidCircuitName('')).toBe(false);
  });
});
