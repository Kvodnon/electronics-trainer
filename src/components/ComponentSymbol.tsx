import type { ReactNode } from 'react';
import type { ComponentSymbolId } from '../domain/course';

/**
 * Условное обозначение Компонента в двух стандартах рядом:
 * ГОСТ/IEC (русскоязычные учебники) и ANSI (англоязычные материалы).
 * Идентификаторы — данные домена; сам отрисовочный слой живёт здесь,
 * в UI (см. spec: «слой отрисовки с двумя наборами символов»).
 */

interface SymbolEntry {
  readonly name: string;
  readonly gost: ReactNode;
  readonly ansi: ReactNode;
}

/** Общие выводы-полубесконечности слева и справа от символа. */
const leadLeft = <path d="M4 24 H38" />;
const leadRight = <path d="M102 24 H136" />;
const leadLeftWide = <path d="M4 24 H58" />;
const leadRightWide = <path d="M88 24 H136" />;

const registry: Record<ComponentSymbolId, SymbolEntry> = {
  resistor: {
    name: 'Резистор',
    gost: (
      <>
        {leadLeft}
        <rect x="38" y="16" width="64" height="16" />
        {leadRight}
      </>
    ),
    ansi: (
      <>
        {leadLeft}
        <path d="M38 24 L46 10 L62 38 L78 10 L94 38 L102 24" />
        {leadRight}
      </>
    ),
  },
  'dc-source': {
    name: 'Источник постоянного напряжения',
    gost: (
      <>
        {leadLeftWide}
        {/* батарея из двух гальванических элементов: длинная пластина — «плюс» */}
        <path d="M58 6 V42 M68 15 V33 M78 6 V42 M88 15 V33" />
        <text x="50" y="11" className="symbol-sign" stroke="none">
          +
        </text>
        {leadRightWide}
      </>
    ),
    ansi: (
      <>
        <path d="M4 24 H54" />
        <circle cx="70" cy="24" r="16" />
        <text x="63" y="29" className="symbol-sign" stroke="none">
          +
        </text>
        <text x="74" y="29" className="symbol-sign" stroke="none">
          −
        </text>
        <path d="M86 24 H136" />
      </>
    ),
  },
  capacitor: {
    name: 'Конденсатор',
    gost: (
      <>
        <path d="M4 24 H64" />
        <path d="M64 8 V40 M76 8 V40" />
        <path d="M76 24 H136" />
      </>
    ),
    ansi: (
      <>
        <path d="M4 24 H64" />
        <path d="M64 8 V40" />
        {/* вторая пластина — дугой, вершиной к выводу */}
        <path d="M76 8 Q88 24 76 40" />
        <path d="M82 24 H136" />
      </>
    ),
  },
};

function SymbolFigure({ standard, drawing }: { standard: string; drawing: ReactNode }) {
  return (
    <figure className="symbol-figure">
      <figcaption className="symbol-standard">{standard}</figcaption>
      <svg
        className="symbol-svg"
        viewBox="0 0 140 48"
        role="img"
        aria-label={`Обозначение: стандарт ${standard}`}
      >
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {drawing}
        </g>
      </svg>
    </figure>
  );
}

/** Пара обозначений одного Компонента: ГОСТ/IEC и ANSI рядом. */
export function ComponentSymbol({ id }: { id: ComponentSymbolId }) {
  const entry = registry[id];
  return (
    <div className="symbol-comparison">
      <p className="symbol-name">{entry.name}</p>
      <div className="symbol-pair">
        <SymbolFigure standard="ГОСТ / IEC" drawing={entry.gost} />
        <SymbolFigure standard="ANSI" drawing={entry.ansi} />
      </div>
    </div>
  );
}
