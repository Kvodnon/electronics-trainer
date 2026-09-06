import { useEffect, useMemo, useRef, useState } from 'react';
import type { TransientPlan } from '../../domain/task';
import { voltageAt, type TransientSolution } from '../../domain/transient';
import { formatQuantity } from '../../domain/quantity';

/**
 * Осциллографическая панель (тикет 14): график напряжения конденсаторов во
 * времени по решению переходного Симулятора. «Проиграть» ведёт бегунок по
 * кривой: ученик видит, как конденсатор «наполняется», и связывает картинку
 * с формулой экспоненты. Слой отрисовки читает готовое решение — вся физика
 * живёт в домене.
 */

/** Сколько реальных секунд длится проигрывание плана независимо от его длины. */
const PLAYBACK_SECONDS = 3.6;

/** Секунды между двумя отметками производительности; callback получает now. */
function elapsedSeconds(now: number, start: number): number {
  return (now - start) / 1000;
}

/** Габариты графика: поле рисунка и отступы под оси. */
const VIEW = { width: 640, height: 260, left: 56, right: 16, top: 14, bottom: 36 };
const PLOT_WIDTH = VIEW.width - VIEW.left - VIEW.right;
const PLOT_HEIGHT = VIEW.height - VIEW.top - VIEW.bottom;

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
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (tick: (now: number) => void) => setTimeout(() => tick(Date.now()), 16);
    const cancel =
      typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (id: number) => clearTimeout(id);
    const tick = (now: number) => {
      if (start === null) start = now;
      const moment = Math.min(end, (elapsedSeconds(now, start) / PLAYBACK_SECONDS) * end);
      setTime(moment);
      if (moment >= end) {
        setPlaying(false);
        return;
      }
      frameRef.current = schedule(tick);
    };
    frameRef.current = schedule(tick);
    return () => {
      if (frameRef.current !== null) cancel(frameRef.current);
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
}

/** Осциллограф: сетка, кривые заряда, отметки ключа и τ, бегунок проигрывания. */
export function OscilloscopePanel({ plan, transient, playback }: OscilloscopePanelProps) {
  const duration = plan.duration;
  const x = (t: number) => VIEW.left + (t / duration) * PLOT_WIDTH;
  // нижний предел шкалы 1 В: пустая схема не должна рисовать шкалу в пиковольтах
  const voltagePeak = Math.max(...[...transient.capacitorVoltages.values()].flat(), 1);
  const y = (v: number) => VIEW.top + PLOT_HEIGHT - (v / voltagePeak) * PLOT_HEIGHT;

  const curves = [...transient.capacitorVoltages.entries()];
  const firstCapacitor = curves[0];
  const playhead =
    playback.time === null || firstCapacitor === undefined
      ? null
      : {
          x: x(playback.time),
          y: y(voltageAt(transient, firstCapacitor[0], playback.time) ?? 0),
        };

  return (
    <section className="panel scope-panel" aria-label="Осциллограф: напряжение во времени">
      <div className="scope-controls">
        <p className="question-kind">Осциллограф</p>
        <button type="button" className="button-secondary" onClick={playback.toggle}>
          {playback.playing ? 'Остановить' : 'Проиграть заряд'}
        </button>
        <p className="scope-readout" aria-live="polite">
          {playback.time === null
            ? 'Нажмите «Проиграть заряд», чтобы посмотреть процесс во времени'
            : `t = ${formatQuantity(playback.time, 'с')} · U = ${formatQuantity(
                firstCapacitor !== undefined ? (voltageAt(transient, firstCapacitor[0], playback.time) ?? 0) : 0,
                'В',
              )}`}
        </p>
      </div>
      <svg
        className="scope-svg"
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        role="img"
        aria-label="График напряжения конденсатора во времени"
      >
        {/* горизонтальная сетка с подписями напряжения */}
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <g key={`h${fraction}`}>
            <line
              className="scope-grid-line"
              x1={VIEW.left}
              x2={VIEW.left + PLOT_WIDTH}
              y1={y(voltagePeak * fraction)}
              y2={y(voltagePeak * fraction)}
            />
            <text className="scope-tick" x={VIEW.left - 8} y={y(voltagePeak * fraction) + 4} textAnchor="end">
              {formatQuantity(voltagePeak * fraction, 'В')}
            </text>
          </g>
        ))}
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
                y1={y(voltagePeak * 0.63)}
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
        {curves.map(([id, curve]) => (
          <polyline
            key={id}
            className="scope-curve"
            points={curve.map((v, index) => `${x(transient.times[index])},${y(v)}`).join(' ')}
          />
        ))}
        {/* бегунок проигрывания */}
        {playhead !== null && <circle className="scope-playhead" cx={playhead.x} cy={playhead.y} r={5} />}
      </svg>
    </section>
  );
}
