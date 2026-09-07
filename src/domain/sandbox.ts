/**
 * Схемы Песочницы: именованные снимки Холста, которые ученик сохраняет,
 * загружает и удаляет (CONTEXT.md: Песочница). Чистый TypeScript — хранит
 * их слой storage, тот же localStorage, что и Прогресс.
 */
import type { CanvasState } from './canvas';

/** Сохранённая схема Песочницы: имя, выбранное учеником, и снимок Холста. */
export interface SavedCircuit {
  readonly id: string;
  readonly name: string;
  readonly canvas: CanvasState;
}

/**
 * Сохранение схемы под именем: занятое имя перезаписывается (id и место
 * в списке не меняются), новое — добавляется в конец. Чистая функция.
 */
export function upsertCircuit(
  circuits: readonly SavedCircuit[],
  name: string,
  canvas: CanvasState,
): readonly SavedCircuit[] {
  if (!isValidCircuitName(name)) return circuits;
  const cleanName = name.trim();
  const existing = circuits.findIndex((circuit) => circuit.name === cleanName);
  if (existing !== -1) {
    return circuits.map((circuit, index) =>
      index === existing ? { ...circuit, canvas } : circuit,
    );
  }
  return [...circuits, { id: nextCircuitId(circuits), name: cleanName, canvas }];
}

/** Удаление схемы по идентификатору; нет такой — тот же список (то же сравнение). */
export function removeCircuit(
  circuits: readonly SavedCircuit[],
  circuitId: string,
): readonly SavedCircuit[] {
  const next = circuits.filter((circuit) => circuit.id !== circuitId);
  return next.length === circuits.length ? circuits : next;
}

/** Единственное правило имени: непустое после обрезки пробелов. */
export function isValidCircuitName(name: string): boolean {
  return name.trim() !== '';
}

function nextCircuitId(circuits: readonly SavedCircuit[]): string {
  let max = 0;
  for (const circuit of circuits) {
    const number = Number(circuit.id.replace(/^s/, ''));
    if (Number.isFinite(number) && number > max) max = number;
  }
  return `s${max + 1}`;
}
