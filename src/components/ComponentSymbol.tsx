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

/** Вывод слева от символа — до координаты x. */
const leadLeftTo = (endX: number) => <path d={`M4 24 H${endX}`} />;
/** Вывод справа от символа — от координаты x. */
const leadRightFrom = (startX: number) => <path d={`M${startX} 24 H136`} />;

const registry: Record<ComponentSymbolId, SymbolEntry> = {
  resistor: {
    name: 'Резистор',
    gost: (
      <>
        {leadLeftTo(38)}
        <rect x="38" y="16" width="64" height="16" />
        {leadRightFrom(102)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(38)}
        <path d="M38 24 L46 10 L62 38 L78 10 L94 38 L102 24" />
        {leadRightFrom(102)}
      </>
    ),
  },
  'dc-source': {
    name: 'Источник постоянного напряжения',
    gost: (
      <>
        {leadLeftTo(58)}
        {/* батарея из двух гальванических элементов: длинная пластина — «плюс» */}
        <path d="M58 6 V42 M68 15 V33 M78 6 V42 M88 15 V33" />
        <text x="50" y="11" className="symbol-sign" stroke="none">
          +
        </text>
        {leadRightFrom(88)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(54)}
        <circle cx="70" cy="24" r="16" />
        <text x="63" y="29" className="symbol-sign" stroke="none">
          +
        </text>
        <text x="74" y="29" className="symbol-sign" stroke="none">
          −
        </text>
        {leadRightFrom(86)}
      </>
    ),
  },
  capacitor: {
    name: 'Конденсатор',
    gost: (
      <>
        {leadLeftTo(64)}
        <path d="M64 8 V40 M76 8 V40" />
        {leadRightFrom(76)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(64)}
        <path d="M64 8 V40" />
        {/* вторая пластина — дугой, вершиной к выводу */}
        <path d="M76 8 Q88 24 76 40" />
        {leadRightFrom(82)}
      </>
    ),
  },
  diode: {
    name: 'Диод',
    gost: (
      <>
        {leadLeftTo(50)}
        {/* треугольник проводимости заполнен: ток идёт «по стрелке», к черте-катоду */}
        <polygon points="50,10 50,38 82,24" fill="currentColor" stroke="none" />
        <path d="M82 10 V38" />
        {leadRightFrom(82)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(50)}
        <polygon points="50,10 50,38 82,24" />
        <path d="M82 10 V38" />
        {leadRightFrom(82)}
      </>
    ),
  },
  led: {
    name: 'Светодиод',
    gost: (
      <>
        {leadLeftTo(50)}
        <polygon points="50,10 50,38 82,24" fill="currentColor" stroke="none" />
        <path d="M82 10 V38" />
        {/* стрелки излучения — свет уходит прочь от символа */}
        <path d="M64 12 L76 2 M70 2 L76 2 L76 8" />
        <path d="M72 14 L84 4 M78 4 L84 4 L84 10" />
        {leadRightFrom(82)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(50)}
        <polygon points="50,10 50,38 82,24" />
        <path d="M82 10 V38" />
        <path d="M64 12 L76 2 M70 2 L76 2 L76 8" />
        <path d="M72 14 L84 4 M78 4 L84 4 L84 10" />
        {leadRightFrom(82)}
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
