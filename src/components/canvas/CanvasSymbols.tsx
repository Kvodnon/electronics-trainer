import type { ReactNode } from 'react';
import type { ComponentKind, PlacedComponent } from '../../domain/canvas';
import type { SymbolStandard } from '../../domain/symbols';
import { defaultValuesOf, valueFieldOf } from '../../domain/canvas';
import { formatQuantity } from '../../domain/quantity';
import { isMotorSpinning, lampBrightness, type ComponentReading } from '../../domain/simulator';

/**
 * Условные обозначения Компонентов на Холсте — два набора: ГОСТ (тикет 04)
 * и ANSI (тикет 07); переключение — в Задании, само Холст-состояние оно
 * не трогает. Каждый символ рисуется в локальных координатах: центр (0,0),
 * выводы на (−40, 0) и (+40, 0); слой редактора оборачивает тело
 * в <g transform="translate(x y) rotate(deg)">.
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

/** Подписи стандартов для переключателя в Задании. */
export const standardTitles: Record<SymbolStandard, string> = {
  gost: 'ГОСТ',
  ansi: 'ANSI',
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

/**
 * Тело символа Компонента в локальных координатах. `reading` — живое показание
 * Симулятора: лампочка светится с яркостью от мощности, моторчик вращается,
 * когда ток выше порога (в Палитре показание нет — символы статичны).
 */
export function CanvasSymbolBody({
  component,
  reading,
  standard,
}: {
  component: PlacedComponent;
  reading?: ComponentReading;
  standard: SymbolStandard;
}): ReactNode {
  switch (standard) {
    case 'gost':
      return <GostBody component={component} reading={reading} />;
    case 'ansi':
      return <AnsiBody component={component} reading={reading} />;
  }
}

/** Выводы по обе стороны: от краёв символа до точек подключения (±40, 0). */
function Leads({ from }: { from: number }) {
  return <path d={`M-40 0 H${-from} M${from} 0 H40`} />;
}

/** Неподвижные контакты выключателя/ключа — точки на (±16, 0). */
function ContactDots() {
  return (
    <>
      <circle cx="-16" cy="0" r="2.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="0" r="2.6" fill="currentColor" stroke="none" />
    </>
  );
}

/** Ротор моторчика с подписью; крутится по живому показанию выше порога. */
function MotorRotor({ reading, sign }: { reading?: ComponentReading; sign: string }) {
  return (
    <g className={reading !== undefined && isMotorSpinning(reading) ? 'motor-rotor motor-rotor-spinning' : 'motor-rotor'}>
      <circle cx="0" cy="0" r="16" />
      <text x="0" y="6.5" textAnchor="middle" className="canvas-motor-sign" stroke="none">
        {sign}
      </text>
    </g>
  );
}

/** Тело символа по ГОСТ 2.7xx. */
function GostBody({ component, reading }: { component: PlacedComponent; reading?: ComponentReading }): ReactNode {
  switch (component.kind) {
    case 'battery':
      return (
        <>
          <Leads from={12} />
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
          <Leads from={26} />
          <rect x="-26" y="-8" width="52" height="16" />
        </>
      );
    case 'lamp':
      return (
        <>
          <LampGlow reading={reading} />
          <Leads from={16} />
          <circle cx="0" cy="0" r="16" />
          {/* нить накаливания — косой крест внутри окружности */}
          <path d="M-11.5 -11.5 L11.5 11.5 M-11.5 11.5 L11.5 -11.5" />
        </>
      );
    case 'switch':
      return <GostContacts closed={component.closed ?? false} />;
    case 'pushbutton':
      return (
        <>
          <GostContacts closed={component.closed ?? false} />
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
          <Leads from={16} />
          <MotorRotor reading={reading} sign="М" />
        </>
      );
  }
}

/** Неподвижные контакты и подвижное плечо (ГОСТ 2.755): разомкнуто — прямое плечо вверх. */
function GostContacts({ closed }: { closed: boolean }) {
  return (
    <>
      <Leads from={16} />
      <ContactDots />
      {closed ? <path d="M-16 0 H16" /> : <path d="M-16 0 L13 -12" />}
    </>
  );
}

/** Тело символа по ANSI/IEEE (тикет 07): круг-источник, зигзаг, дуга ключа. */
function AnsiBody({ component, reading }: { component: PlacedComponent; reading?: ComponentReading }): ReactNode {
  switch (component.kind) {
    case 'battery':
      return (
        <>
          <Leads from={16} />
          {/* источник постоянного напряжения — круг с знаками полюсов */}
          <circle cx="0" cy="0" r="16" />
          <text x="-8" y="4.5" textAnchor="middle" className="symbol-sign" stroke="none">
            +
          </text>
          <text x="8" y="4.5" textAnchor="middle" className="symbol-sign" stroke="none">
            −
          </text>
        </>
      );
    case 'resistor':
      return (
        <>
          <Leads from={26} />
          {/* резистор — зигзаг */}
          <path d="M-26 0 L-19.5 -12 L-6.5 12 L6.5 -12 L19.5 12 L26 0" />
        </>
      );
    case 'lamp':
      return (
        <>
          <LampGlow reading={reading} />
          <Leads from={16} />
          <circle cx="0" cy="0" r="16" />
          {/* нить накаливания — петля внутри окружности */}
          <path d="M-9 9 C-9 -9 9 -9 9 9" />
        </>
      );
    case 'switch':
      return <AnsiSwitchContacts closed={component.closed ?? false} />;
    case 'pushbutton':
      return <AnsiPushbuttonContacts closed={component.closed ?? false} />;
    case 'motor':
      return (
        <>
          <Leads from={16} />
          <MotorRotor reading={reading} sign="M" />
        </>
      );
  }
}

/** Контакты выключателя по ANSI/IEEE: разомкнуто — подвижный контакт дугой над ними. */
function AnsiSwitchContacts({ closed }: { closed: boolean }) {
  return (
    <>
      <Leads from={16} />
      <ContactDots />
      {closed ? <path d="M-16 0 H16" /> : <path d="M-16 0 Q2 -26 14 -12" />}
    </>
  );
}

/**
 * Контакты ключа-кнопки по ANSI/IEEE: подвижный контакт — перекладина
 * с приводом; в разомкнутом состоянии висит над контактами,
 * в замкнутом ложится на них.
 */
function AnsiPushbuttonContacts({ closed }: { closed: boolean }) {
  return (
    <>
      <Leads from={16} />
      <ContactDots />
      {closed ? <path d="M-16 0 H16" /> : <path d="M-16 -9 H16" />}
      {closed ? <path d="M0 0 V-21" /> : <path d="M0 -9 V-21" />}
      <path d="M-8 -21 H8" />
    </>
  );
}

/** Ореол горящей лампочки: прозрачность — яркость от мощности показания. */
function LampGlow({ reading }: { reading?: ComponentReading }): ReactNode {
  if (reading === undefined) return null;
  const brightness = lampBrightness(reading);
  if (brightness <= 0) return null;
  return (
    <circle
      className="symbol-lamp-glow"
      r={22}
      opacity={brightness}
      aria-hidden="true"
    />
  );
}

/** Миниатюра Компонента для Палитры: символ выбранного стандарта с номиналами по умолчанию. */
export function PaletteSymbol({ kind, standard }: { kind: ComponentKind; standard: SymbolStandard }) {
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
        <CanvasSymbolBody component={preview} standard={standard} />
      </g>
    </svg>
  );
}
