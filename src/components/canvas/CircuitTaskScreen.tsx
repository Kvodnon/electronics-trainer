import { useReducer, useState } from 'react';
import type { CircuitTask } from '../../domain/task';
import { canvasReducer, emptyHistory, type CanvasState } from '../../domain/canvas';
import type { CircuitAnswer, CircuitTaskEvaluation } from '../../domain/evaluate';
import { CanvasEditor } from './CanvasEditor';

interface CircuitTaskScreenProps {
  readonly task: CircuitTask;
  readonly evaluation: CircuitTaskEvaluation | null;
  readonly onAnswer: (answer: CircuitAnswer) => void;
  readonly onNext: () => void;
}

/**
 * Экран Схема-задания: условие, Палитра и Холст с кнопкой «Проверить».
 * Состояние Холста живёт здесь: по нажатию «Проверить» снимок схемы уходит
 * ответом в `evaluate` (Симулятор считает токи и напряжения), вердикт
 * показывается, пока схема не изменилась — после правки Разбор снимается,
 * чтобы не врать устаревшими числами.
 */
export function CircuitTaskScreen({ task, evaluation, onAnswer, onNext }: CircuitTaskScreenProps) {
  const [history, onAction] = useReducer(canvasReducer, emptyHistory);
  /** Схема на момент последней «Проверить» — для снятия устаревшего вердикта. */
  const [submitted, setSubmitted] = useState<CanvasState | null>(null);
  const shownEvaluation = submitted !== null && history.present === submitted ? evaluation : null;

  function check() {
    setSubmitted(history.present);
    onAnswer({ kind: 'circuit-answer', canvas: history.present });
  }

  return (
    <section className="panel circuit-task" aria-labelledby="circuit-prompt">
      <p className="question-kind">Схема-задание</p>
      <h2 id="circuit-prompt" className="question-prompt">
        {task.prompt}
      </h2>
      <CanvasEditor
        palette={task.palette}
        history={history}
        onAction={onAction}
        actions={
          <button type="button" className="button-primary canvas-check" onClick={check}>
            Проверить
          </button>
        }
      />
      {shownEvaluation !== null && (
        <CircuitVerdict evaluation={shownEvaluation} onNext={onNext} />
      )}
    </section>
  );
}

/** Вердикт «Проверить»: исход и Разбор условий на числах расчёта. */
function CircuitVerdict({
  evaluation,
  onNext,
}: {
  readonly evaluation: CircuitTaskEvaluation;
  readonly onNext: () => void;
}) {
  const passed = evaluation.outcome === 'correct';
  return (
    <section className="circuit-verdict" aria-label="Вердикт проверки" aria-live="polite">
      <p className={`verdict verdict-${evaluation.outcome}`}>
        <span className="verdict-word">{passed ? 'Пройдено' : 'Не пройдено'}</span>
        {passed ? (
          <span className="verdict-note">Схема работает по условию Задания.</span>
        ) : (
          <span className="verdict-note">
            Правьте схему и проверяйте снова — попытки не ограничены.
          </span>
        )}
      </p>
      <ul className="circuit-conditions">
        {evaluation.conditionChecks.map((check, index) => (
          <li
            key={index}
            className={`circuit-condition circuit-condition-${check.passed ? 'passed' : 'failed'}`}
          >
            <span className="circuit-condition-mark" aria-hidden="true">
              {check.passed ? '✓' : '✗'}
            </span>
            {check.text}
          </li>
        ))}
      </ul>
      {passed && (
        <button type="button" className="button-primary" onClick={onNext}>
          Дальше
        </button>
      )}
    </section>
  );
}
