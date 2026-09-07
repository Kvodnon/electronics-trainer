import { type ReactNode } from 'react';
import {
  isComponentKind,
  pinCountOf,
  suggestPlacementPosition,
  type CanvasAction,
  type CanvasHistory,
  type ComponentKind,
  type PlacedComponent,
  type PinRef,
} from '../../domain/canvas';
import {
  CANVAS_SIZE,
  pinPointOf,
  routeWire,
  type DirectedPoint,
  type Point,
} from '../../domain/canvasGeometry';
import { CanvasSymbolBody, PaletteSymbol, componentTitles, componentValueLabel } from './CanvasSymbols';
import { CanvasSelectionPanel } from './CanvasSelectionPanel';
import { useCanvasGestures } from './canvasGestures';
import { formatQuantity } from '../../domain/quantity';
import { probePoints, type MultimeterMode, type MultimeterProbes } from '../../domain/multimeter';
import type { CircuitDiagnosisSpot } from '../../domain/circuitDiagnoses';
import type { ComponentReading } from '../../domain/simulator';
import type { SymbolStandard } from '../../domain/symbols';

/** Радиус зоны захвата символа Компонента мышью. */
const COMPONENT_HIT_RADIUS = 34;
/** Подпись номинала — над символом, вне повёрнутой группы. */
const LABEL_OFFSET_Y = -38;

/**
 * Редактор Холста: тонкий слой над домен-редьюсером. Состояние Холста живёт
 * выше (экран Схема-задания) — редактор управляемый: жесты мышью (общая
 * кинематика `useCanvasGestures`) превращаются в действия `canvasReducer`,
 * отрисовка читает переданную историю. Вся логика редактора (постановка,
 * перемещение, поворот, удаление, Провода, номиналы, undo/redo, сброс) — в
 * редьюсере; здесь только отрисовка и щупы Мультиметра. Перетаскивание
 * Компонента рисуется поверх состояния и фиксируется в редьюсер одним
 * действием на отпускании кнопки.
 */

/** Оверлей расчёта: показания на Компонентах и токи Проводов после «Проверить». */
export interface CanvasOverlay {
  readonly componentReadings: ReadonlyMap<string, ComponentReading>;
  readonly wireCurrents: ReadonlyMap<string, number | null>;
}

/**
 * Мультиметр на Холсте: режим измерений (CONTEXT.md). Состояние щупов живёт
 * выше — в экране Задания; редактору достаются жесты: клик по выводу
 * прикладывает щуп (напряжение), клик по Компоненту кладёт щупы на его ветвь
 * (ток), Esc и клик по полю снимают щупы.
 */
export interface MultimeterGestures {
  readonly mode: MultimeterMode;
  readonly probes: MultimeterProbes;
  readonly onPinProbe: (ref: PinRef) => void;
  readonly onBranchProbe: (componentId: string) => void;
  readonly onClearProbes: () => void;
}

interface CanvasEditorProps {
  readonly palette: readonly ComponentKind[];
  readonly history: CanvasHistory;
  readonly onAction: (action: CanvasAction) => void;
  /** Стандарт условных обозначений: символы Палитры и Холста перерисовываются мгновенно. */
  readonly symbolStandard: SymbolStandard;
  /** Кнопки Задания в панели редактора — например, «Проверить». */
  readonly actions?: ReactNode;
  /** Живые показания Симулятора: лампочка светится, моторчик вращается. */
  readonly liveReadings?: ReadonlyMap<string, ComponentReading>;
  /** Уровень заряда конденсаторов (0..1) во время проигрывания осциллографа. */
  readonly capacitorFill?: ReadonlyMap<string, number>;
  /** Числовой оверлей токов и напряжений; нет — слой не рисуется. */
  readonly overlay?: CanvasOverlay | null;
  /** Подсветка места ошибки из Диагноза. */
  readonly faultSpot?: CircuitDiagnosisSpot | null;
  /** Мультиметр: режим измерений включён; нет — обычное редактирование. */
  readonly multimeter?: MultimeterGestures | null;
}

export function CanvasEditor({ palette, history, onAction, symbolStandard, actions, liveReadings, capacitorFill, overlay, faultSpot, multimeter = null }: CanvasEditorProps) {
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
      return component !== undefined ? pinPointOf(component, ref.pin) : undefined;
    },
    moveComponent: (componentId, x, y) => onAction({ type: 'component-moved', componentId, x, y }),
    drawWire: (from, to) => onAction({ type: 'wire-drawn', from, to }),
    removeComponent: (componentId) => onAction({ type: 'component-removed', componentId }),
    removeWire: (wireId) => onAction({ type: 'wire-removed', wireId }),
    rotateComponent: (componentId) => onAction({ type: 'component-rotated', componentId }),
    placeKind: (kind, point) => {
      if (isComponentKind(kind)) onAction({ type: 'component-placed', kind, x: point.x, y: point.y });
    },
    onUnmovedClick: (componentId) => {
      // клик без сдвига в режиме тока — щупы на ветвь Компонента
      if (multimeter !== null && multimeter.mode === 'current') multimeter.onBranchProbe(componentId);
    },
    onPinIntercept: (ref) => {
      if (multimeter === null) return false;
      // режим измерений: вывод — точка измерения, а не начало Провода
      if (multimeter.mode === 'voltage') multimeter.onPinProbe(ref);
      else multimeter.onBranchProbe(ref.componentId);
      return true;
    },
    onEscape: () => multimeter?.onClearProbes(),
  });

  const components = canvas.components;
  const componentById = new Map(components.map((c) => [c.id, c]));
  const selectedComponent =
    selection !== null && selection.kind === 'component'
      ? (componentById.get(selection.id) ?? null)
      : null;

  /** Компонент с текущей позицией перетаскивания — для живой перерисовки Проводов. */
  const withDrag = (component: PlacedComponent): PlacedComponent =>
    drag !== null && drag.componentId === component.id
      ? { ...component, x: drag.position.x, y: drag.position.y }
      : component;

  function placeFromPalette(kind: ComponentKind) {
    const spot = suggestPlacementPosition(canvas);
    onAction({ type: 'component-placed', kind, x: spot.x, y: spot.y });
    setWireDraft(null);
  }

  function clearCanvasInteraction() {
    clearCanvas();
    multimeter?.onClearProbes();
  }

  const wireFrom = (ref: PinRef): DirectedPoint => {
    const component = componentById.get(ref.componentId);
    if (component === undefined) return { x: 0, y: 0, dx: 0, dy: 0 };
    return pinPointOf(withDrag(component), ref.pin);
  };

  const componentName = (id: string): string => {
    const component = componentById.get(id);
    if (component === undefined) return '';
    const index = components.findIndex((c) => c.id === id) + 1;
    return `${componentTitles[component.kind]} ${index}`.trim();
  };

  /** Щупы Мультиметра для отрисовки: точки измерения из домена, точки — по
   * текущему положению Компонентов (в том числе во время перетаскивания). */
  const probeMarkers = multimeter === null ? [] : probePoints(multimeter.mode, multimeter.probes);

  return (
    <div
      ref={rootRef}
      className="canvas-editor"
      tabIndex={0}
      aria-label="Холст: соберите схему"
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
            title={`Поставить: ${componentTitles[kind]}`}
          >
            <PaletteSymbol kind={kind} standard={symbolStandard} />
            <span className="palette-item-name">{componentTitles[kind]}</span>
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
            clearCanvasInteraction();
          }}
        >
          Сбросить схему
        </button>
        {actions}
        <span className="canvas-toolbar-hint">
          {multimeter !== null
            ? multimeter.mode === 'voltage'
              ? 'Клик по выводу — приложить щуп (красный, затем чёрный); Esc — снять щупы'
              : 'Клик по Компоненту или его выводу — щупы на ветвь; Esc — снять щупы'
            : wireDraft !== null
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
          const fault = faultSpot?.kind === 'wire' && faultSpot.id === wire.id;
          return (
            <g
              key={wire.id}
              className={`wire ${selected ? 'wire-selected' : ''} ${fault ? 'wire-fault' : ''}`}
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

        {overlay &&
          canvas.wires.map((wire) => {
            const current = overlay.wireCurrents.get(wire.id);
            if (current === undefined || current === null) return null;
            const route = routeWire(wireFrom(wire.from), wireFrom(wire.to));
            const middle = routeMidpoint(route);
            return (
              <text
                key={`${wire.id}:reading`}
                className="canvas-wire-reading"
                x={middle.x}
                y={middle.y - 6}
                textAnchor="middle"
                aria-hidden="true"
              >
                {formatQuantity(Math.abs(current), 'А')}
              </text>
            );
          })}

        {wireDraft !== null && components.some((c) => c.id === wireDraft.from.componentId) && (
          <DraftWire draft={wireDraft} from={wireFrom(wireDraft.from)} />
        )}

        {components.map((component) => {
          const shown = withDrag(component);
          const selected = selection?.kind === 'component' && selection.id === component.id;
          const fault = faultSpot?.kind === 'component' && faultSpot.id === component.id;
          return (
            <g
              key={component.id}
              className={`canvas-component ${selected ? 'canvas-component-selected' : ''} ${
                drag !== null && drag.componentId === component.id ? 'canvas-component-dragged' : ''
              } ${fault ? 'canvas-component-fault' : ''}`}
              role="button"
              aria-label={componentName(component.id)}
              transform={`translate(${shown.x} ${shown.y}) rotate(${component.rotation})`}
              onMouseDown={(event) => beginDrag(component, event)}
            >
              <circle className="canvas-component-hit" r={COMPONENT_HIT_RADIUS} />
              <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <CanvasSymbolBody
                  component={component}
                  reading={liveReadings?.get(component.id)}
                  chargeLevel={capacitorFill?.get(component.id)}
                  standard={symbolStandard}
                />
              </g>
              {fault && <circle className="fault-ring" r={46} aria-hidden="true" />}
            </g>
          );
        })}

        {components.map((component) => (
          <text
            key={`${component.id}:label`}
            className="canvas-label"
            x={withDrag(component).x}
            y={withDrag(component).y + LABEL_OFFSET_Y}
            textAnchor="middle"
          >
            {componentValueLabel(component)}
          </text>
        ))}

        {overlay &&
          components.map((component) => {
            const reading = overlay.componentReadings.get(component.id);
            if (reading === undefined) return null;
            const shown = withDrag(component);
            return (
              <text
                key={`${component.id}:reading`}
                className="canvas-component-reading"
                x={shown.x}
                y={shown.y + 42}
                textAnchor="middle"
                aria-hidden="true"
              >
                <tspan className="canvas-reading-current">{formatQuantity(Math.abs(reading.current), 'А')}</tspan>
                <tspan className="canvas-reading-voltage" dx={8}>
                  {formatQuantity(Math.abs(reading.voltage), 'В')}
                </tspan>
              </text>
            );
          })}

        {probeMarkers.map(({ ref, color }) => {
          const component = componentById.get(ref.componentId);
          if (component === undefined) return null;
          const point = pinPointOf(withDrag(component), ref.pin);
          return (
            <circle
              key={`multimeter-probe-${color}`}
              className={`multimeter-probe multimeter-probe-${color}`}
              cx={point.x}
              cy={point.y}
              r={10}
              aria-hidden="true"
            />
          );
        })}

        {components.map((component) =>
          Array.from({ length: pinCountOf(component.kind) }, (_, pin) => {
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
        <CanvasSelectionPanel
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
          Кликните по Компоненту, чтобы повернуть его, изменить номинал или удалить; по выводу —
          чтобы протянуть Провод.
        </p>
      )}
    </div>
  );
}

/** Черновик Провода: от зажатого вывода до курсора. */
function DraftWire({ draft, from }: { draft: { readonly from: PinRef; readonly cursor: Point }; from: DirectedPoint }) {
  const route = routeWire(from, { x: draft.cursor.x, y: draft.cursor.y, dx: 0, dy: 0 });
  const points = route.map((point) => `${point.x},${point.y}`).join(' ');
  return <polyline className="wire-draft" points={points} />;
}

/** Точка на маршруте для подписи тока: середина среднего сегмента. */
function routeMidpoint(route: readonly Point[]): Point {
  const middle = Math.floor(route.length / 2);
  if (route.length % 2 === 1) return route[middle];
  const a = route[middle - 1];
  const b = route[middle];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
