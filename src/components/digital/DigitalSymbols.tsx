import type { ReactNode } from 'react';
import type { Bit } from '../../domain/booleanEngine';
import {
  defaultClockFrequency,
  type DigitalComponent,
  type DigitalKind,
} from '../../domain/digitalCanvas';
import type { SymbolStandard } from '../../domain/symbols';

/**
 * Условные обозначения цифрового Холста. Логические элементы — по ГОСТ
 * 2.743 (прямоугольник с меткой функции: «&» — И, «1» — ИЛИ, «1» с кружком
 * инверсии на выходе — НЕ) и по ANSI (контурные фигуры: D — И, щит — ИЛИ,
 * треугольник с кружком — НЕ). Кнопка, Индикатор и Тактовый генератор —
 * учебные обозначения, одинаковые в обоих стандартах: функцию несут глифы,
 * а не стандарт. Каждый символ рисуется в локальных координатах: центр
 * (0,0), выводы на ±40 по оси X (слой Холста оборачивает тело в
 * <g transform="translate(x y) rotate(deg)">); вывод 0 у И/ИЛИ — верхний
 * вход, у НЕ — вход, у Кнопки и Генератора — выход; у Индикатора вывод 0 —
 * вход.
 */

/** Названия Компонентов цифрового Холста (копия UI; идентификаторы — данные домена). */
export const digitalComponentTitles: Record<DigitalKind, string> = {
  and: 'Элемент И',
  or: 'Элемент ИЛИ',
  not: 'Элемент НЕ',
  button: 'Кнопка',
  indicator: 'Индикатор',
  clock: 'Тактовый генератор',
};

/** Частота Генератора для подписи: русская запятая («0,5 Гц»). */
export function formatFrequency(frequency: number): string {
  return `${String(frequency).replace('.', ',')} Гц`;
}

/** Подпись состояния рядом с Компонентом на Холсте; у элементов и Индикатора подписи нет. */
export function digitalValueLabel(component: DigitalComponent): string {
  switch (component.kind) {
    case 'clock':
      return formatFrequency(component.frequency ?? defaultClockFrequency);
    case 'button':
      return component.high ? 'нажата' : 'отпущена';
    case 'and':
    case 'or':
    case 'not':
    case 'indicator':
      return '';
  }
}

/**
 * Тело символа Компонента в локальных координатах. `level` — текущий бит
 * вывода: Индикатор светится на 1 (в Палитре уровня нет — символы статичны).
 */
export function DigitalSymbolBody({
  component,
  level,
  standard,
}: {
  component: DigitalComponent;
  level?: Bit;
  standard: SymbolStandard;
}): ReactNode {
  switch (standard) {
    case 'gost':
      return <GostBody component={component} level={level} />;
    case 'ansi':
      return <AnsiBody component={component} level={level} />;
  }
}

/** Ведущие линии: от края символа до точки подключения. */
function Lead({ from, to }: { from: number; to: number }) {
  return <path d={`M${from} 0 H${to}`} />;
}

/** Ведущие к входам И/ИЛИ: по краям слева, на высотах ±20. */
function GateInputLeads() {
  return <path d="M-40 -20 H-20 M-40 20 H-20" />;
}

/** Кружок инверсии на выходе НЕ. */
function InversionBubble() {
  return <circle cx="23" cy="0" r="3" />;
}

/** Метафункция элемента по ГОСТ 2.743: «&» — И, «1» — ИЛИ и НЕ. */
function GostGateMark({ kind }: { kind: 'and' | 'or' | 'not' }) {
  return (
    <text x="0" y="5.5" textAnchor="middle" className="digital-mark" stroke="none">
      {kind === 'and' ? '&' : '1'}
    </text>
  );
}

/** Прямоугольник элемента по ГОСТ 2.743. */
function GostGate({ kind }: { kind: 'and' | 'or' | 'not' }) {
  return (
    <>
      {kind === 'and' || kind === 'or' ? <GateInputLeads /> : <Lead from={-40} to={-20} />}
      <rect x="-20" y="-20" width="40" height="40" />
      <GostGateMark kind={kind} />
      {kind === 'not' ? (
        <>
          <InversionBubble />
          <Lead from={26} to={40} />
        </>
      ) : (
        <Lead from={20} to={40} />
      )}
    </>
  );
}

/** Контур элемента по ANSI/IEEE: D — И, щит — ИЛИ, треугольник — НЕ. */
function AnsiGate({ kind }: { kind: 'and' | 'or' | 'not' }) {
  if (kind === 'and') {
    return (
      <>
        <GateInputLeads />
        <path d="M-20 -20 H0 A20 20 0 0 1 0 20 H-20 Z" />
        <Lead from={20} to={40} />
      </>
    );
  }
  if (kind === 'or') {
    return (
      <>
        <GateInputLeads />
        {/* задняя дуга щита вогнута, боковые сходятся к выходу */}
        <path d="M-20 -20 Q6 -14 20 0 Q6 14 -20 20 Q-8 0 -20 -20 Z" />
        <Lead from={20} to={40} />
      </>
    );
  }
  return (
    <>
      <Lead from={-40} to={-20} />
      <path d="M-20 -16 L20 0 L-20 16 Z" />
      <InversionBubble />
      <Lead from={26} to={40} />
    </>
  );
}

/** Тело символа по ГОСТ 2.743. */
function GostBody({ component, level }: { component: DigitalComponent; level?: Bit }): ReactNode {
  switch (component.kind) {
    case 'and':
      return <GostGate kind="and" />;
    case 'or':
      return <GostGate kind="or" />;
    case 'not':
      return <GostGate kind="not" />;
    case 'button':
      return (
        <>
          {/* кнопка-источник: шляпка на штоке над корпусом; нажатие — шток опущен */}
          <rect x="-20" y="-12" width="40" height="24" />
          <text x="0" y="5.5" textAnchor="middle" className="digital-mark" stroke="none">
            S
          </text>
          <Lead from={20} to={40} />
          {component.high ? <path d="M0 -12 V-20 M-8 -20 H8" /> : <path d="M0 -12 V-22 M-8 -22 H8" />}
        </>
      );
    case 'indicator':
      return <IndicatorBody level={level} />;
    case 'clock':
      return <ClockBody />;
  }
}

/** Тело символа по ANSI/IEEE; Кнопка в круглой оправе — частый англоязычный рисунок. */
function AnsiBody({ component, level }: { component: DigitalComponent; level?: Bit }): ReactNode {
  switch (component.kind) {
    case 'and':
      return <AnsiGate kind="and" />;
    case 'or':
      return <AnsiGate kind="or" />;
    case 'not':
      return <AnsiGate kind="not" />;
    case 'button':
      return (
        <>
          <circle cx="0" cy="0" r="18" />
          <text x="0" y="5" textAnchor="middle" className="digital-mark" stroke="none">
            S
          </text>
          <Lead from={18} to={40} />
          {component.high ? <path d="M0 -18 V-26 M-8 -26 H8" /> : <path d="M0 -18 V-28 M-8 -28 H8" />}
        </>
      );
    case 'indicator':
      return <IndicatorBody level={level} />;
    case 'clock':
      return <ClockBody />;
  }
}

/** Индикатор: ореол и заливка на уровне 1 читаются взглядом. */
function IndicatorBody({ level }: { level?: Bit }): ReactNode {
  return (
    <>
      <IndicatorGlow level={level} />
      <Lead from={-40} to={-16} />
      <circle cx="0" cy="0" r="16" className={level === 1 ? 'digital-indicator-on' : undefined} />
    </>
  );
}

/** Генератор: прямоугольник с меандром — форма его сигнала. */
function ClockBody(): ReactNode {
  return (
    <>
      <rect x="-20" y="-12" width="40" height="24" />
      <path d="M-14 5 V-5 H-6 V5 H2 V-5 H10 V5" />
      <Lead from={20} to={40} />
    </>
  );
}

/** Ореол горящего Индикатора: уровень 1 читается взглядом. */
function IndicatorGlow({ level }: { level?: Bit }): ReactNode {
  if (level !== 1) return null;
  return <circle className="digital-indicator-glow" r="24" aria-hidden="true" />;
}

/** Миниатюра Компонента для Палитры: символ выбранного стандарта с номиналами по умолчанию. */
export function DigitalPaletteSymbol({ kind, standard }: { kind: DigitalKind; standard: SymbolStandard }) {
  const preview: DigitalComponent = {
    id: '',
    kind,
    x: 0,
    y: 0,
    rotation: 0,
    ...(kind === 'clock' ? { frequency: defaultClockFrequency } : {}),
  };
  return (
    <svg className="palette-symbol" viewBox="-46 -30 92 60" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <DigitalSymbolBody component={preview} standard={standard} />
      </g>
    </svg>
  );
}
