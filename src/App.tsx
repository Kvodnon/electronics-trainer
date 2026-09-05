import { useMemo, useState } from 'react';
import { QuestionScreen } from './components/QuestionScreen';
import { NumericQuestionScreen } from './components/NumericQuestionScreen';
import { demoTasks } from './content/demo';
import { evaluate } from './domain/evaluate';
import type { Answer } from './domain/evaluate';

/**
 * Каркас Тренажёра. Пока — два демонстрационных Задания подряд;
 * Курс из Модулей (тикет 03) вырастет вокруг этого луча.
 */
export function App() {
  const [taskIndex, setTaskIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [finished, setFinished] = useState(false);

  const task = demoTasks[taskIndex];
  const answer = task ? answers[task.id] : undefined;
  const evaluation = useMemo(
    () => (task && answer ? evaluate(task, answer) : null),
    [task, answer],
  );

  function answerCurrent(next: Answer) {
    if (!task) return;
    setAnswers((prev) => ({ ...prev, [task.id]: next }));
  }

  function goNext() {
    if (taskIndex + 1 >= demoTasks.length) {
      setFinished(true);
    } else {
      setTaskIndex((index) => index + 1);
    }
  }

  function restart() {
    setTaskIndex(0);
    setAnswers({});
    setFinished(false);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Электроника с нуля</h1>
        <p className="app-subtitle">Тренажёр: курс, вопросы и схемы</p>
      </header>

      <main>
        {finished || !task ? (
          <section className="panel done" aria-labelledby="done-heading">
            <h2 id="done-heading">Демонстрационные Задания пройдены</h2>
            <p>
              Дальше здесь появится Курс из Модулей с Теорией, Вопросами и Схема-заданиями —
              каркас уже готов их принимать.
            </p>
            <button type="button" className="button-primary" onClick={restart}>
              Пройти ещё раз
            </button>
          </section>
        ) : task.kind === 'choice-question' ? (
          <QuestionScreen
            question={task}
            evaluation={
              evaluation !== null && evaluation.kind === 'choice-question' ? evaluation : null
            }
            onAnswer={(choiceId) =>
              answerCurrent({ kind: 'choice-answer', chosenChoiceId: choiceId })
            }
            onNext={goNext}
          />
        ) : (
          <NumericQuestionScreen
            question={task}
            evaluation={
              evaluation !== null && evaluation.kind === 'numeric-question' ? evaluation : null
            }
            onAnswer={answerCurrent}
            onNext={goNext}
          />
        )}
      </main>
    </div>
  );
}
