import { useMemo, useReducer, useState } from 'react';
import { evaluateDigital } from '../../domain/booleanEngine';
import {
  digitalCanvasReducer,
  emptyDigitalHistory,
  type DigitalCanvasState,
} from '../../domain/digitalCanvas';
import type { LogicAnswer, LogicTaskEvaluation } from '../../domain/evaluate';
import type { LogicRowCheck } from '../../domain/logicCheck';
import type { LogicTask } from '../../domain/task';
import type { SymbolStandard } from '../../domain/symbols';
import { HintLadder } from '../HintLadder';
import { StandardControls } from '../canvas/ToolbarControls';
import { DigitalCanvasEditor } from './DigitalCanvasEditor';

interface LogicTaskScreenProps {
  readonly task: LogicTask;
  readonly evaluation: LogicTaskEvaluation | null;
  readonly onAnswer: (answer: LogicAnswer) => void;
  readonly onNext: () => void;
  /** Стандарт обозначений: живёт выше экрана, сохраняется между сессиями. */
  readonly symbolStandard: SymbolStandard;
  readonly onSymbolStandardChange: (standard: SymbolStandard) => void;
}

/**
 * Экран цифрового Схема-задания: условие, Палитра и цифровой Холст с кнопкой
 * «Проверить». По нажатию снимок схемы уходит ответом в `evaluate`, который
 * прогоняет её по всем строкам таблицы истинности; вердикт живёт до первой
 * правки схемы — как у аналогового Схема-задания. Проверка статична, поэтому
 * время на экране не идёт: Генератора в Палитрах Заданий нет.
 */
export function LogicTaskScreen({
  task,
  evaluation,
  onAnswer,
  onNext,
  symbolStandard,
  onSymbolStandardChange,
}: LogicTaskScreenProps) {
  const [history, onAction] = useReducer(digitalCanvasReducer, emptyDigitalHistory);
  /** Схема на момент последней «Проверить» — для снятия устаревшего вердикта. */
  const [submitted, setSubmitted] = useState<DigitalCanvasState | null>(null);
  const shownEvaluation = submitted !== null && history.present === submitted ? evaluation : null;

  const levels = useMemo(() => evaluateDigital(history.present, 0), [history.present]);
  const faultSpot = shownEvaluation?.diagnoses.find((diagnosis) => diagnosis.spot !== null)?.spot ?? null;

  function check() {
    setSubmitted(history.present);
    onAnswer({ kind: 'logic-answer', canvas: history.present });
  }

  return (
    <section className="panel circuit-task" aria-labelledby="logic-prompt">
      <p className="question-kind">Схема-задание</p>
      <h2 id="logic-prompt" className="question-prompt">
        {task.prompt}
      </h2>
      {shownEvaluation?.outcome !== 'correct' && task.hints && <HintLadder hints={task.hints} />}
      <DigitalCanvasEditor
        palette={task.palette}
        history={history}
        onAction={onAction}
        symbolStandard={symbolStandard}
        levels={levels}
        faultComponentId={faultSpot}
        actions={
          <>
            <StandardControls standard={symbolStandard} onChange={onSymbolStandardChange} />
            <button type="button" className="button-primary canvas-check" onClick={check}>
              Проверить
            </button>
          </>
        }
      />
      {shownEvaluation !== null && <LogicVerdict evaluation={shownEvaluation} onNext={onNext} />}
    </section>
  );
}

/** Слова вердикта: у логического Схема-задания два исхода — таблица сошлась или нет. */
const LOGIC_OUTCOME_WORDING = {
  correct: { word: 'Пройдено', note: 'Схема сходится с таблицей истинности на всех наборах входов.' },
  incorrect: { word: 'Не пройдено', note: 'Правьте схему и проверяйте снова — попытки не ограничены.' },
} as const;

/** Вердикт «Проверить»: исход, Диагноз с местом ошибки и Разбор по строкам таблицы. */
function LogicVerdict({
  evaluation,
  onNext,
}: {
  readonly evaluation: LogicTaskEvaluation;
  readonly onNext: () => void;
}) {
  const { word, note } = LOGIC_OUTCOME_WORDING[evaluation.outcome];
  return (
    <section className="circuit-verdict" aria-label="Вердикт проверки" aria-live="polite">
      <p className={`verdict verdict-${evaluation.outcome}`}>
        <span className="verdict-word">{word}</span>
        <span className="verdict-note">{note}</span>
      </p>
      {evaluation.diagnoses.map((diagnosis, index) => (
        <p key={index} className="circuit-diagnosis">
          <span className="circuit-diagnosis-mark" aria-hidden="true">
            ⌖
          </span>
          {diagnosis.text}
        </p>
      ))}
      {evaluation.rowChecks.length > 0 && <TruthTable checks={evaluation.rowChecks} />}
      {evaluation.outcome === 'correct' && (
        <button type="button" className="button-primary" onClick={onNext}>
          Дальше
        </button>
      )}
    </section>
  );
}

/** Таблица истинности — Разбор проверки: требуемые уровни против получившихся. */
function TruthTable({ checks }: { readonly checks: readonly LogicRowCheck[] }) {
  const inputs = checks[0].row.inputs.length;
  const outputs = checks[0].row.outputs.length;
  return (
    <table className="logic-table" aria-label="Таблица истинности — Разбор">
      <thead>
        <tr>
          <th colSpan={inputs} scope="colgroup">
            Входы
          </th>
          <th colSpan={outputs} scope="colgroup">
            Ожидалось
          </th>
          <th colSpan={outputs} scope="colgroup">
            Получилось
          </th>
          <th aria-label="Итог" />
        </tr>
        <tr>
          {Array.from({ length: inputs }, (_, index) => (
            <th key={`in-${index}`}>{`Вход ${index + 1}`}</th>
          ))}
          {Array.from({ length: outputs }, (_, index) => (
            <th key={`out-${index}`}>{`Выход ${index + 1}`}</th>
          ))}
          {Array.from({ length: outputs }, (_, index) => (
            <th key={`got-${index}`}>{`Выход ${index + 1}`}</th>
          ))}
          <th aria-label="Строка" />
        </tr>
      </thead>
      <tbody>
        {checks.map((check, index) => (
          <tr key={index} className={check.passed ? 'logic-row-passed' : 'logic-row-failed'}>
            {check.row.inputs.map((bit, bitIndex) => (
              <td key={`in-${bitIndex}`}>{bit}</td>
            ))}
            {check.row.outputs.map((bit, bitIndex) => (
              <td key={`out-${bitIndex}`}>{bit}</td>
            ))}
            {check.actual.map((bit, bitIndex) => (
              <td key={`got-${bitIndex}`}>{bit}</td>
            ))}
            <td className="logic-row-mark" aria-label={check.passed ? 'сошлось' : 'расходится'}>
              {check.passed ? '✓' : '✗'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
