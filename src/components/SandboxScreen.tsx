import { useReducer, useMemo, useState } from 'react';
import { canvasReducer, emptyHistory, type CanvasState, type ComponentKind } from '../domain/canvas';
import { isValidCircuitName, type SavedCircuit } from '../domain/sandbox';
import { solveTransient, type TransientSolution } from '../domain/transient';
import type { TransientPlan } from '../domain/task';
import type { SymbolStandard } from '../domain/symbols';
import { CanvasEditor } from './canvas/CanvasEditor';
import { useLiveCircuit, useMultimeter } from './canvas/liveCircuit';
import { MultimeterControls, StandardControls } from './canvas/ToolbarControls';
import { OscilloscopePanel, useTransientPlayback } from './canvas/OscilloscopePanel';

interface SandboxScreenProps {
  /** Палитра Песочницы: Компоненты, открытые текущим Прогрессом Курса. */
  readonly palette: readonly ComponentKind[];
  /** Сохранённые схемы ученика; живут в App — переживают выход и перезагрузку. */
  readonly circuits: readonly SavedCircuit[];
  readonly onSaveCircuit: (name: string, canvas: CanvasState) => void;
  readonly onDeleteCircuit: (circuitId: string) => void;
  readonly symbolStandard: SymbolStandard;
  readonly onSymbolStandardChange: (standard: SymbolStandard) => void;
  readonly onExit: () => void;
}

/**
 * Песочница (CONTEXT.md): режим без Заданий и проверки. Та же кинематика
 * Холста, что у Схема-задания — живое поведение, Мультиметр, переключатель
 * стандарта, — но без «Проверить», оверлея и вердиктов: Симулятор считается
 * на каждое изменение схемы сам по себе. Рядом — «Мои схемы»: сохранение
 * под именем, загрузка и удаление. Для схем с конденсатором — Осциллограф:
 * переходный режим по фиксированному плану, коммутаторы переключаются
 * на середине проигрывания (замкнутый размыкается — разряд через резистор,
 * разомкнутый замыкается — заряд).
 */

/** План переходного режима Песочницы: 5 секунд с переключением на середине. */
const SANDBOX_TRANSIENT_PLAN: TransientPlan = { duration: 5, switchToggleTime: 2.5 };
export function SandboxScreen({
  palette,
  circuits,
  onSaveCircuit,
  onDeleteCircuit,
  symbolStandard,
  onSymbolStandardChange,
  onExit,
}: SandboxScreenProps) {
  const [history, onAction] = useReducer(canvasReducer, emptyHistory);
  const { solution, readings: liveReadings } = useLiveCircuit(history);
  const multimeter = useMultimeter(solution);
  const [name, setName] = useState('');

  /** Переходный режим песочницы: считается на каждое изменение схемы. */
  const transient = useMemo<TransientSolution | null>(() => {
    try {
      return solveTransient(history.present, SANDBOX_TRANSIENT_PLAN);
    } catch {
      return null;
    }
  }, [history.present]);
  const playback = useTransientPlayback(transient);

  function loadCircuit(circuit: SavedCircuit) {
    onAction({ type: 'canvas-loaded', canvas: circuit.canvas });
  }

  function saveCircuit() {
    if (!isValidCircuitName(name)) return;
    onSaveCircuit(name, history.present);
    setName('');
  }

  return (
    <div className="sandbox-screen">
      <header className="module-header">
        <button type="button" className="link-back" onClick={onExit}>
          ← К Курсу
        </button>
        <h2 className="module-header-title">Песочница</h2>
      </header>

      <section className="panel" aria-label="Свободный Холст">
        <p className="question-kind">Без условий и проверки</p>
        <p className="sandbox-intro">
          Собирайте что угодно из Компонентов, открытых Курсом: схема живёт сразу —
          Симулятор пересчитывает её на каждое изменение, Мультиметр измеряет в любой момент.
          Для схем с конденсатором осциллограф проигрывает заряд и разряд во времени.
        </p>
        <CanvasEditor
          palette={palette}
          history={history}
          onAction={onAction}
          symbolStandard={symbolStandard}
          liveReadings={liveReadings}
          capacitorFill={playback.fillLevels}
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
              <StandardControls standard={symbolStandard} onChange={onSymbolStandardChange} />
            </>
          }
        />
        {transient !== null && (
          <OscilloscopePanel plan={SANDBOX_TRANSIENT_PLAN} transient={transient} playback={playback} />
        )}
      </section>

      <SandboxCircuits
        circuits={circuits}
        name={name}
        canSave={isValidCircuitName(name)}
        onNameChange={setName}
        onSave={saveCircuit}
        onLoad={loadCircuit}
        onDelete={onDeleteCircuit}
      />
    </div>
  );
}

interface SandboxCircuitsProps {
  readonly circuits: readonly SavedCircuit[];
  readonly name: string;
  readonly canSave: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onSave: () => void;
  readonly onLoad: (circuit: SavedCircuit) => void;
  readonly onDelete: (circuitId: string) => void;
}

/** «Мои схемы»: сохранение текущего Холста под именем, загрузка и удаление. */
function SandboxCircuits({
  circuits,
  name,
  canSave,
  onNameChange,
  onSave,
  onLoad,
  onDelete,
}: SandboxCircuitsProps) {
  return (
    <section className="panel sandbox-circuits" aria-labelledby="sandbox-circuits-heading">
      <h2 id="sandbox-circuits-heading">Мои схемы</h2>
      <form
        className="sandbox-save"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <input
          className="sandbox-name-field"
          aria-label="Название схемы"
          placeholder="Название схемы"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <button type="submit" className="button-primary" disabled={!canSave}>
          Сохранить схему
        </button>
        <p className="sandbox-save-note">
          Сохраняется схема, как она сейчас на Холсте. То же имя — перезапись.
        </p>
      </form>
      {circuits.length === 0 ? (
        <p className="sandbox-circuits-empty">
          Пока ничего не сохранено: соберите схему и дайте ей имя.
        </p>
      ) : (
        <ul className="sandbox-circuit-list">
          {circuits.map((circuit) => (
            <li key={circuit.id} className="sandbox-circuit">
              <span className="sandbox-circuit-name">{circuit.name}</span>
              <span className="sandbox-circuit-actions">
                <button
                  type="button"
                  className="button-secondary"
                  aria-label={`Загрузить «${circuit.name}»`}
                  onClick={() => onLoad(circuit)}
                >
                  Загрузить
                </button>
                <button
                  type="button"
                  className="button-secondary button-danger"
                  aria-label={`Удалить «${circuit.name}»`}
                  onClick={() => onDelete(circuit.id)}
                >
                  Удалить
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
