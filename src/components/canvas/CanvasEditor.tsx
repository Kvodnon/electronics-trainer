import { useReducer, useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  canvasReducer,
  emptyHistory,
  suggestPlacementPosition,
  type ComponentKind,
  type ComponentValuePatch,
  type PlacedComponent,
  type PinRef,
} from '../../domain/canvas';
import {
  CANVAS_SIZE,
  clampPosition,
  pinPointOf,
  routeWire,
  snapToGrid,
  type DirectedPoint,
  type Point,
} from '../../domain/canvasGeometry';
import { parseQuantity, type QuantityUnit } from '../../domain/quantity';
import { CanvasSymbolBody, PaletteSymbol, componentTitles, componentValueLabel } from './CanvasSymbols';

/**
 * Редактор Холста: тонкий слой над домен-редьюсером. Вся логика редактора
 * (постановка, перемещение, поворот, удаление, Провода, номиналы, undo/redo,
 * сброс) — действия `canvasReducer`; здесь только мышиные жесты и отрисовка.
 * Перетаскивание Компонента рисуется поверх состояния и фиксируется в
 * редьюсер одним действием на отпускании кнопки.
 */

type Selection = { kind: 'component' | 'wire'; id: string } | null;

interface DragState {
  readonly componentId: string;
  /** Указатель − центр Компонента на старте, чтобы курсор не «прыгал». */
  readonly grabOffset: Point;
  readonly position: Point;
  readonly moved: boolean;
}

interface WireDraftState {
  readonly from: PinRef;
  readonly cursor: Point;
}

export function CanvasEditor({ palette }: { palette: readonly ComponentKind[] }) {
  const [history, dispatch] = useReducer(canvasReducer, emptyHistory);
  const canvas = history.present;
  const [selection, setSelection] = useState<Selection>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraftState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const components = canvas.components;
  const selectedComponent =
    selection !== null && selection.kind === 'component'
      ? (components.find((c) => c.id === selection.id) ?? null)
      : null;

  /** Компонент с текущей позицией перетаскивания — для живой перерисовки Проводов. */
  const withDrag = (component: PlacedComponent): PlacedComponent =>
    drag !== null && drag.componentId === component.id
      ? { ...component, x: drag.position.x, y: drag.position.y }
      : component;

  function pointFromEvent(event: { clientX: number; clientY: number }): Point {
    const svg = svgRef.current;
    if (svg === null) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE.width,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE.height,
    };
  }

  function placeFromPalette(kind: ComponentKind) {
    const spot = suggestPlacementPosition(canvas);
    dispatch({ type: 'component-placed', kind, x: spot.x, y: spot.y });
    setWireDraft(null);
  }

  function beginDrag(component: PlacedComponent, event: ReactMouseEvent) {
    // Правая кнопка не тащит
    if (event.button !== 0) return;
    event.stopPropagation();
    const pointer = pointFromEvent(event);
    setSelection({ kind: 'component', id: component.id });
    setWireDraft(null);
    setDrag({
      componentId: component.id,
      grabOffset: { x: pointer.x - component.x, y: pointer.y - component.y },
      position: { x: component.x, y: component.y },
      moved: false,
    });
  }

  function trackPointer(event: ReactMouseEvent) {
    const pointer = pointFromEvent(event);
    if (drag !== null) {
      const target = clampPosition({
        x: snapToGrid(pointer.x - drag.grabOffset.x),
        y: snapToGrid(pointer.y - drag.grabOffset.y),
      });
      setDrag({ ...drag, position: target, moved: true });
      return;
    }
    if (wireDraft !== null) {
      setWireDraft({ ...wireDraft, cursor: { x: snapToGrid(pointer.x), y: snapToGrid(pointer.y) } });
    }
  }

  function endDrag() {
    if (drag === null) return;
    const original = components.find((c) => c.id === drag.componentId);
    if (original && (original.x !== drag.position.x || original.y !== drag.position.y)) {
      dispatch({
        type: 'component-moved',
        componentId: drag.componentId,
        x: drag.position.x,
        y: drag.position.y,
      });
    }
    setDrag(null);
  }

  function handlePinClick(ref: PinRef, event: ReactMouseEvent) {
    event.stopPropagation();
    const component = components.find((c) => c.id === ref.componentId);
    if (component === undefined) return;
    if (wireDraft === null) {
      const origin = pinPointOf(component, ref.pin);
      setSelection(null);
      setWireDraft({ from: ref, cursor: { x: origin.x, y: origin.y } });
      return;
    }
    dispatch({ type: 'wire-drawn', from: wireDraft.from, to: ref });
    setWireDraft(null);
  }

  function clearCanvasInteraction() {
    setSelection(null);
    setWireDraft(null);
  }

  function removeSelection() {
    if (selection === null) return;
    dispatch(
      selection.kind === 'component'
        ? { type: 'component-removed', componentId: selection.id }
        : { type: 'wire-removed', wireId: selection.id },
    );
    setSelection(null);
  }

  function rotateSelection() {
    if (selectedComponent === null) return;
    dispatch({ type: 'component-rotated', componentId: selectedComponent.id });
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    // набор в поле номинала не управляет редактором
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') {
      setWireDraft(null);
      setSelection(null);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelection();
      return;
    }
    // R и «к» — одна клавиша в латинской и русской раскладках
    if (event.key === 'r' || event.key === 'R' || event.key === 'к' || event.key === 'К') {
      rotateSelection();
    }
  }

  function handleDrop(event: ReactDragEvent) {
    const kind = event.dataTransfer.getData('text/component-kind') as ComponentKind;
    if (!kind) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    dispatch({ type: 'component-placed', kind, x: point.x, y: point.y });
  }

  const wireFrom = (ref: PinRef): DirectedPoint => {
    const component = components.find((c) => c.id === ref.componentId);
    if (component === undefined) return { x: 0, y: 0, dx: 0, dy: 0 };
    return pinPointOf(withDrag(component), ref.pin);
  };

  const componentIndex = new Map(components.map((c, index) => [c.id, index + 1]));
  const componentName = (id: string): string => {
    const component = components.find((c) => c.id === id);
    return component === undefined
      ? ''
      : `${componentTitles[component.kind]} ${componentIndex.get(id) ?? ''}`.trim();
  };

  return (
    <div
      ref={rootRef}
      className="canvas-editor"
      tabIndex={0}
      aria-label="Холст: соберите схему"
      onKeyDown={handleKeyDown}
      onMouseDown={() => rootRef.current?.focus()}
    >
      <div className="palette" role="group" aria-label="Палитра Компонентов">
        {palette.map((kind) => (
          <button
            key={kind}
            type="button"
            className="palette-item"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/component-kind', kind)}
            onClick={() => placeFromPalette(kind)}
            title={`Поставить: ${componentTitles[kind]}`}
          >
            <PaletteSymbol kind={kind} />
            <span className="palette-item-name">{componentTitles[kind]}</span>
          </button>
        ))}
      </div>

      <div className="canvas-toolbar">
        <button
          type="button"
          className="button-secondary"
          disabled={history.past.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
        >
          Отменить
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={history.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
        >
          Вернуть
        </button>
        <button
          type="button"
          className="button-secondary button-danger"
          disabled={canvas.components.length === 0 && canvas.wires.length === 0}
          onClick={() => {
            dispatch({ type: 'canvas-reset' });
            clearCanvasInteraction();
          }}
        >
          Сбросить схему
        </button>
        <span className="canvas-toolbar-hint">
          {wireDraft !== null
            ? 'Проведите Провод до второго вывода; Esc — отменить'
            : 'Клик по выводу — тянуть Провод; перетаскивание — перемещение'}
        </span>
      </div>

      <svg
        ref={svgRef}
        className="canvas-svg"
        viewBox={`0 0 ${CANVAS_SIZE.width} ${CANVAS_SIZE.height}`}
        aria-label="Рабочее поле схемы"
        onMouseMove={trackPointer}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <defs>
          <pattern id="canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 H0 V20" className="canvas-grid-line" />
          </pattern>
        </defs>
        <rect
          className="canvas-hit"
          width={CANVAS_SIZE.width}
          height={CANVAS_SIZE.height}
          fill="url(#canvas-grid)"
          onMouseDown={clearCanvasInteraction}
        />

        {canvas.wires.map((wire) => {
          const route = routeWire(wireFrom(wire.from), wireFrom(wire.to));
          const points = route.map((point) => `${point.x},${point.y}`).join(' ');
          const selected = selection?.kind === 'wire' && selection.id === wire.id;
          return (
            <g
              key={wire.id}
              className={`wire ${selected ? 'wire-selected' : ''}`}
              role="button"
              aria-label={`Провод ${wire.id}`}
              onClick={(event) => {
                event.stopPropagation();
                setSelection({ kind: 'wire', id: wire.id });
              }}
            >
              <polyline className="wire-hit" points={points} />
              <polyline className="wire-line" points={points} />
            </g>
          );
        })}

        {wireDraft !== null && components.some((c) => c.id === wireDraft.from.componentId) && (
          <DraftWire draft={wireDraft} from={wireFrom(wireDraft.from)} />
        )}

        {components.map((component) => {
          const shown = withDrag(component);
          const selected = selection?.kind === 'component' && selection.id === component.id;
          return (
            <g
              key={component.id}
              className={`canvas-component ${selected ? 'canvas-component-selected' : ''} ${
                drag !== null && drag.componentId === component.id ? 'canvas-component-dragged' : ''
              }`}
              role="button"
              aria-label={componentName(component.id)}
              transform={`translate(${shown.x} ${shown.y}) rotate(${component.rotation})`}
              onMouseDown={(event) => beginDrag(component, event)}
            >
              <circle className="canvas-component-hit" r="34" />
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <CanvasSymbolBody component={component} />
              </g>
            </g>
          );
        })}

        {components.map((component) => (
          <text
            key={`${component.id}:label`}
            className="canvas-label"
            x={withDrag(component).x}
            y={withDrag(component).y - 38}
            textAnchor="middle"
          >
            {componentValueLabel(component)}
          </text>
        ))}

        {components.map((component) =>
          [0, 1].map((pin) => {
            const point = pinPointOf(withDrag(component), pin);
            const isDraftSource =
              wireDraft !== null &&
              wireDraft.from.componentId === component.id &&
              wireDraft.from.pin === pin;
            return (
              <circle
                key={`${component.id}:pin${pin}`}
                className={`canvas-pin ${isDraftSource ? 'canvas-pin-source' : ''}`}
                role="button"
                aria-label={`Вывод ${pin + 1}: ${componentName(component.id)}`}
                cx={point.x}
                cy={point.y}
                r={isDraftSource ? 6.5 : 5}
                onMouseDown={(event) => handlePinClick({ componentId: component.id, pin }, event)}
              />
            );
          }),
        )}
      </svg>

      {selectedComponent !== null ? (
        <div className="canvas-selection">
          <p className="canvas-selection-name">{componentName(selectedComponent.id)}</p>
          <ComponentValueForm
            key={`${selectedComponent.id}:${componentValueLabel(selectedComponent)}`}
            component={selectedComponent}
            onApply={(patch) => dispatch({ type: 'component-value-set', componentId: selectedComponent.id, patch })}
          />
          <div className="canvas-selection-actions">
            <button type="button" className="button-secondary" onClick={rotateSelection}>
              Повернуть
            </button>
            <button type="button" className="button-secondary button-danger" onClick={removeSelection}>
              Удалить
            </button>
          </div>
        </div>
      ) : selection !== null && selection.kind === 'wire' ? (
        <div className="canvas-selection">
          <p className="canvas-selection-name">Провод</p>
          <div className="canvas-selection-actions">
            <button type="button" className="button-secondary button-danger" onClick={removeSelection}>
              Удалить
            </button>
          </div>
        </div>
      ) : (
        <p className="canvas-hint">
          Кликните по Компоненту, чтобы повернуть его, изменить номинал или удалить; по выводу —
          чтобы протянуть Провод.
        </p>
      )}
    </div>
  );
}

/** Черновик Провода: от зажатого вывода до курсора. */
function DraftWire({ draft, from }: { draft: WireDraftState; from: DirectedPoint }) {
  const route = routeWire(from, { x: draft.cursor.x, y: draft.cursor.y, dx: 0, dy: 0 });
  const points = route.map((point) => `${point.x},${point.y}`).join(' ');
  return <polyline className="wire-draft" points={points} />;
}

/** Форма номинала: батарея — напряжение, резистор/лампа/мотор — сопротивление, коммутаторы — замкнут. */
function ComponentValueForm({
  component,
  onApply,
}: {
  component: PlacedComponent;
  onApply: (patch: ComponentValuePatch) => void;
}) {
  const isSwitch = component.kind === 'switch' || component.kind === 'pushbutton';
  const unit: QuantityUnit = component.kind === 'battery' ? 'В' : 'Ом';
  const value = component.kind === 'battery' ? component.voltage : component.resistance;
  const [raw, setRaw] = useState(String(value ?? '').replace('.', ','));
  const [error, setError] = useState<string | null>(null);

  if (isSwitch) {
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

  function submit() {
    const parsed = parseQuantity(raw, unit);
    if (parsed.status === 'error') {
      setError(parsed.message);
      return;
    }
    setError(null);
    onApply(component.kind === 'battery' ? { voltage: parsed.value } : { resistance: parsed.value });
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
