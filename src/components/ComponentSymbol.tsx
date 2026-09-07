import type { ReactNode } from 'react';
import type { ComponentSymbolId } from '../domain/course';
import type { DigitalKind } from '../domain/digitalCanvas';
import { DigitalSymbolBody, digitalComponentTitles } from './digital/DigitalSymbols';

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

/**
 * Тело цифрового Компонента из слоя цифровых символов: оно рисуется вокруг
 * (0,0) в локальных координатах Холста — сдвиг в центр фигуры 140×48.
 * У логических элементов уровень вывода на рисунок не влияет.
 */
function digitalDrawing(kind: DigitalKind, standard: 'gost' | 'ansi'): ReactNode {
  return (
    <g transform="translate(70 24)">
      <DigitalSymbolBody component={{ id: 'symbol', kind, x: 0, y: 0, rotation: 0 }} standard={standard} />
    </g>
  );
}

function digitalEntry(kind: Extract<DigitalKind, 'and' | 'or' | 'not'>): SymbolEntry {
  return { name: digitalComponentTitles[kind], gost: digitalDrawing(kind, 'gost'), ansi: digitalDrawing(kind, 'ansi') };
}

/** Элементы М3: по ГОСТ 2.743 (метка функции) и по ANSI (контурные фигуры). */
const digitalRegistry: Record<'and' | 'or' | 'not', SymbolEntry> = {
  and: digitalEntry('and'),
  or: digitalEntry('or'),
  not: digitalEntry('not'),
};

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
  transistor: {
    name: 'Транзистор (NPN)',
    gost: (
      <>
        {/* база — вывод слева с чертой; сверху коллектор, снизу эмиттер со стрелкой наружу */}
        {leadLeftTo(50)}
        <path d="M50 8 V40 M50 16 L86 4 M50 32 L86 44" />
        <polygon points="75,40 66,41 69,34" fill="currentColor" stroke="none" />
        <path d="M86 4 H136 M86 44 H136" />
      </>
    ),
    ansi: (
      <>
        {/* тот же NPN, но в окружности — частый рисунок в англоязычных схемах */}
        {leadLeftTo(50)}
        <circle cx="68" cy="24" r="24" />
        <path d="M50 8 V40 M50 16 L86 4 M50 32 L86 44" />
        <polygon points="75,40 66,41 69,34" fill="currentColor" stroke="none" />
        <path d="M86 4 H136 M86 44 H136" />
      </>
    ),
  },
  potentiometer: {
    name: 'Потенциометр',
    gost: (
      <>
        {leadLeftTo(50)}
        <rect x="50" y="16" width="40" height="16" />
        {/* стрелка — движок, третий вывод уходит вниз */}
        <path d="M70 46 V39" />
        <polygon points="70,31 65.5,39 74.5,39" fill="currentColor" stroke="none" />
        {leadRightFrom(90)}
      </>
    ),
    ansi: (
      <>
        {leadLeftTo(50)}
        <path d="M50 24 L57 12 L68 36 L79 12 L90 24" />
        <path d="M70 46 V39" />
        <polygon points="70,31 65.5,39 74.5,39" fill="currentColor" stroke="none" />
        {leadRightFrom(90)}
      </>
    ),
  },
  buzzer: {
    name: 'Зуммер',
    gost: (
      <>
        {/* звонок: купол над линией выводов (ГОСТ 2.755) */}
        {leadLeftTo(55)}
        <path d="M55 24 A15 15 0 0 1 85 24 M55 24 H85" />
        {leadRightFrom(85)}
      </>
    ),
    ansi: (
      <>
        {/* тот же купол с дугами звука — как часто рисуют в англоязычных схемах */}
        {leadLeftTo(55)}
        <path d="M55 24 A15 15 0 0 1 85 24 M55 24 H85" />
        <path d="M92 18 A10 10 0 0 1 92 30 M98 12 A16 16 0 0 1 98 36" />
        {leadRightFrom(85)}
      </>
    ),
  },
  ...digitalRegistry,
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
