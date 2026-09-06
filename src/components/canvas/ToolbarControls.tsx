import type { MultimeterMode, MultimeterResult } from '../../domain/multimeter';
import { formatQuantity } from '../../domain/quantity';
import { symbolStandards, type SymbolStandard } from '../../domain/symbols';
import { standardTitles } from './CanvasSymbols';

/**
 * Общие органы управления Холста, одинаковые у Схема-задания и Песочницы:
 * тумблер и табло Мультиметра, переключатель стандарта обозначений.
 * Кнопка «Проверить» сюда не входит — она есть только у Схема-задания.
 */

interface MultimeterControlsProps {
  readonly on: boolean;
  readonly mode: MultimeterMode;
  readonly result: MultimeterResult;
  readonly onToggle: (on: boolean) => void;
  readonly onModeChange: (mode: MultimeterMode) => void;
}

/** Тумблер Мультиметра; во включённом состоянии — выбор режима и табло. */
export function MultimeterControls({ on, mode, result, onToggle, onModeChange }: MultimeterControlsProps) {
  return (
    <>
      <label className="multimeter-toggle">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => onToggle(event.target.checked)}
        />
        Мультиметр
      </label>
      {on && (
        <span className="multimeter">
          <select
            className="multimeter-mode"
            aria-label="Режим мультиметра"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as MultimeterMode)}
          >
            <option value="voltage">Напряжение</option>
            <option value="current">Ток</option>
          </select>
          <output
            className={`multimeter-display${
              result.status === 'unavailable' ? ' multimeter-display-unavailable' : ''
            }`}
            aria-live="polite"
            title={
              result.status === 'unavailable'
                ? 'Между щупами нет общей цепи — измерение невозможно'
                : undefined
            }
          >
            {result.status === 'ok'
              ? formatQuantity(result.reading.value, result.reading.unit)
              : '—'}
          </output>
        </span>
      )}
    </>
  );
}

interface StandardControlsProps {
  readonly standard: SymbolStandard;
  readonly onChange: (standard: SymbolStandard) => void;
}

/** Переключатель обозначений ГОСТ/ANSI: меняет отрисовку, не схему. */
export function StandardControls({ standard, onChange }: StandardControlsProps) {
  return (
    <label className="standard-toggle">
      Обозначения
      <select
        className="standard-select"
        value={standard}
        onChange={(event) => onChange(event.target.value as SymbolStandard)}
      >
        {symbolStandards.map((option) => (
          <option key={option} value={option}>
            {standardTitles[option]}
          </option>
        ))}
      </select>
    </label>
  );
}
