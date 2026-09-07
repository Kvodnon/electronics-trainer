import { useEffect, useMemo, useReducer, useState } from 'react';
import { evaluateDigital } from '../domain/booleanEngine';
import {
  demoDigitalCanvas,
  digitalCanvasReducer,
  digitalComponentKinds,
  emptyDigitalHistory,
} from '../domain/digitalCanvas';
import type { SymbolStandard } from '../domain/symbols';
import { DigitalCanvasEditor } from './digital/DigitalCanvasEditor';
import { StandardControls } from './canvas/ToolbarControls';

/**
 * Шаг времени симуляции: тик обязан быть короче полутора полупериодов самого
 * быстрого Генератора, иначе при верхней частоте (полупериод 25 мс при
 * 20 Гц) выборка попадает на одну и ту же фазу и такт «замирает» на экране.
 */
const TICK_MS = 25;

/**
 * Тактовое время Холста: секунды с момента появления первого Генератора.
 * Время живёт здесь, в UI, — движок и редьюсер остаются чистыми функциями
 * без таймеров. Без Генератора на схеме время не идёт: перерисовывать
 * нечего. Возвращение к нулю при новом Генераторе не вредит: фаза меандра
 * определена с точностью до периода.
 */
function useSimulationTime(hasClock: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!hasClock) return;
    const startedAt = Date.now();
    setNow(0);
    const timer = window.setInterval(() => setNow((Date.now() - startedAt) / 1000), TICK_MS);
    return () => window.clearInterval(timer);
  }, [hasClock]);
  return now;
}

interface DigitalCanvasScreenProps {
  readonly symbolStandard: SymbolStandard;
  readonly onSymbolStandardChange: (standard: SymbolStandard) => void;
  readonly onExit: () => void;
}

/**
 * Экран цифрового Холста — свободная сборка М3 без аналогового Симулятора
 * (ADR-0002). Схема живёт сама: булевый движок пересчитывается на каждое
 * изменение Холста и на каждый тик Генератора, уровни 0/1 видны на каждом
 * выводе и каждом Проводе. «Демо-схема» ставит готовый пример: Генератор и
 * Кнопка через И и НЕ на два Индикатора.
 */
export function DigitalCanvasScreen({
  symbolStandard,
  onSymbolStandardChange,
  onExit,
}: DigitalCanvasScreenProps) {
  const [history, onAction] = useReducer(digitalCanvasReducer, emptyDigitalHistory);
  const now = useSimulationTime(history.present.components.some((c) => c.kind === 'clock'));
  const levels = useMemo(() => evaluateDigital(history.present, now), [history.present, now]);

  function loadDemo() {
    onAction({ type: 'canvas-loaded', canvas: demoDigitalCanvas() });
  }

  return (
    <div className="sandbox-screen">
      <header className="module-header">
        <button type="button" className="link-back" onClick={onExit}>
          ← К Курсу
        </button>
        <h2 className="module-header-title">Цифровой Холст</h2>
      </header>

      <section className="panel" aria-label="Цифровой Холст">
        <p className="question-kind">Сигналы строго 0 и 1</p>
        <p className="sandbox-intro">
          Собирайте логику: Кнопка и Генератор дают сигналы, элементы И, ИЛИ и НЕ их
          обрабатывают, Индикатор показывает уровень. Уровень виден на каждом выводе и
          окрашивает каждый Провод — схема отлаживается взглядом.
        </p>
        <DigitalCanvasEditor
          palette={digitalComponentKinds}
          history={history}
          onAction={onAction}
          symbolStandard={symbolStandard}
          levels={levels}
          actions={
            <>
              <button type="button" className="button-secondary" onClick={loadDemo}>
                Демо-схема
              </button>
              <StandardControls standard={symbolStandard} onChange={onSymbolStandardChange} />
            </>
          }
        />
      </section>
    </div>
  );
}
