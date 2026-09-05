import type { CircuitTask } from '../../domain/task';
import { CanvasEditor } from './CanvasEditor';

/**
 * Экран Схема-задания: условие, Палитра и Холст. Проверка собранной схемы
 * Симулятором и Диагнозы — тикет 05; здесь схема собирается, правится
 * и сбрасывается.
 */
export function CircuitTaskScreen({ task }: { task: CircuitTask }) {
  return (
    <section className="panel circuit-task" aria-labelledby="circuit-prompt">
      <p className="question-kind">Схема-задание</p>
      <h2 id="circuit-prompt" className="question-prompt">
        {task.prompt}
      </h2>
      <CanvasEditor palette={task.palette} />
    </section>
  );
}
