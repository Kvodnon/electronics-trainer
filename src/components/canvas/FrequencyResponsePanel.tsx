import { useMemo } from 'react';
import type { CanvasState, ComponentKind } from '../../domain/canvas';
import { defaultAcAmplitude, defaultAcFrequency } from '../../domain/canvas';
import { amplitudeResponseOf, RESPONSE_SWEEP_HZ, type FrequencyResponsePoint } from '../../domain/phasor';
import { formatQuantity, formatTimesRatio } from '../../domain/quantity';
import { SCOPE_VIEW } from './OscilloscopePanel';

/**
 * Панель АЧХ (тикет 21): амплитудно-частотная характеристика фильтра,
 * построенная свипом фазоров по стандартной логарифмической сетке
 * (1 Гц … 100 кГц). Кривая перестраивается на каждое изменение схемы;
 * курсор стоит на частоте источника ~ и показывает амплитуду на выходе
 * и во сколько раз источник ослаблен — «где фильтр режет» видно сразу.
 * Слой отрисовки читает готовый свип — вся физика живёт в домене.
 */

/** Габариты графика — общие с осциллографом. */
const VIEW = SCOPE_VIEW;
const PLOT_WIDTH = VIEW.width - VIEW.left - VIEW.right;
const PLOT_HEIGHT = VIEW.height - VIEW.top - VIEW.bottom;

const F_MIN = RESPONSE_SWEEP_HZ[0];
const F_MAX = RESPONSE_SWEEP_HZ[RESPONSE_SWEEP_HZ.length - 1];
const LOG_MIN = Math.log10(F_MIN);
const LOG_MAX = Math.log10(F_MAX);

/** Десятилетия оси: отметки и подписи 1 Гц, 10 Гц, … 100 кГц. */
const DECADES = RESPONSE_SWEEP_HZ.filter((frequency) => Math.abs(Math.log10(frequency) % 1) < 1e-9);

interface FrequencyResponsePanelProps {
  readonly canvas: CanvasState;
  /** Компонент-выход фильтра: амплитуда снимается с первого Компонента вида. */
  readonly outputKind: ComponentKind;
}

/**
 * Амплитуда под курсором: логарифмическая интерполяция между точками свипа —
 * на лог-лог осях АЧХ почти кусочно-линейна, так что промежуточные частоты
 * читаются точно.
 */
function amplitudeAtPoint(response: readonly FrequencyResponsePoint[], frequency: number): number {
  if (response.length === 0) return 0;
  const clamped = Math.min(Math.max(frequency, response[0].frequency), response[response.length - 1].frequency);
  for (let index = 1; index < response.length; index += 1) {
    if (clamped > response[index].frequency) continue;
    const lower = response[index - 1];
    const upper = response[index];
    const span = Math.log10(upper.frequency) - Math.log10(lower.frequency);
    if (span <= 0) return upper.amplitude;
    const fraction = (Math.log10(clamped) - Math.log10(lower.frequency)) / span;
    if (lower.amplitude <= 0 || upper.amplitude <= 0) {
      return lower.amplitude * (1 - fraction) + upper.amplitude * fraction;
    }
    return 10 ** (Math.log10(lower.amplitude) * (1 - fraction) + Math.log10(upper.amplitude) * fraction);
  }
  return response[response.length - 1].amplitude;
}

export function FrequencyResponsePanel({ canvas, outputKind }: FrequencyResponsePanelProps) {
  const response = useMemo(() => amplitudeResponseOf(canvas, outputKind), [canvas, outputKind]);
  const source = canvas.components.find((component) => component.kind === 'acsource');
  const sourceFrequency = source?.frequency ?? defaultAcFrequency;
  const emf = source?.voltage ?? defaultAcAmplitude;

  // нижний предел шкалы 0,5 В: пустая схема не должна рисовать шкалу в милливольтах
  const amplitudePeak = Math.max(0.5, ...response.map((point) => point.amplitude));
  const x = (frequency: number) =>
    VIEW.left +
    ((Math.log10(Math.min(Math.max(frequency, F_MIN), F_MAX)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * PLOT_WIDTH;
  const y = (amplitude: number) => VIEW.top + PLOT_HEIGHT - (amplitude / amplitudePeak) * PLOT_HEIGHT;

  const cursorX = x(sourceFrequency);
  const cursorAmplitude = source === undefined ? 0 : amplitudeAtPoint(response, sourceFrequency);
  const readout =
    source === undefined
      ? 'Поставьте источник ~ — АЧХ строится от его амплитуды и частоты'
      : cursorAmplitude > 0
        ? `f = ${formatQuantity(sourceFrequency, 'Гц')} · на выходе ${formatQuantity(cursorAmplitude, 'В')} · ослабление ${formatTimesRatio(emf / cursorAmplitude)}`
        : `f = ${formatQuantity(sourceFrequency, 'Гц')} · на выходе 0 В — сигнала на выходе нет`;

  return (
    <section className="panel scope-panel" aria-label="АЧХ: амплитудно-частотная характеристика">
      <div className="scope-controls">
        <p className="question-kind">АЧХ</p>
        <p className="scope-readout" aria-live="polite">
          {readout}
        </p>
      </div>
      <svg
        className="scope-svg"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="График АЧХ: амплитуда на выходе по частоте"
      >
        {/* горизонтальная сетка с подписями амплитуды */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={`h${fraction}`}>
            <line
              className="scope-grid-line"
              x1={VIEW.left}
              x2={VIEW.left + PLOT_WIDTH}
              y1={y(amplitudePeak * fraction)}
              y2={y(amplitudePeak * fraction)}
            />
            <text className="scope-tick" x={VIEW.left - 8} y={y(amplitudePeak * fraction) + 4} textAnchor="end">
              {formatQuantity(amplitudePeak * fraction, 'В')}
            </text>
          </g>
        ))}
        {/* вертикальная сетка по десятилетиям */}
        {DECADES.map((frequency) => (
          <g key={frequency}>
            <line
              className="scope-grid-line"
              x1={x(frequency)}
              x2={x(frequency)}
              y1={VIEW.top}
              y2={VIEW.top + PLOT_HEIGHT}
            />
            <text className="scope-tick" x={x(frequency)} y={VIEW.height - 12} textAnchor="middle">
              {formatQuantity(frequency, 'Гц')}
            </text>
          </g>
        ))}
        {/* кривая АЧХ */}
        {response.length > 0 && (
          <polyline
            className="freq-curve"
            points={response.map((point) => `${x(point.frequency)},${y(point.amplitude)}`).join(' ')}
          />
        )}
        {/* курсор на частоте источника */}
        {source !== undefined && (
          <g className="freq-cursor">
            <line className="freq-cursor-line" x1={cursorX} x2={cursorX} y1={VIEW.top} y2={VIEW.top + PLOT_HEIGHT} />
            <circle className="freq-cursor-dot" cx={cursorX} cy={y(cursorAmplitude)} r={5} />
          </g>
        )}
      </svg>
    </section>
  );
}
