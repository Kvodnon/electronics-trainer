import type { ModuleProgress, TaskState } from '../domain/course';

const stateNames: Record<TaskState, string> = {
  'not-started': 'не начато',
  passed: 'пройдено',
  'returned-for-retry': 'на повторении',
};

export function taskStateName(state: TaskState): string {
  return stateNames[state];
}

/** Строка Прогресса Модуля: сколько Заданий пройдено, сколько на повторении. */
export function ModuleProgressLine({ progress }: { progress: ModuleProgress }) {
  return (
    <p className="module-progress">
      Заданий пройдено: {progress.passed} из {progress.total}
      {progress.returnedForRetry > 0 && (
        <span className="module-progress-retry">
          {' '}
          · на повторении: {progress.returnedForRetry}
        </span>
      )}
    </p>
  );
}
