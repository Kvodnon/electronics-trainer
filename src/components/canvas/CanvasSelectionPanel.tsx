import { useState } from 'react';
import type { ComponentValuePatch, LedColor, PlacedComponent } from '../../domain/canvas';
import {
  defaultLedColor,
  defaultPotentiometerWiper,
  ledColors,
  valueFieldOf,
} from '../../domain/canvas';
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
      <ComponentValueForm
        key={`${component.id}:${component.voltage ?? component.resistance ?? component.capacitance ?? String(component.closed)}`}
        component={component}
        onApply={onValueSet}
      />
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

/** Форма номинала: батарея — напряжение, резистор/лампа/мотор/зуммер — сопротивление,
 * коммутаторы — замкнут, светодиод — цвет свечения, конденсатор — ёмкость,
 * потенциометр — сопротивление и движок; у диода и транзистора правимого поля нет. */
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
          value={component.color ?? defaultLedColor}
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

  /** Числовой номинал: поле Компонента → единица, текущее значение и правка. */
  const NUMERIC_FIELDS = {
    voltage: {
      unit: 'В' as QuantityUnit,
      value: component.voltage,
      patch: (parsed: number): ComponentValuePatch => ({ voltage: parsed }),
    },
    resistance: {
      unit: 'Ом' as QuantityUnit,
      value: component.resistance,
      patch: (parsed: number): ComponentValuePatch => ({ resistance: parsed }),
    },
    capacitance: {
      unit: 'Ф' as QuantityUnit,
      value: component.capacitance,
      patch: (parsed: number): ComponentValuePatch => ({ capacitance: parsed }),
    },
  };
  const { unit, value, patch } = NUMERIC_FIELDS[field];
  const [raw, setRaw] = useState(String(value ?? '').replace('.', ','));
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = parseQuantity(raw, unit);
    if (parsed.status === 'error') {
      setError(parsed.message);
      return;
    }
    setError(null);
    onApply(patch(parsed.value));
  }

  return (
    <>
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
      {component.kind === 'potentiometer' && (
        <PotentiometerWiper component={component} onApply={onApply} />
      )}
    </>
  );
}

/** Движок потенциометра: плавная правка положения ползунком, 0–100 %. */
function PotentiometerWiper({
  component,
  onApply,
}: {
  component: PlacedComponent;
  onApply: (patch: ComponentValuePatch) => void;
}) {
  const percent = Math.round((component.wiper ?? defaultPotentiometerWiper) * 100);
  return (
    <label className="canvas-wiper-field">
      Положение движка
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        aria-valuetext={`${percent}%`}
        onChange={(event) => onApply({ wiper: Number(event.target.value) / 100 })}
      />
      <span className="canvas-wiper-percent">{percent}%</span>
    </label>
  );
}
