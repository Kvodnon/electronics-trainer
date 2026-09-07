import { useReducer, useMemo, useState } from 'react';
import type { CircuitTask } from '../../domain/task';
import { canvasReducer, emptyHistory, type CanvasState } from '../../domain/canvas';
import type { SymbolStandard } from '../../domain/symbols';
import type { CircuitAnswer, CircuitOutcome, CircuitTaskEvaluation } from '../../domain/evaluate';
import type { CircuitDiagnosisSpot } from '../../domain/circuitDiagnoses';
import { solveTransient, type TransientSolution } from '../../domain/transient';
import { HintLadder } from '../HintLadder';
import { acAmplitudesOf } from '../../domain/phasor';
import { readingsByComponent, wireCurrents } from '../../domain/simulator';
import { useLiveCircuit, useMultimeter } from './liveCircuit';
import { MultimeterControls, StandardControls } from './ToolbarControls';
import { CanvasEditor, type CanvasOverlay } from './CanvasEditor';
import { OscilloscopePanel, useTransientPlayback, type ScopeSignalCurve } from './OscilloscopePanel';
import { FrequencyResponsePanel } from './FrequencyResponsePanel';
import { componentTitles } from './CanvasSymbols';

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
 * изменение (общие хуки с Песочницей); числовой оверлей и подсветка места
 * ошибки — только по вердикту. Стандарт обозначений приходит снаружи:
 * переключатель меняет только отрисовку, собранная схема остаётся как была.
 * Задание с переходным режимом дополнительно показывает Осциллограф:
 * кривая напряжения во времени перестраивается вместе со схемой, а
 * «Проиграть» ведёт бегунок по кривой и наполняет конденсатор на Холсте.
 * У выпрямителя осциллограф рисует сигнал до и после диода, у фильтра
 * под Холстом строится АЧХ свипом фазоров с курсором на частоте источника.
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

  const { solution: liveSolution, readings: liveReadings } = useLiveCircuit(history);
  const multimeter = useMultimeter(liveSolution);

  /** Переходный режим живёт на каждое изменение схемы: осциллограф строится по нему. */
  const transient = useMemo<TransientSolution | null>(() => {
    if (task.transient === undefined) return null;
    try {
      return solveTransient(history.present, task.transient);
    } catch {
      return null;
    }
  }, [history.present, task.transient]);
  const playback = useTransientPlayback(transient);

  /**
   * Сигнальные кривые выпрямителя (тикет 21): вход — источник ~ («до диода»),
   * выход — первый Компонент вида из условия формы («после диода»; та же
   * конвенция первого Компонента вида, что у кривой АЧХ). Ложатся поверх
   * осциллографа с легендой; без выпрямительного условия их нет.
   */
  const signalCurves = useMemo<readonly ScopeSignalCurve[]>(() => {
    if (transient === null) return [];
    const shape = task.conditions.find((condition) => condition.kind === 'rectified-output');
    if (shape === undefined || shape.kind !== 'rectified-output') return [];
    const curves: ScopeSignalCurve[] = [];
    const source = history.present.components.find((component) => component.kind === 'acsource');
    const sourceCurve = source !== undefined ? transient.componentVoltages.get(source.id) : undefined;
    if (source !== undefined && sourceCurve !== undefined) {
      curves.push({
        key: `${source.id}:source`,
        label: 'источник ~ (до диода)',
        values: sourceCurve,
        className: 'scope-curve-source',
      });
    }
    const load = history.present.components.find((component) => component.kind === shape.componentKind);
    const loadCurve = load !== undefined ? transient.componentVoltages.get(load.id) : undefined;
    if (load !== undefined && loadCurve !== undefined) {
      curves.push({
        key: `${load.id}:output`,
        label: `нагрузка (${componentTitles[load.kind].toLowerCase()}) — после диода`,
        values: loadCurve,
        className: 'scope-curve-output',
      });
    }
    return curves;
  }, [transient, task.conditions, history.present]);

  /**
   * Фильтрное условие Задания (тикет 21): по нему строится панель АЧХ —
   * свип фазоров по частоте с курсором на частоте источника.
   */
  const filterCondition = task.conditions.find((condition) => condition.kind === 'attenuates-frequency');

  /** Оверлей токов и напряжений — по решению, на котором построен вердикт.
   * В схемах с источником ~ поверх постоянных значений показываются амплитуды. */
  const overlay = useMemo<CanvasOverlay | null>(() => {
    if (shownEvaluation === null || !showReadings) return null;
    return {
      componentReadings: readingsByComponent(shownEvaluation.solution.dc),
      wireCurrents: new Map(
        wireCurrents(history.present, shownEvaluation.solution.dc).map((entry) => [entry.wireId, entry.current]),
      ),
      ac: acAmplitudesOf(history.present, shownEvaluation.solution) ?? undefined,
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
      <p className="question-kind">{task.isExam ? 'Экзамен' : 'Схема-задание'}</p>
      <h2 id="circuit-prompt" className="question-prompt">
        {task.prompt}
      </h2>
      {shownEvaluation?.outcome !== 'correct' && task.hints && (
        <HintLadder hints={task.hints} />
      )}
      <CanvasEditor
        palette={task.palette}
        history={history}
        onAction={onAction}
        symbolStandard={symbolStandard}
        liveReadings={liveReadings}
        capacitorFill={playback.fillLevels}
        overlay={overlay}
        faultSpot={faultSpot}
        multimeter={multimeter.gestures}
        actions={
          <>
            <MultimeterControls
              on={multimeter.on}
              mode={multimeter.mode}
              result={multimeter.result}
              onToggle={multimeter.toggle}
              onModeChange={multimeter.changeMode}
            />
            <label className="overlay-toggle">
              <input
                type="checkbox"
                checked={showReadings}
                disabled={shownEvaluation === null}
                onChange={(event) => setShowReadings(event.target.checked)}
              />
              Токи и напряжения
            </label>
            <StandardControls standard={symbolStandard} onChange={onSymbolStandardChange} />
            <button type="button" className="button-primary canvas-check" onClick={check}>
              Проверить
            </button>
          </>
        }
      />
      {transient !== null && task.transient !== undefined && (
        <OscilloscopePanel plan={task.transient} transient={transient} playback={playback} signalCurves={signalCurves} />
      )}
      {filterCondition !== undefined && filterCondition.kind === 'attenuates-frequency' && (
        <FrequencyResponsePanel canvas={history.present} outputKind={filterCondition.componentKind} />
      )}
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
