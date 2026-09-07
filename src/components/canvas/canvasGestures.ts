import { useRef, useState } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { PinRef } from '../../domain/canvas';
import { CANVAS_SIZE, clampPosition, snapToGrid, type Point } from '../../domain/canvasGeometry';

/**
 * Общая кинематика редакторов Холста (аналогового и цифрового): выбор,
 * перетаскивание с привязкой к сетке, черновик Провода от вывода к выводу,
 * клавиатура (Esc, Delete, R/«к»), бросок из Палитры. Жесты остаются
 * чистой механикой: во действия своего домена их превращают колбеки,
 * переданные экраном. Особенности Холста (щупы Мультиметра, переключение
 * Кнопки) входят через перехватчики, а не через ветвления по виду Холста.
 */

export type CanvasSelection = { kind: 'component' | 'wire'; id: string } | null;

interface CanvasDragState {
  readonly componentId: string;
  /** Указатель − центр Компонента на старте, чтобы курсор не «прыгал». */
  readonly grabOffset: Point;
  readonly position: Point;
  readonly moved: boolean;
}

interface CanvasWireDraftState {
  readonly from: PinRef;
  readonly cursor: Point;
}

export interface CanvasGestureCallbacks {
  /** Позиция Компонента: захват при перетаскивании и проверка «клик без сдвига». */
  readonly componentPosition: (componentId: string) => Point | undefined;
  /** Точка вывода для старта черновика Провода; неизвестный вывод — undefined. */
  readonly pinPoint: (ref: PinRef) => Point | undefined;
  readonly moveComponent: (componentId: string, x: number, y: number) => void;
  readonly drawWire: (from: PinRef, to: PinRef) => void;
  readonly removeComponent: (componentId: string) => void;
  readonly removeWire: (wireId: string) => void;
  readonly rotateComponent: (componentId: string) => void;
  /** Бросок из Палитры: вид приходит строкой из dataTransfer. */
  readonly placeKind: (kind: string, point: Point) => void;
  /** Клик по Компоненту без сдвига; у цифрового Холста так переключается Кнопка. */
  readonly onUnmovedClick?: (componentId: string) => void;
  /**
   * Клик по выводу до черновика Провода; Мультиметр аналогового Холста
   * кладёт щуп и поглощает жест (true). Не задан — вывод начинает Провод.
   */
  readonly onPinIntercept?: (ref: PinRef) => boolean;
  /** Esc: у аналогового Холста снимает щупы вместе с выбором. */
  readonly onEscape?: () => void;
}

export function useCanvasGestures(callbacks: CanvasGestureCallbacks) {
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [drag, setDrag] = useState<CanvasDragState | null>(null);
  const [wireDraft, setWireDraft] = useState<CanvasWireDraftState | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  function beginDrag(component: { readonly id: string } & Point, event: ReactMouseEvent) {
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
    const original = callbacks.componentPosition(drag.componentId);
    const movedPosition =
      original !== undefined && (original.x !== drag.position.x || original.y !== drag.position.y);
    if (movedPosition) {
      callbacks.moveComponent(drag.componentId, drag.position.x, drag.position.y);
    } else {
      callbacks.onUnmovedClick?.(drag.componentId);
    }
    setDrag(null);
  }

  function handlePinClick(ref: PinRef, event: ReactMouseEvent) {
    event.stopPropagation();
    if (callbacks.onPinIntercept?.(ref)) {
      setWireDraft(null);
      return;
    }
    if (wireDraft === null) {
      const origin = callbacks.pinPoint(ref);
      if (origin === undefined) return;
      setSelection(null);
      setWireDraft({ from: ref, cursor: { x: origin.x, y: origin.y } });
      return;
    }
    callbacks.drawWire(wireDraft.from, ref);
    setWireDraft(null);
  }

  function clearCanvas() {
    setSelection(null);
    setWireDraft(null);
  }

  function removeSelection() {
    if (selection === null) return;
    if (selection.kind === 'component') callbacks.removeComponent(selection.id);
    else callbacks.removeWire(selection.id);
    setSelection(null);
  }

  function rotateSelection() {
    if (selection?.kind !== 'component') return;
    callbacks.rotateComponent(selection.id);
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    // набор в поле номинала не управляет редактором
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'Escape') {
      setWireDraft(null);
      setSelection(null);
      callbacks.onEscape?.();
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
    const kind = event.dataTransfer.getData('text/component-kind');
    if (!kind) return;
    event.preventDefault();
    callbacks.placeKind(kind, pointFromEvent(event));
  }

  return {
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
  };
}
