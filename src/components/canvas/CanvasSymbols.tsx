import type { ReactNode } from 'react';
import type { ComponentKind, PlacedComponent } from '../../domain/canvas';
import { defaultValuesOf, valueFieldOf } from '../../domain/canvas';
import { formatQuantity } from '../../domain/quantity';

/**
 * Условные обозначения Компонентов на Холсте — в ГОСТ (тикет 04).
 * Каждый символ рисуется в локальных координатах: центр (0,0),
 * выводы на (−40, 0) и (+40, 0); слой редактора оборачивает тело
 * в <g transform="translate(x y) rotate(deg)">. Набор ANSI приходит
 * с переключателем стандартов (тикет 07).
 */

/** Названия Компонентов Палитры (копия UI; идентификаторы — данные домена). */
export const componentTitles: Record<ComponentKind, string> = {
  battery: 'Батарея',
  resistor: 'Резистор',
  lamp: 'Лампочка',
  switch: 'Выключатель',
  pushbutton: 'Ключ',
  motor: 'Моторчик',
};

/** Подпись номинала рядом с Компонентом на Холсте. */
export function componentValueLabel(component: PlacedComponent): string {
  switch (valueFieldOf(component.kind)) {
    case 'voltage':
      return formatQuantity(component.voltage ?? 0, 'В');
    case 'resistance':
      return formatQuantity(component.resistance ?? 0, 'Ом');
    case 'closed':
      return component.closed ? 'замкнут' : 'разомкнут';
  }
}

/** Тело символа Компонента в локальных координатах. */
export function CanvasSymbolBody({ component }: { component: PlacedComponent }): ReactNode {
  switch (component.kind) {
    case 'battery':
      return (
        <>
          <path d="M-40 0 H-12 M12 0 H40" />
          {/* батарея из двух гальванических элементов: длинная пластина — «плюс», вывод 0 */}
          <path d="M-12 -13 V13 M-4 -7 V7 M4 -13 V13 M12 -7 V7" />
          <text x="-36" y="-10" className="symbol-sign" stroke="none">
            +
          </text>
        </>
      );
    case 'resistor':
      return (
        <>
          <path d="M-40 0 H-26 M26 0 H40" />
          <rect x="-26" y="-8" width="52" height="16" />
        </>
      );
    case 'lamp':
      return (
        <>
          <path d="M-40 0 H-16 M16 0 H40" />
          <circle cx="0" cy="0" r="16" />
          {/* нить накаливания — косой крест внутри окружности */}
          <path d="M-11.5 -11.5 L11.5 11.5 M-11.5 11.5 L11.5 -11.5" />
        </>
      );
    case 'switch':
      return <ContactSet closed={component.closed ?? false} />;
    case 'pushbutton':
      return (
        <>
          <ContactSet closed={component.closed ?? false} />
          {/* привод кнопки: шток с шляпкой над серединой подвижного контакта */}
          {component.closed ? (
            <path d="M0 -1 V-22 M-7 -22 H7" />
          ) : (
            <path d="M-1.5 -6 V-22 M-8.5 -22 H5.5" />
          )}
        </>
      );
    case 'motor':
      return (
        <>
          <path d="M-40 0 H-16 M16 0 H40" />
          <circle cx="0" cy="0" r="16" />
          <text x="0" y="6.5" textAnchor="middle" className="canvas-motor-sign" stroke="none">
            М
          </text>
        </>
      );
  }
}

/** Неподвижные контакты и подвижное плечо выключателя/ключа (ГОСТ 2.755). */
function ContactSet({ closed }: { closed: boolean }) {
  return (
    <>
      <path d="M-40 0 H-16 M16 0 H40" />
      <circle cx="-16" cy="0" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="0" r="2.6" fill="currentColor" stroke="none" />
      {closed ? <path d="M-16 0 H16" /> : <path d="M-16 0 L13 -12" />}
    </>
  );
}

/** Миниатюра Компонента для Палитры: символ с номиналами по умолчанию. */
export function PaletteSymbol({ kind }: { kind: ComponentKind }) {
  const preview: PlacedComponent = {
    id: '',
    kind,
    x: 0,
    y: 0,
    rotation: 0,
    ...defaultValuesOf(kind),
  };
  return (
    <svg className="palette-symbol" viewBox="-46 -30 92 60" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <CanvasSymbolBody component={preview} />
      </g>
    </svg>
  );
}
