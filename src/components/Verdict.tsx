import type { ReactNode } from 'react';

/** Исход проверки, общий для всех видов Вопросов. */
export type VerdictOutcome = 'correct' | 'incorrect';

/**
 * Вердикт проверки: слово «Верно»/«Неверно» и пояснения вида Задания
 * (правильный вариант, принятый диапазон и т.п.).
 */
export function Verdict({ outcome, children }: { outcome: VerdictOutcome; children?: ReactNode }) {
  return (
    <p role="status" className={`verdict verdict-${outcome}`}>
      <span className="verdict-word">{outcome === 'correct' ? 'Верно' : 'Неверно'}</span>
      {children}
    </p>
  );
}
