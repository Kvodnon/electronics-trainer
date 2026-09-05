import { useState } from 'react';
import { ComponentSymbol } from './ComponentSymbol';
import { ModuleProgressLine, taskStateName } from './ModuleProgressLine';
import { NumericQuestionScreen } from './NumericQuestionScreen';
import { QuestionScreen } from './QuestionScreen';
import { evaluate, evaluationOfKind } from '../domain/evaluate';
import { moduleProgressOf, moduleTaskQueue, taskStateOf } from '../domain/course';
import type { Answer } from '../domain/evaluate';
import type { CourseAction, CourseModule, CourseProgress, TheoryCard } from '../domain/course';

interface ModuleScreenProps {
  module: CourseModule;
  progress: CourseProgress;
  onProgressAction: (action: CourseAction) => void;
  onExit: () => void;
}

/**
 * Экран Модуля: сначала карточки Теории, затем Задания по очереди.
 * Текущее Задание — первое в очереди `moduleTaskQueue` (не начатые вперёд,
 * вернувшиеся на повтор — в конец); очередь пуста — Модуль завершён.
 */
export function ModuleScreen({
  module,
  progress,
  onProgressAction,
  onExit,
}: ModuleScreenProps) {
  const [phase, setPhase] = useState<'theory' | 'tasks'>(module.theory.length > 0 ? 'theory' : 'tasks');
  const [cardIndex, setCardIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Растёт на каждый «Дальше»: экран Вопроса монтируется заново даже когда
  // то же Задание вернулось на повтор — поле ввода очищается.
  const [step, setStep] = useState(0);

  const итог = moduleProgressOf(module, progress);
  const очередь = moduleTaskQueue(module, progress);
  const задание = очередь[0];
  const evaluation = задание && answer ? evaluate(задание, answer) : null;

  function идёмДальше() {
    if (!задание) return;
    onProgressAction({
      type: evaluation?.outcome === 'correct' ? 'task-passed' : 'task-returned-for-retry',
      taskId: задание.id,
    });
    setAnswer(null);
    setStep((номер) => номер + 1);
  }

  return (
    <div className="module-screen">
      <header className="module-header">
        <button type="button" className="link-back" onClick={onExit}>
          ← К Модулям
        </button>
        <h2 className="module-header-title">{module.title}</h2>
        <div className="module-header-state">
          <ModuleProgressLine progress={итог} />
          <ul className="task-progress" aria-label="Состояние Заданий Модуля">
            {module.tasks.map((заданиеМодуля, index) => {
              const state = taskStateOf(progress, заданиеМодуля.id);
              return (
                <li
                  key={заданиеМодуля.id}
                  className={`task-dot task-dot-${state}`}
                  title={`Задание ${index + 1} — ${taskStateName(state)}`}
                />
              );
            })}
          </ul>
        </div>
      </header>

      {phase === 'theory' ? (
        <TheoryCardView
          card={module.theory[cardIndex]}
          position={{ index: cardIndex, total: module.theory.length }}
          onFinish={() => setPhase('tasks')}
          onNextCard={() => setCardIndex((index) => index + 1)}
        />
      ) : задание ? (
        задание.kind === 'choice-question' ? (
          <QuestionScreen
            key={`${задание.id}:${step}`}
            question={задание}
            evaluation={evaluationOfKind(evaluation, 'choice-question')}
            onAnswer={(choiceId) => setAnswer({ kind: 'choice-answer', chosenChoiceId: choiceId })}
            onNext={идёмДальше}
          />
        ) : (
          <NumericQuestionScreen
            key={`${задание.id}:${step}`}
            question={задание}
            evaluation={evaluationOfKind(evaluation, 'numeric-question')}
            onAnswer={setAnswer}
            onNext={идёмДальше}
          />
        )
      ) : (
        <section className="panel done" aria-labelledby="module-done-heading">
          <h2 id="module-done-heading">Модуль пройден</h2>
          <p>
            Все Задания Модуля «{module.title}» закрыты — следующий Модуль Курса открыт.
            Загляните в него или вернитесь сюда, чтобы повторить Теорию и Задания.
          </p>
          <button type="button" className="button-primary" onClick={onExit}>
            К списку Модулей
          </button>
        </section>
      )}
    </div>
  );
}

interface TheoryCardViewProps {
  card: TheoryCard;
  position: { index: number; total: number };
  onNextCard: () => void;
  onFinish: () => void;
}

/** Карточка Теории: текст, формулы и обозначения двух стандартов рядом. */
function TheoryCardView({ card, position, onNextCard, onFinish }: TheoryCardViewProps) {
  const последняя = position.index + 1 >= position.total;
  return (
    <section className="panel theory" aria-labelledby="theory-title">
      <p className="question-kind">
        Теория · карточка {position.index + 1} из {position.total}
      </p>
      <h2 id="theory-title" className="theory-title">
        {card.title}
      </h2>

      {card.paragraphs.map((абзац) => (
        <p key={абзац} className="theory-paragraph">
          {абзац}
        </p>
      ))}

      {card.formulas?.map((формула) => (
        <p key={формула.text} className="theory-formula">
          <code className="formula-expression">{формула.text}</code>
          {формула.caption && <span className="formula-caption">{формула.caption}</span>}
        </p>
      ))}

      {card.symbols?.map((id) => (
        <ComponentSymbol key={id} id={id} />
      ))}

      <button type="button" className="button-primary" onClick={последняя ? onFinish : onNextCard}>
        {последняя ? 'К Заданиям' : 'Дальше'}
      </button>
    </section>
  );
}
