/**
 * Файл экспорта/импорта данных Тренажёра: Прогресс плюс схемы Песочницы —
 * для переноса в другой браузер или после переустановки. Чистый TypeScript:
 * чтение файла и скачивание живут в слое storage, здесь только формат.
 */
import { isComponentKind, pinCountOf, type CanvasState, type PlacedComponent, type Rotation } from './canvas';
import type { CourseProgress, TaskState } from './course';
import type { SavedCircuit } from './sandbox';

const BACKUP_KIND = 'electronics-trainer-backup';
const BACKUP_VERSION = 1;

const VALID_TASK_STATES: readonly TaskState[] = ['not-started', 'passed', 'returned-for-retry'];

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Содержимое файла экспорта: снимок Прогресса и схем Песочницы. */
export interface BackupData {
  readonly progress: CourseProgress;
  readonly circuits: readonly SavedCircuit[];
}

/** Результат чтения файла: данные либо отказ с объяснением, что не так. */
export type BackupParseResult =
  | { readonly ok: true; readonly data: BackupData }
  | { readonly ok: false; readonly error: string };

/** Файл этого приложения со снимком данных. */
export function serializeBackup(data: BackupData): string {
  // В файле схемы живут под именем sandboxCircuits: circuits — внутреннее
  // имя в коде.
  return JSON.stringify({
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    progress: data.progress,
    sandboxCircuits: data.circuits,
  });
}

/**
 * Читает файл экспорта. Битый или чужой файл отклоняется целиком — частичное
 * принятие спрятало бы потерю данных; объяснение называет проблему.
 */
export function parseBackup(raw: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Файл повреждён: не удаётся прочитать JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Это не файл Тренажёра «Электроника с нуля».' };
  }
  const file = parsed as Record<string, unknown>;
  if (file.kind !== BACKUP_KIND) {
    return { ok: false, error: 'Это не файл Тренажёра «Электроника с нуля».' };
  }
  if (file.version !== BACKUP_VERSION) {
    return { ok: false, error: `Файл создан другой версией Тренажёра: поддерживается версия ${BACKUP_VERSION}.` };
  }
  if (!isCourseProgress(file.progress)) {
    return { ok: false, error: 'Прогресс в файле повреждён.' };
  }
  if (!Array.isArray(file.sandboxCircuits)) {
    return { ok: false, error: 'Схемы Песочницы в файле повреждены.' };
  }
  for (const [index, entry] of file.sandboxCircuits.entries()) {
    if (!isSavedCircuit(entry)) {
      return { ok: false, error: brokenCircuitMessage(entry, index) };
    }
  }
  return {
    ok: true,
    data: {
      // Прогресс без failedOnce записан до появления статистики «с первой
      // попытки»: попытки считаются чистыми, как и при чтении localStorage.
      progress: { taskStates: file.progress.taskStates, failedOnce: file.progress.failedOnce ?? {} },
      circuits: file.sandboxCircuits,
    },
  };
}

function brokenCircuitMessage(entry: unknown, index: number): string {
  const name = entry as { name?: unknown };
  const label =
    typeof name?.name === 'string' && name.name !== '' ? `«${name.name}»` : `№${index + 1}`;
  return `Схема Песочницы ${label} в файле повреждена.`;
}

/** Прогресс: словарь состояний Заданий плюс отметки проваленных попыток. */
export function isCourseProgress(value: unknown): value is CourseProgress {
  if (typeof value !== 'object' || value === null) return false;
  const { taskStates, failedOnce } = value as { taskStates?: unknown; failedOnce?: unknown };
  if (typeof taskStates !== 'object' || taskStates === null || Array.isArray(taskStates)) {
    return false;
  }
  if (!Object.values(taskStates).every((state) => VALID_TASK_STATES.includes(state as TaskState))) {
    return false;
  }
  // failedOnce появился позже сохранений первой версии: отсутствие — «чисто»
  if (failedOnce === undefined) return true;
  if (typeof failedOnce !== 'object' || failedOnce === null || Array.isArray(failedOnce)) {
    return false;
  }
  return Object.values(failedOnce).every((mark) => mark === true);
}

/** Сохранённая схема Песочницы: имя и снимок Холста. */
export function isSavedCircuit(value: unknown): value is SavedCircuit {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, canvas } = value as { id?: unknown; name?: unknown; canvas?: unknown };
  return typeof id === 'string' && typeof name === 'string' && name !== '' && isCanvasState(canvas);
}

/** Снимок Холста: Компоненты и Провод, держащийся за существующие выводы. */
export function isCanvasState(value: unknown): value is CanvasState {
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
  const target = components.find((c) => (c as PlacedComponent)?.id === ref.componentId) as
    | PlacedComponent
    | undefined;
  if (target === undefined) return false;
  return (
    typeof ref.pin === 'number' &&
    Number.isInteger(ref.pin) &&
    ref.pin >= 0 &&
    ref.pin < pinCountOf(target.kind)
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
