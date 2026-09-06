/**
 * Хранение схем Песочницы между сессиями (localStorage) — тот же подход, что
 * у Прогресса: слой с побочными эффектами, домен остаётся чистым. Битые
 * записи отбрасываются по одной: чужой мусор не должен прятать уцелевшие
 * схемы ученика.
 */
import { isComponentKind, PIN_COUNT, type CanvasState, type PlacedComponent, type Rotation } from '../domain/canvas';
import type { SavedCircuit } from '../domain/sandbox';

const STORAGE_KEY = 'electronics-trainer.sandbox.v1';

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/**
 * Читает сохранённые схемы. Беда верхнего уровня — мусор вместо JSON, чужая
 * структура — трактуется как «схем нет»; внутри списка некорректные схемы
 * пропускаются, корректные остаются читаемы.
 */
export function loadSandboxCircuits(): readonly SavedCircuit[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSavedCircuit);
}

/** Записывает список схем в хранилище; при отказе хранилища молча пропускает. */
export function saveSandboxCircuits(circuits: readonly SavedCircuit[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(circuits));
  } catch {
    // квота или закрытый доступ: схемы живут до перезагрузки страницы
  }
}

function isSavedCircuit(value: unknown): value is SavedCircuit {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, canvas } = value as { id?: unknown; name?: unknown; canvas?: unknown };
  return typeof id === 'string' && typeof name === 'string' && name !== '' && isCanvasState(canvas);
}

function isCanvasState(value: unknown): value is CanvasState {
  if (typeof value !== 'object' || value === null) return false;
  const { components, wires } = value as { components?: unknown; wires?: unknown };
  if (!Array.isArray(components) || !Array.isArray(wires)) return false;
  return components.every(isPlacedComponent) && wires.every((wire) => isWire(wire, components));
}

function isPlacedComponent(value: unknown): value is PlacedComponent {
  if (typeof value !== 'object' || value === null) return false;
  const component = value as Record<string, unknown>;
  if (typeof component.id !== 'string' || component.id === '') return false;
  if (!isComponentKind(component.kind)) return false;
  if (!isFiniteNumber(component.x) || !isFiniteNumber(component.y)) return false;
  if (!ROTATIONS.includes(component.rotation as Rotation)) return false;
  // Номиналы: необязательные, но присутствующее поле должно быть числом
  // (позитивность уже держит редьюсер; здесь достаточно не принять мусор).
  for (const field of ['voltage', 'resistance'] as const) {
    if (component[field] !== undefined && !isFiniteNumber(component[field])) return false;
  }
  if (component.closed !== undefined && typeof component.closed !== 'boolean') return false;
  return true;
}

function isWire(value: unknown, components: readonly unknown[]): value is CanvasState['wires'][number] {
  if (typeof value !== 'object' || value === null) return false;
  const wire = value as Record<string, unknown>;
  if (typeof wire.id !== 'string' || wire.id === '') return false;
  return isPinRef(wire.from, components) && isPinRef(wire.to, components);
}

function isPinRef(value: unknown, components: readonly unknown[]): value is { componentId: string; pin: number } {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Record<string, unknown>;
  if (typeof ref.componentId !== 'string') return false;
  // Провод обязан держаться за существующий на схеме Компонент.
  if (!components.some((c) => (c as PlacedComponent)?.id === ref.componentId)) return false;
  return typeof ref.pin === 'number' && Number.isInteger(ref.pin) && ref.pin >= 0 && ref.pin < PIN_COUNT;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
