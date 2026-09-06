import { useReducer, useMemo, useState } from 'react';
import type { CircuitTask } from '../../domain/task';
import { canvasReducer, emptyHistory, type CanvasState, type PinRef } from '../../domain/canvas';
import type { SymbolStandard } from '../../domain/symbols';
import { symbolStandards } from '../../domain/symbols';
import type { CircuitAnswer, CircuitOutcome, CircuitTaskEvaluation } from '../../domain/evaluate';
import type { CircuitDiagnosisSpot } from '../../domain/circuitDiagnoses';
import {
  readingsByComponent,
  solveDc,
  wireCurrents,
  type ComponentReading,
  type DcSolution,
} from '../../domain/simulator';
import {
  emptyProbes,
  measure,
  type MultimeterMode,
  type MultimeterProbes,
} from '../../domain/multimeter';
import { formatQuantity } from '../../domain/quantity';
import { CanvasEditor, type CanvasOverlay } from './CanvasEditor';
import { standardTitles } from './CanvasSymbols';

interface CircuitTaskScreenProps {
  readonly task: CircuitTask;
  readonly evaluation: CircuitTaskEvaluation | null;
  readonly onAnswer: (answer: CircuitAnswer) => void;
  readonly onNext: () => void;
  /** Стандарт обозначений: живёт выше экрана, сохраняется между сессиями. */
  readonly symbolStandard: SymbolStandard;
  readonly onSymbolStandardChange: (standard: SymbolStandard) => void;
}

/**
 * Экран Схема-задания: условие, Палитра и Холст с кнопкой «Проверить».
 * Состояние Холста живёт здесь: по нажатию «Проверить» снимок схемы уходит
 * ответом в `evaluate` (Симулятор считает токи и напряжения), вердикт
 * показывается, пока схема не изменилась — после правки Разбор снимается,
 * чтобы не врать устаревшими числами. Живое поведение (свечение лампочки,
 * вращение моторчика) и Мультиметр считаются по текущей схеме на каждое её
 * изменение; числовой оверлей и подсветка места ошибки — только по вердикту.
 * Стандарт обозначений приходит снаружи: переключатель меняет только
 * отрисовку, собранная схема остаётся как была.
 */
export function CircuitTaskScreen({
  task,
  evaluation,
  onAnswer,
  onNext,
  symbolStandard,
  onSymbolStandardChange,
}: CircuitTaskScreenProps) {
  const [history, onAction] = useReducer(canvasReducer, emptyHistory);
  /** Схема на момент последней «Проверить» — для снятия устаревшего вердикта. */
  const [submitted, setSubmitted] = useState<CanvasState | null>(null);
  const [showReadings, setShowReadings] = useState(false);
  const shownEvaluation = submitted !== null && history.present === submitted ? evaluation : null;

  /** Живое решение схемы: пересчёт на каждое изменение Холста; сбой — null. */
  const liveSolution = useMemo<DcSolution | null>(() => {
    try {
      return solveDc(history.present);
    } catch {
      return null;
    }
  }, [history.present]);

  /** Живое поведение Холста: лампочка светится, моторчик вращается. */
  const liveReadings = useMemo(
    () => (liveSolution === null ? new Map<string, ComponentReading>() : readingsByComponent(liveSolution)),
    [liveSolution],
  );

  /** Мультиметр: включённость, режим и приложенные щупы (точки или ветвь). */
  const [multimeterOn, setMultimeterOn] = useState(false);
  const [multimeterMode, setMultimeterMode] = useState<MultimeterMode>('voltage');
  const [probes, setProbes] = useState<MultimeterProbes>(emptyProbes);
  /** Какой щуп приложится следующим кликом по точке: красный, затем чёрный. */
  const [nextProbe, setNextProbe] = useState<'red' | 'black'>('red');

  function clearProbes() {
    setProbes(emptyProbes);
    setNextProbe('red');
  }

  function toggleMultimeter(on: boolean) {
    setMultimeterOn(on);
    clearProbes();
  }

  function changeMultimeterMode(mode: MultimeterMode) {
    setMultimeterMode(mode);
    clearProbes();
  }

  function applyPinProbe(ref: PinRef) {
    if (nextProbe === 'red') setProbes((current) => ({ ...current, red: ref }));
    else setProbes((current) => ({ ...current, black: ref }));
    setNextProbe(nextProbe === 'red' ? 'black' : 'red');
  }

  function applyBranchProbe(componentId: string) {
    setProbes((current) => ({ ...current, branch: componentId }));
  }

  /** Показание Мультиметра: из живого решения, обновляется с любым изменением схемы. */
  const multimeterResult = useMemo(
    () => (multimeterOn ? measure(liveSolution, multimeterMode, probes) : { status: 'idle' as const }),
    [multimeterOn, multimeterMode, probes, liveSolution],
  );

  /** Оверлей токов и напряжений — по решению, на котором построен вердикт. */
  const overlay = useMemo<CanvasOverlay | null>(() => {
    if (shownEvaluation === null || !showReadings) return null;
    return {
      componentReadings: readingsByComponent(shownEvaluation.solution),
      wireCurrents: new Map(
        wireCurrents(history.present, shownEvaluation.solution).map((entry) => [entry.wireId, entry.current]),
      ),
    };
  }, [shownEvaluation, showReadings, history.present]);

  const faultSpot: CircuitDiagnosisSpot | null =
    shownEvaluation?.diagnoses.find((diagnosis) => diagnosis.spot !== null)?.spot ?? null;

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
        symbolStandard={symbolStandard}
        liveReadings={liveReadings}
        overlay={overlay}
        faultSpot={faultSpot}
        multimeter={
          multimeterOn
            ? {
                mode: multimeterMode,
                probes,
                onPinProbe: applyPinProbe,
                onBranchProbe: applyBranchProbe,
                onClearProbes: clearProbes,
              }
            : null
        }
        actions={
          <>
            <label className="multimeter-toggle">
              <input
                type="checkbox"
                checked={multimeterOn}
                onChange={(event) => toggleMultimeter(event.target.checked)}
              />
              Мультиметр
            </label>
            {multimeterOn && (
              <span className="multimeter">
                <select
                  className="multimeter-mode"
                  aria-label="Режим мультиметра"
                  value={multimeterMode}
                  onChange={(event) => changeMultimeterMode(event.target.value as MultimeterMode)}
                >
                  <option value="voltage">Напряжение</option>
                  <option value="current">Ток</option>
                </select>
                <output
                  className={`multimeter-display${
                    multimeterResult.status === 'unavailable' ? ' multimeter-display-unavailable' : ''
                  }`}
                  aria-live="polite"
                  title={
                    multimeterResult.status === 'unavailable'
                      ? 'Между щупами нет общей цепи — измерение невозможно'
                      : undefined
                  }
                >
                  {multimeterResult.status === 'ok'
                    ? formatQuantity(multimeterResult.reading.value, multimeterResult.reading.unit)
                    : '—'}
                </output>
              </span>
            )}
            <label className="overlay-toggle">
              <input
                type="checkbox"
                checked={showReadings}
                disabled={shownEvaluation === null}
                onChange={(event) => setShowReadings(event.target.checked)}
              />
              Токи и напряжения
            </label>
            <label className="standard-toggle">
              Обозначения
              <select
                className="standard-select"
                value={symbolStandard}
                onChange={(event) =>
                  onSymbolStandardChange(event.target.value as SymbolStandard)
                }
              >
                {symbolStandards.map((standard) => (
                  <option key={standard} value={standard}>
                    {standardTitles[standard]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="button-primary canvas-check" onClick={check}>
              Проверить
            </button>
          </>
        }
      />
      {shownEvaluation !== null && (
        <CircuitVerdict evaluation={shownEvaluation} onNext={onNext} />
      )}
    </section>
  );
}

/** Слова и настроения вердикта для каждого исхода проверки. */
const OUTCOME_WORDING: Record<CircuitOutcome, { word: string; note: string }> = {
  correct: { word: 'Пройдено', note: 'Схема работает по условию Задания.' },
  'works-not-per-task': {
    word: 'Работает, но не по условию',
    note: 'Схема подаёт жизнь, но условию не отвечает — сверяйтесь с Разбором и правьте.',
  },
  incorrect: { word: 'Не пройдено', note: 'Правьте схему и проверяйте снова — попытки не ограничены.' },
};

/** Вердикт «Проверить»: исход, Диагноз с местом ошибки и Разбор условий. */
function CircuitVerdict({
  evaluation,
  onNext,
}: {
  readonly evaluation: CircuitTaskEvaluation;
  readonly onNext: () => void;
}) {
  const { word, note } = OUTCOME_WORDING[evaluation.outcome];
  return (
    <section className="circuit-verdict" aria-label="Вердикт проверки" aria-live="polite">
      <p className={`verdict verdict-${evaluation.outcome}`}>
        <span className="verdict-word">{word}</span>
        <span className="verdict-note">{note}</span>
      </p>
      {evaluation.diagnoses.map((diagnosis, index) => (
        <p key={index} className={`circuit-diagnosis circuit-diagnosis-${diagnosis.kind}`}>
          <span className="circuit-diagnosis-mark" aria-hidden="true">
            ⌖
          </span>
          {diagnosis.text}
        </p>
      ))}
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
      {evaluation.outcome === 'correct' && (
        <button type="button" className="button-primary" onClick={onNext}>
          Дальше
        </button>
      )}
    </section>
  );
}
