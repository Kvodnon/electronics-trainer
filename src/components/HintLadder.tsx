import { useState } from 'react';
import type { TaskHints } from '../domain/task';

interface HintLadderProps {
  hints: TaskHints;
}

/**
 * Лестница Подсказок (CONTEXT.md: Подсказка): ступени открываются по одной,
 * по кнопке ученика. Ступень 1 — наводящий вопрос, ступень 2 — почти решение;
 * готовый ответ не выдаётся — это гарантия контента, компонент лишь
 * показывает ступени по порядку.
 */
export function HintLadder({ hints }: HintLadderProps) {
  const [revealedSteps, setRevealedSteps] = useState(0);

  return (
    <section className="hints" aria-label="Подсказки">
      {revealedSteps >= 1 && (
        <p className="hint hint-question">
          <span className="hint-step">Подсказка 1 · наводящий вопрос</span>
          {hints.question}
        </p>
      )}
      {revealedSteps >= 2 && (
        <p className="hint hint-almost-solution">
          <span className="hint-step">Подсказка 2 · почти решение</span>
          {hints.almostSolution}
        </p>
      )}
      {revealedSteps === 0 && (
        <button type="button" className="button-secondary" onClick={() => setRevealedSteps(1)}>
          Подсказка
        </button>
      )}
      {revealedSteps === 1 && (
        <button type="button" className="button-secondary" onClick={() => setRevealedSteps(2)}>
          Ещё подсказка
        </button>
      )}
    </section>
  );
}
