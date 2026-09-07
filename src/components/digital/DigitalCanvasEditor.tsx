import { type ReactNode } from 'react';
import type { Bit } from '../../domain/booleanEngine';
import {
  clockFrequencyBounds,
  defaultClockFrequency,
  digitalPinCountOf,
  isDigitalKind,
  type DigitalCanvasAction,
  type DigitalCanvasHistory,
  type DigitalComponent,
  type DigitalKind,
  type DigitalValuePatch,
} from '../../domain/digitalCanvas';
import { suggestPlacementPosition, pinKey, type PinRef } from '../../domain/canvas';
import { digitalPinPointOf } from '../../domain/digitalGeometry';
import { CANVAS_SIZE, routeWire, type DirectedPoint, type Point } from '../../domain/canvasGeometry';
import type { SymbolStandard } from '../../domain/symbols';
import {
  DigitalPaletteSymbol,
  DigitalSymbolBody,
  digitalComponentTitles,
  digitalValueLabel,
} from './DigitalSymbols';
import { useCanvasGestures } from '../canvas/canvasGestures';

/** Радиус зоны захвата символа Компонента мышью. */
const COMPONENT_HIT_RADIUS = 34;
/** Подпись состояния — над символом, вне повёрнутой группы. */
const LABEL_OFFSET_Y = -38;

/**
 * Редактор цифрового Холста: тонкий слой над домен-редьюсером. Кинематика —
 * общая с аналоговым Холстом (`useCanvasGestures`); поверх неё — живые
 * уровни булевого движка: каждый вывод показывает свой бит, Проводы
 * окрашены уровнем сети, клик по Кнопке (без сдвига) переключает её сигнал.
 */

interface DigitalCanvasEditorProps {
  readonly palette: readonly DigitalKind[];
  readonly history: DigitalCanvasHistory;
  readonly onAction: (action: DigitalCanvasAction) => void;
  /** Стандарт условных обозначений: символы перерисовываются мгновенно. */
  readonly symbolStandard: SymbolStandard;
  /** Живые уровни всех выводов от булевого движка, словарь по pinKey. */
  readonly levels: ReadonlyMap<string, Bit>;
  /** Компонент с ошибкой из Диагноза: подсвечивается до следующей проверки. */
  readonly faultComponentId?: string | null;
  /** Кнопки экрана в панели редактора — «Демо-схема», стандарт обозначений. */
  readonly actions?: ReactNode;
}

export function DigitalCanvasEditor({
  palette,
  history,
  onAction,
  symbolStandard,
  levels,
  faultComponentId = null,
  actions,
}: DigitalCanvasEditorProps) {
  const canvas = history.present;

  const {
    selection,
    setSelection,
    drag,
    wireDraft,
    setWireDraft,
    svgRef,
    rootRef,
    beginDrag,
    trackPointer,
    endDrag,
    handlePinClick,
    clearCanvas,
    removeSelection,
    rotateSelection,
    handleKeyDown,
    handleDrop,
  } = useCanvasGestures({
    componentPosition: (componentId) => {
      const component = componentById.get(componentId);
      return component !== undefined ? { x: component.x, y: component.y } : undefined;
    },
    pinPoint: (ref) => {
      const component = componentById.get(ref.componentId);
      return component !== undefined ? digitalPinPointOf(component, ref.pin) : undefined;
    },
    moveComponent: (componentId, x, y) => onAction({ type: 'component-moved', componentId, x, y }),
    drawWire: (from, to) => onAction({ type: 'wire-drawn', from, to }),
    removeComponent: (componentId) => onAction({ type: 'component-removed', componentId }),
    removeWire: (wireId) => onAction({ type: 'wire-removed', wireId }),
    rotateComponent: (componentId) => onAction({ type: 'component-rotated', componentId }),
    placeKind: (kind, point) => {
      if (isDigitalKind(kind)) onAction({ type: 'component-placed', kind, x: point.x, y: point.y });
    },
    onUnmovedClick: (componentId) => {
      const component = componentById.get(componentId);
      if (component?.kind !== 'button') return;
      onAction({
        type: 'component-value-set',
        componentId,
        patch: { high: !(component.high ?? false) },
      });
    },
  });

  const components = canvas.components;
  const componentById = new Map(components.map((c) => [c.id, c]));
  const selectedComponent =
    selection !== null && selection.kind === 'component'
      ? (componentById.get(selection.id) ?? null)
      : null;

  /** Компонент с текущей позицией перетаскивания — для живой перерисовки Проводов. */
  const withDrag = (component: DigitalComponent): DigitalComponent =>
    drag !== null && drag.componentId === component.id
      ? { ...component, x: drag.position.x, y: drag.position.y }
      : component;

  function placeFromPalette(kind: DigitalKind) {
    const spot = suggestPlacementPosition(canvas);
    onAction({ type: 'component-placed', kind, x: spot.x, y: spot.y });
    setWireDraft(null);
  }

  const wireFrom = (ref: PinRef): DirectedPoint => {
    const component = componentById.get(ref.componentId);
    if (component === undefined) return { x: 0, y: 0, dx: 0, dy: 0 };
    return digitalPinPointOf(withDrag(component), ref.pin);
  };

  const componentName = (id: string): string => {
    const component = componentById.get(id);
    if (component === undefined) return '';
    const index = components.findIndex((c) => c.id === id) + 1;
    return `${digitalComponentTitles[component.kind]} ${index}`.trim();
  };

  /** Уровень вывода: из движка, а без данных — 0 (строгий сигнал не бывает неизвестным). */
  const bitOf = (ref: PinRef): Bit => levels.get(pinKey(ref.componentId, ref.pin)) ?? 0;

  return (
    <div
      ref={rootRef}
      className="canvas-editor"
      tabIndex={0}
      aria-label="Цифровой Холст: соберите логическую схему"
      onKeyDown={handleKeyDown}
      // preventScroll: иначе фокус прыгает скроллом к верху редактора, кнопка
      // Палитры уходит из-под курсора и клик не доходит (короткое окно).
      onMouseDown={() => rootRef.current?.focus({ preventScroll: true })}
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
            title={`Поставить: ${digitalComponentTitles[kind]}`}
          >
            <DigitalPaletteSymbol kind={kind} standard={symbolStandard} />
            <span className="palette-item-name">{digitalComponentTitles[kind]}</span>
          </button>
        ))}
      </div>

      <div className="canvas-toolbar">
        <button
          type="button"
          className="button-secondary"
          disabled={history.past.length === 0}
          onClick={() => onAction({ type: 'undo' })}
        >
          Отменить
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={history.future.length === 0}
          onClick={() => onAction({ type: 'redo' })}
        >
          Вернуть
        </button>
        <button
          type="button"
          className="button-secondary button-danger"
          disabled={canvas.components.length === 0 && canvas.wires.length === 0}
          onClick={() => {
            onAction({ type: 'canvas-reset' });
            clearCanvas();
          }}
        >
          Сбросить схему
        </button>
        {actions}
        <span className="canvas-toolbar-hint">
          {wireDraft !== null
            ? 'Проведите Провод до второго вывода; Esc — отменить'
            : 'Клик по выводу — тянуть Провод; клик по Кнопке — переключить; перетаскивание — перемещение'}
        </span>
      </div>

      <svg
        ref={svgRef}
        className="canvas-svg"
        viewBox={`0 0 ${CANVAS_SIZE.width} ${CANVAS_SIZE.height}`}
        aria-label="Рабочее поле цифровой схемы"
        onMouseMove={trackPointer}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <defs>
          <pattern id="digital-canvas-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0 H0 V20" className="canvas-grid-line" />
          </pattern>
        </defs>
        <rect
          className="canvas-hit"
          width={CANVAS_SIZE.width}
          height={CANVAS_SIZE.height}
          fill="url(#digital-canvas-grid)"
          onMouseDown={clearCanvas}
        />

        {canvas.wires.map((wire) => {
          const route = routeWire(wireFrom(wire.from), wireFrom(wire.to));
          const points = route.map((point) => `${point.x},${point.y}`).join(' ');
          const selected = selection?.kind === 'wire' && selection.id === wire.id;
          const high = bitOf(wire.from) === 1;
          return (
            <g
              key={wire.id}
              className={`wire ${high ? 'wire-level-high' : 'wire-level-low'} ${
                selected ? 'wire-selected' : ''
              }`}
              role="button"
              aria-label={`Провод ${wire.id} — уровень ${bitOf(wire.from)}`}
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
          const fault = component.id === faultComponentId;
          return (
            <g
              key={component.id}
              className={`canvas-component ${selected ? 'canvas-component-selected' : ''} ${
                drag !== null && drag.componentId === component.id ? 'canvas-component-dragged' : ''
              } ${component.kind === 'button' ? 'digital-component-toggle' : ''} ${
                fault ? 'canvas-component-fault' : ''
              }`}
              role="button"
              aria-label={componentName(component.id)}
              aria-pressed={component.kind === 'button' ? (component.high ?? false) : undefined}
              transform={`translate(${shown.x} ${shown.y}) rotate(${component.rotation})`}
              onMouseDown={(event) => beginDrag(component, event)}
            >
              <circle className="canvas-component-hit" r={COMPONENT_HIT_RADIUS} />
              {fault && <circle className="fault-ring" r={COMPONENT_HIT_RADIUS + 12} aria-hidden="true" />}
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <DigitalSymbolBody
                  component={component}
                  level={levels.get(pinKey(component.id, displayPinOf(component.kind)))}
                  standard={symbolStandard}
                />
              </g>
            </g>
          );
        })}

        {components.map((component) => {
          const label = digitalValueLabel(component);
          if (label === '') return null;
          return (
            <text
              key={`${component.id}:label`}
              className="canvas-label"
              x={withDrag(component).x}
              y={withDrag(component).y + LABEL_OFFSET_Y}
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}

        {components.map((component) =>
          Array.from({ length: digitalPinCountOf(component.kind) }, (_, pin) => {
            const ref: PinRef = { componentId: component.id, pin };
            const point = digitalPinPointOf(withDrag(component), pin);
            const bit = bitOf(ref);
            const isDraftSource =
              wireDraft !== null &&
              wireDraft.from.componentId === component.id &&
              wireDraft.from.pin === pin;
            return (
              <g key={`${component.id}:pin${pin}`}>
                <circle
                  className={`digital-pin ${bit === 1 ? 'digital-pin-high' : ''} ${
                    isDraftSource ? 'digital-pin-source' : ''
                  }`}
                  role="button"
                  aria-label={`Вывод ${pin + 1}: ${componentName(component.id)} — уровень ${bit}`}
                  cx={point.x}
                  cy={point.y}
                  r={isDraftSource ? 10 : 9}
                  onMouseDown={(event) => handlePinClick(ref, event)}
                />
                <text
                  className={`digital-pin-digit ${bit === 1 ? 'digital-pin-digit-high' : ''}`}
                  x={point.x}
                  y={point.y + 3.5}
                  textAnchor="middle"
                  aria-hidden="true"
                >
                  {bit}
                </text>
              </g>
            );
          }),
        )}
      </svg>

      {selectedComponent !== null ? (
        <DigitalSelectionPanel
          component={selectedComponent}
          name={componentName(selectedComponent.id)}
          onRotate={rotateSelection}
          onRemove={removeSelection}
          onValueSet={(patch) =>
            onAction({ type: 'component-value-set', componentId: selectedComponent.id, patch })
          }
        />
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
          Кликните по Компоненту, чтобы повернуть его или удалить, по выводу — чтобы протянуть
          Провод, по Кнопке — чтобы переключить её сигнал.
        </p>
      )}
    </div>
  );
}

/**
 * Уровень этого вывода рисуется на теле символа: у элементов — выход,
 * у одновыводных — их единственный; Индикатор светит от своего входа.
 */
function displayPinOf(kind: DigitalKind): number {
  return digitalPinCountOf(kind) - 1;
}

/** Панель правки выбранного Компонента: частота Генератора, поворот и удаление. */
function DigitalSelectionPanel({
  component,
  name,
  onRotate,
  onRemove,
  onValueSet,
}: {
  readonly component: DigitalComponent;
  readonly name: string;
  readonly onRotate: () => void;
  readonly onRemove: () => void;
  readonly onValueSet: (patch: DigitalValuePatch) => void;
}) {
  return (
    <div className="canvas-selection">
      <p className="canvas-selection-name">{name}</p>
      {component.kind === 'clock' && (
        <label className="canvas-wiper-field">
          Частота
          <input
            type="range"
            min={clockFrequencyBounds.min}
            max={clockFrequencyBounds.max}
            step={0.5}
            value={component.frequency ?? defaultClockFrequency}
            aria-label="Частота, Гц"
            onChange={(event) => onValueSet({ frequency: Number(event.target.value) })}
          />
          <span className="canvas-wiper-percent">{digitalValueLabel(component)}</span>
        </label>
      )}
      {component.kind === 'button' && (
        <label className="canvas-value-toggle">
          <input
            type="checkbox"
            checked={component.high ?? false}
            onChange={(event) => onValueSet({ high: event.target.checked })}
          />
          нажата
        </label>
      )}
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

/** Черновик Провода: от зажатого вывода до курсора. */
function DraftWire({ draft, from }: { draft: { readonly from: PinRef; readonly cursor: Point }; from: DirectedPoint }) {
  const route = routeWire(from, { x: draft.cursor.x, y: draft.cursor.y, dx: 0, dy: 0 });
  const points = route.map((point) => `${point.x},${point.y}`).join(' ');
  return <polyline className="wire-draft" points={points} />;
}
