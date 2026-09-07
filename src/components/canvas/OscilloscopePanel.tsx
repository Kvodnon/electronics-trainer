import { useEffect, useMemo, useRef, useState } from 'react';
import type { TransientPlan } from '../../domain/task';
import { valueAtTime, voltageAt, type TransientSolution } from '../../domain/transient';
import { formatQuantity } from '../../domain/quantity';

/**
 * Осциллографическая панель (тикет 14): график напряжения конденсаторов во
 * времени по решению переходного Симулятора. «Проиграть» ведёт бегунок по
 * кривой: ученик видит, как конденсатор «наполняется», и связывает картинку
 * с формулой экспоненты. С тикетом 21 поверх кривых заряда ложатся
 * сигнальные кривые Задания — вход и выход выпрямителя («до и после диода»):
 * у них своя легенда, а вертикальная шкала учитывает их отрицательные
 * полуволны. Слой отрисовки читает готовое решение — вся физика живёт
 * в домене.
 */

/** Сколько реальных секунд длится проигрывание плана независимо от его длины. */
const PLAYBACK_SECONDS = 3.6;

/** Габариты графика: поле рисунка и отступы под оси. Общая с панелью АЧХ. */
export const SCOPE_VIEW = { width: 640, height: 260, left: 56, right: 16, top: 14, bottom: 36 };
const VIEW = SCOPE_VIEW;
const PLOT_WIDTH = VIEW.width - VIEW.left - VIEW.right;
const PLOT_HEIGHT = VIEW.height - VIEW.top - VIEW.bottom;

/** Сигнальная кривая Задания: напряжение входа или выхода во времени. */
export interface ScopeSignalCurve {
  /** Устойчивый ключ строки реакт-списка: id Компонента кривой. */
  readonly key: string;
  readonly label: string;
  readonly values: readonly number[];
  /** Класс цвета кривой и легенды: scope-curve-source / scope-curve-output. */
  readonly className: string;
}

export interface TransientPlayback {
  /** Идёт ли проигрывание прямо сейчас. */
  readonly playing: boolean;
  /** Момент под бегунком, с; null — проигрывание не начинали. */
  readonly time: number | null;
  /** Уровень заряда каждого конденсатора (0..1) под бегунком — для Холста. */
  readonly fillLevels: ReadonlyMap<string, number>;
  /** Запуск (с начала) или остановка проигрывания. */
  readonly toggle: () => void;
}

/**
 * Проигрывание переходного режима: реальное время отображается на план,
 * уровень заряда считается из кривой для заполнения символа конденсатора.
 */
export function useTransientPlayback(transient: TransientSolution | null): TransientPlayback {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || transient === null) return;
    const end = transient.times[transient.times.length - 1];
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const moment = Math.min(end, ((now - start) / 1000 / PLAYBACK_SECONDS) * end);
      setTime(moment);
      if (moment >= end) {
        setPlaying(false);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [playing, transient]);

  const fillLevels = useMemo(() => {
    const levels = new Map<string, number>();
    if (transient === null || time === null) return levels;
    for (const [id, curve] of transient.capacitorVoltages) {
      const peak = Math.max(...curve, 1e-9);
      levels.set(id, Math.min(1, (voltageAt(transient, id, time) ?? 0) / peak));
    }
    return levels;
  }, [transient, time]);

  function toggle() {
    if (playing) {
      setPlaying(false);
      return;
    }
    setTime(0);
    setPlaying(true);
  }

  return { playing, time, fillLevels, toggle };
}

interface OscilloscopePanelProps {
  readonly plan: TransientPlan;
  readonly transient: TransientSolution;
  readonly playback: TransientPlayback;
  /** Кривые входа/выхода Задания (М4): с ними строится легенда и шкала. */
  readonly signalCurves?: readonly ScopeSignalCurve[];
}

/** Осциллограф: сетка, кривые заряда и сигналов, отметки ключа и τ, бегунок. */
export function OscilloscopePanel({ plan, transient, playback, signalCurves }: OscilloscopePanelProps) {
  const duration = plan.duration;
  const x = (t: number) => VIEW.left + (t / duration) * PLOT_WIDTH;
  const capacitorCurves = [...transient.capacitorVoltages.entries()];
  const signals = signalCurves ?? [];

  // шкала по всем показанным кривым: ноль на оси всегда, минус — только если
  // сигнальные кривые уходят в отрицательные полуволны; пустая схема — 1 В
  const shownValues = [
    ...capacitorCurves.flatMap(([, curve]) => curve),
    ...signals.flatMap((signal) => signal.values),
  ];
  const maxV = Math.max(1, ...shownValues);
  const minV = Math.min(0, ...shownValues);
  const y = (v: number) => VIEW.top + ((maxV - v) / (maxV - minV)) * PLOT_HEIGHT;

  // бегунок и показание ведут первую кривую: конденсатор, а без него — вход
  const playheadCurve = capacitorCurves[0]?.[1] ?? signals[0]?.values;
  const playheadValue =
    playback.time === null || playheadCurve === undefined
      ? null
      : valueAtTime(transient.times, playheadCurve, playback.time);

  return (
    <section className="panel scope-panel" aria-label="Осциллограф: напряжение во времени">
      <div className="scope-controls">
        <p className="question-kind">Осциллограф</p>
        {signals.length > 0 && (
          <ul className="scope-legend">
            {signals.map((signal) => (
              <li key={signal.key} className={`scope-legend-item ${signal.className}`}>
                {signal.label}
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="button-secondary" onClick={playback.toggle}>
          {playback.playing ? 'Остановить' : 'Проиграть'}
        </button>
        <p className="scope-readout" aria-live="polite">
          {playback.time === null
            ? 'Нажмите «Проиграть», чтобы посмотреть процесс во времени'
            : `t = ${formatQuantity(playback.time, 'с')} · U = ${formatQuantity(playheadValue ?? 0, 'В')}`}
        </p>
      </div>
      <svg
        className="scope-svg"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="График напряжения во времени"
      >
        {/* горизонтальная сетка с подписями напряжения */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const level = maxV - (maxV - minV) * fraction;
          return (
            <g key={`h${fraction}`}>
              <line className="scope-grid-line" x1={VIEW.left} x2={VIEW.left + PLOT_WIDTH} y1={y(level)} y2={y(level)} />
              <text className="scope-tick" x={VIEW.left - 8} y={y(level) + 4} textAnchor="end">
                {formatQuantity(level, 'В')}
              </text>
            </g>
          );
        })}
        {/* вертикальная сетка с подписями времени */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={`v${fraction}`}>
            <line
              className="scope-grid-line"
              x1={x(duration * fraction)}
              x2={x(duration * fraction)}
              y1={VIEW.top}
              y2={VIEW.top + PLOT_HEIGHT}
            />
            <text className="scope-tick" x={x(duration * fraction)} y={VIEW.height - 12} textAnchor="middle">
              {formatQuantity(duration * fraction, 'с')}
            </text>
          </g>
        ))}
        {/* момент переключения ключа */}
        {plan.switchToggleTime !== undefined && (
          <g className="scope-toggle-mark">
            <line
              className="scope-mark-line"
              x1={x(plan.switchToggleTime)}
              x2={x(plan.switchToggleTime)}
              y1={VIEW.top}
              y2={VIEW.top + PLOT_HEIGHT}
            />
            <text className="scope-mark-label" x={x(plan.switchToggleTime) + 6} y={VIEW.top + 14}>
              ключ
            </text>
          </g>
        )}
        {/* постоянная времени: отметка на оси времени */}
        {[...transient.timeConstants.entries()].map(([id, tau]) =>
          Number.isFinite(tau) && tau <= duration ? (
            <g key={`tau-${id}`} className="scope-tau-mark">
              <line
                className="scope-mark-line scope-mark-line-dotted"
                x1={x(tau)}
                x2={x(tau)}
                y1={y(maxV * 0.63)}
                y2={VIEW.top + PLOT_HEIGHT}
              />
              {/* подпись у основания — кривая заряда проходит через уровень 63% */}
              <text
                className="scope-mark-label"
                x={x(tau) + 6}
                y={VIEW.top + PLOT_HEIGHT - 8}
              >
                τ = {formatQuantity(tau, 'с')}
              </text>
            </g>
          ) : null,
        )}
        {/* кривые напряжения конденсаторов */}
        {capacitorCurves.map(([id, curve]) => (
          <polyline
            key={id}
            className="scope-curve"
            points={curve.map((v, index) => `${x(transient.times[index])},${y(v)}`).join(' ')}
          />
        ))}
        {/* сигнальные кривые Задания: вход и выход выпрямителя */}
        {signals.map((signal) => (
          <polyline
            key={signal.key}
            className={`scope-curve ${signal.className}`}
            points={signal.values.map((v, index) => `${x(transient.times[index])},${y(v)}`).join(' ')}
          />
        ))}
        {/* бегунок проигрывания */}
        {playheadValue !== null && (
          <circle className="scope-playhead" cx={x(playback.time ?? 0)} cy={y(playheadValue)} r={5} />
        )}
      </svg>
    </section>
  );
}
