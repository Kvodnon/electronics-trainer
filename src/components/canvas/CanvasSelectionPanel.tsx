import { useState } from 'react';
import type { ComponentValuePatch, LedColor, PlacedComponent } from '../../domain/canvas';
import { ledColors, valueFieldOf } from '../../domain/canvas';
import { parseQuantity, type QuantityUnit } from '../../domain/quantity';
import { ledColorTitles } from './CanvasSymbols';

/**
 * Панель правки выбранного на Холсте: номинал Компонента, поворот и удаление
 * (или удаление выбранного Провода). Тонкий слой: правки уходят действиями
 * редьюсера Холста.
 */

interface CanvasSelectionPanelProps {
  readonly component: PlacedComponent;
  readonly name: string;
  readonly onRotate: () => void;
  readonly onRemove: () => void;
  readonly onValueSet: (patch: ComponentValuePatch) => void;
}

export function CanvasSelectionPanel({
  component,
  name,
  onRotate,
  onRemove,
  onValueSet,
}: CanvasSelectionPanelProps) {
  return (
    <div className="canvas-selection">
      <p className="canvas-selection-name">{name}</p>
      <ComponentValueForm key={`${component.id}:${component.voltage ?? component.resistance ?? String(component.closed)}`} component={component} onApply={onValueSet} />
      <div className="canvas-selection-actions">
        <button type="button" className="button-secondary" onClick={onRotate}>
          Повернуть
        </button>
        <button type="button" className="button-secondary button-danger" onClick={onRemove}>
          Удалить
        </button>
      </div>
    </div>
  );
}

/** Форма номинала: батарея — напряжение, резистор/лампа/мотор — сопротивление,
 * коммутаторы — замкнут, светодиод — цвет свечения; у диода правимого поля нет. */
function ComponentValueForm({
  component,
  onApply,
}: {
  component: PlacedComponent;
  onApply: (patch: ComponentValuePatch) => void;
}) {
  const field = valueFieldOf(component.kind);

  if (field === 'none') return null;

  if (field === 'color') {
    return (
      <label className="canvas-color-field">
        Цвет свечения
        <select
          value={component.color ?? 'red'}
          onChange={(event) => onApply({ color: event.target.value as LedColor })}
        >
          {ledColors.map((color) => (
            <option key={color} value={color}>
              {ledColorTitles[color]}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field === 'closed') {
    return (
      <label className="canvas-value-toggle">
        <input
          type="checkbox"
          checked={component.closed ?? false}
          onChange={(event) => onApply({ closed: event.target.checked })}
        />
        замкнут
      </label>
    );
  }

  const unit: QuantityUnit = field === 'voltage' ? 'В' : 'Ом';
  const value = field === 'voltage' ? component.voltage : component.resistance;
  const [raw, setRaw] = useState(String(value ?? '').replace('.', ','));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = parseQuantity(raw, unit);
    if (parsed.status === 'error') {
      setError(parsed.message);
      return;
    }
    setError(null);
    onApply(field === 'voltage' ? { voltage: parsed.value } : { resistance: parsed.value });
  }

  return (
    <form
      className="canvas-value-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={`canvas-value-${component.id}`}>Номинал, {unit}</label>
      <input
        id={`canvas-value-${component.id}`}
        className="numeric-input-field"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        aria-invalid={error !== null}
      />
      <button type="submit" className="button-primary">
        Применить
      </button>
      {error !== null && <p className="input-error">{error}</p>}
    </form>
  );
}
