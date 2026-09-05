import { useMemo, useState } from 'react';
import { QuestionScreen } from './components/QuestionScreen';
import { demoQuestion } from './content/demo';
import { evaluate } from './domain/evaluate';
import type { ChoiceAnswer, ChoiceQuestionEvaluation } from './domain/evaluate';

/**
 * Каркас Тренажёра. Пока — один демонстрационный Вопрос;
 * Курс из Модулей (тикет 03) вырастет вокруг этого луча.
 */
export function App() {
  const [answer, setAnswer] = useState<ChoiceAnswer | null>(null);
  const [finished, setFinished] = useState(false);

  const evaluation = useMemo<ChoiceQuestionEvaluation | null>(
    () => (answer ? evaluate(demoQuestion, answer) : null),
    [answer],
  );

  function restart() {
    setAnswer(null);
    setFinished(false);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Электроника с нуля</h1>
        <p className="app-subtitle">Тренажёр: курс, вопросы и схемы</p>
      </header>

      <main>
        {finished ? (
          <section className="panel done" aria-labelledby="done-heading">
            <h2 id="done-heading">Демонстрационный Вопрос пройден</h2>
            <p>
              Дальше здесь появится Курс из Модулей с Теорией, Вопросами и Схема-заданиями —
              каркас уже готов их принимать.
            </p>
            <button type="button" className="button-primary" onClick={restart}>
              Пройти ещё раз
            </button>
          </section>
        ) : (
          <QuestionScreen
            question={demoQuestion}
            evaluation={evaluation}
            onAnswer={(choiceId) => setAnswer({ chosenChoiceId: choiceId })}
            onNext={() => setFinished(true)}
          />
        )}
      </main>
    </div>
  );
}
