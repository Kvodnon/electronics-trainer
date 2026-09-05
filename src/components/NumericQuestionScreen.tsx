import { useState } from 'react';
import type { NumericAnswer, NumericQuestionEvaluation } from '../domain/evaluate';
import type { NumericQuestion } from '../domain/task';
import type { QuantityUnit } from '../domain/quantity';
import { formatQuantity, parseQuantity, unitSuffixes } from '../domain/quantity';

const UNIT_NOUNS: Record<QuantityUnit, string> = {
  'А': 'амперы',
  'В': 'вольты',
  'Ом': 'омы',
};

function unitHint(unit: QuantityUnit): string {
  return `Единицы: ${unitSuffixes(unit).join(', ')}; без суффикса — ${UNIT_NOUNS[unit]} (${unit}).`;
}

interface NumericQuestionScreenProps {
  question: NumericQuestion;
  evaluation: NumericQuestionEvaluation | null;
  onAnswer: (answer: NumericAnswer) => void;
  onNext: () => void;
}

/**
 * Экран числового Вопроса: тонкий слой над доменом — ввод разбирается
 * парсером `parseQuantity`, неверный ввод отклоняется без вызова `evaluate`,
 * поэтому попытка не сжигается. Вердикт рендерит Разбор или решение.
 */
export function NumericQuestionScreen({
  question,
  evaluation,
  onAnswer,
  onNext,
}: NumericQuestionScreenProps) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const answered = evaluation !== null;

  function submit() {
    const parsed = parseQuantity(raw, question.unit);
    if (parsed.status === 'error') {
      setError(parsed.message);
      return;
    }
    setError(null);
    onAnswer({ kind: 'numeric-answer', value: parsed.value });
  }

  return (
    <section className="panel question" aria-labelledby="question-prompt">
      <p className="question-kind">Вопрос с числовым ответом</p>
      <h2 id="question-prompt" className="question-prompt">
        {question.prompt}
      </h2>

      <form
        className="numeric-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!answered) submit();
        }}
      >
        <label htmlFor="numeric-answer-field">Ответ</label>
        <input
          id="numeric-answer-field"
          className="numeric-input-field"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="10мА"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          disabled={answered}
          aria-invalid={error !== null}
          aria-describedby={error ? 'numeric-error' : 'numeric-hint'}
        />
        <button type="submit" className="button-primary" disabled={answered}>
          Ответить
        </button>
      </form>
      {error ? (
        <p id="numeric-error" role="alert" className="input-error">
          {error}
        </p>
      ) : (
        <p id="numeric-hint" className="numeric-hint">
          {unitHint(question.unit)}
        </p>
      )}

      {evaluation && (
        <>
          <p role="status" className={`verdict verdict-${evaluation.outcome}`}>
            <span className="verdict-word">
              {evaluation.outcome === 'correct' ? 'Верно' : 'Неверно'}
            </span>
            <span className="verdict-note">
              ваш ответ понят как {formatQuantity(evaluation.answeredValue, question.unit)}
            </span>
            {evaluation.outcome === 'incorrect' && (
              <span className="verdict-note">
                принималось {formatQuantity(evaluation.acceptedFrom, question.unit)}–
                {formatQuantity(evaluation.acceptedTo, question.unit)} (±
                {Math.round(evaluation.tolerance * 100)}%)
              </span>
            )}
          </p>

          {evaluation.outcome === 'correct' ? (
            <section className="review-single" aria-labelledby="razbor-heading">
              <h3 id="razbor-heading">Разбор</h3>
              <p className="review-explanation">{evaluation.razbor}</p>
            </section>
          ) : (
            <section className="solution" aria-labelledby="solution-heading">
              <h3 id="solution-heading">Пошаговое решение</h3>
              <ol className="solution-steps">
                {evaluation.solutionSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </section>
          )}

          <button type="button" className="button-primary" onClick={onNext}>
            Дальше
          </button>
        </>
      )}
    </section>
  );
}
