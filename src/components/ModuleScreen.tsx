import { useState } from 'react';
import { ComponentSymbol } from './ComponentSymbol';
import { ModuleProgressLine, taskStateName } from './ModuleProgressLine';
import { NumericQuestionScreen } from './NumericQuestionScreen';
import { QuestionScreen } from './QuestionScreen';
import { CircuitTaskScreen } from './canvas/CircuitTaskScreen';
import { evaluate, evaluationOfKind } from '../domain/evaluate';
import {
  isExamTask,
  isExamUnlocked,
  moduleProgressOf,
  moduleTaskQueue,
  solvedOnFirstAttemptOf,
  taskStateOf,
} from '../domain/course';
import type { Answer } from '../domain/evaluate';
import type { CourseAction, CourseModule, CourseProgress, TaskState, TheoryCard } from '../domain/course';
import type { SymbolStandard } from '../domain/symbols';

interface ModuleScreenProps {
  module: CourseModule;
  progress: CourseProgress;
  /** Стандарт обозначений Схема-заданий: живёт в App, сохраняется между сессиями. */
  symbolStandard: SymbolStandard;
  onSymbolStandardChange: (standard: SymbolStandard) => void;
  onProgressAction: (action: CourseAction) => void;
  onExit: () => void;
}

/**
 * Экран Модуля: сначала карточки Теории, затем Задания по очереди.
 * Текущее Задание — первое в очереди `moduleTaskQueue` (не начатые вперёд,
 * вернувшиеся на повтор — в конец); пустая очередь — Модуль завершён.
 */
export function ModuleScreen({
  module,
  progress,
  symbolStandard,
  onSymbolStandardChange,
  onProgressAction,
  onExit,
}: ModuleScreenProps) {
  const [phase, setPhase] = useState<'theory' | 'tasks'>(module.theory.length > 0 ? 'theory' : 'tasks');
  const [cardIndex, setCardIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Растёт на каждый «Дальше»: экран Вопроса монтируется заново даже когда
  // то же Задание вернулось на повтор — поле ввода очищается.
  const [step, setStep] = useState(0);

  const moduleProgress = moduleProgressOf(module, progress);
  const queue = moduleTaskQueue(module, progress);
  const currentTask = queue[0];
  const evaluation = currentTask && answer ? evaluate(currentTask, answer) : null;

  function goNext() {
    if (!currentTask) return;
    onProgressAction({
      type: evaluation?.outcome === 'correct' ? 'task-passed' : 'task-returned-for-retry',
      taskId: currentTask.id,
    });
    setAnswer(null);
    setStep((n) => n + 1);
  }

  function handleAnswer(answer: Answer) {
    if (!currentTask) return;
    // Схема-задание проверяется на месте и ученика не выпускает: неудачная
    // проверка — только отметка о попытке в Прогрессе («с первой попытки»
    // сорвана), очередь не меняется. Вопросы уходят по «Дальше» — там
    // общее правило возвращения на повтор.
    if (
      currentTask.kind === 'circuit-task' &&
      evaluate(currentTask, answer).outcome !== 'correct'
    ) {
      onProgressAction({ type: 'attempt-failed', taskId: currentTask.id });
    }
    setAnswer(answer);
  }

  return (
    <div className="module-screen">
      <header className="module-header">
        <button type="button" className="link-back" onClick={onExit}>
          ← К Модулям
        </button>
        <h2 className="module-header-title">{module.title}</h2>
        <div className="module-header-state">
          <ModuleProgressLine progress={moduleProgress} />
          <ul className="task-progress" aria-label="Состояние Заданий Модуля">
            {module.tasks.map((moduleTask, index) => {
              const state = taskStateOf(progress, moduleTask.id);
              const exam = isExamTask(moduleTask);
              const firstAttempt = solvedOnFirstAttemptOf(progress, moduleTask.id);
              // Закрытый экзамен — «не начат», но виден как закрытый
              const examLocked =
                exam && !isExamUnlocked(module, progress) && state === 'not-started';
              return (
                <li
                  key={moduleTask.id}
                  className={
                    [
                      'task-dot',
                      `task-dot-${state}`,
                      firstAttempt ? 'task-dot-first-attempt' : '',
                      exam ? 'task-dot-exam' : '',
                      examLocked ? 'task-dot-exam-locked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  title={taskDotTitle(index, state, { exam, examLocked, firstAttempt })}
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
      ) : currentTask ? (
        currentTask.kind === 'choice-question' ? (
          <QuestionScreen
            key={`${currentTask.id}:${step}`}
            question={currentTask}
            evaluation={evaluationOfKind(evaluation, 'choice-question')}
            onAnswer={(choiceId) =>
              handleAnswer({ kind: 'choice-answer', chosenChoiceId: choiceId })
            }
            onNext={goNext}
          />
        ) : currentTask.kind === 'numeric-question' ? (
          <NumericQuestionScreen
            key={`${currentTask.id}:${step}`}
            question={currentTask}
            evaluation={evaluationOfKind(evaluation, 'numeric-question')}
            onAnswer={handleAnswer}
            onNext={goNext}
          />
        ) : (
          <CircuitTaskScreen
            key={`${currentTask.id}:${step}`}
            task={currentTask}
            evaluation={evaluationOfKind(evaluation, 'circuit-task')}
            onAnswer={handleAnswer}
            onNext={goNext}
            symbolStandard={symbolStandard}
            onSymbolStandardChange={onSymbolStandardChange}
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

/**
 * Подпись точки состояния Задания: обычное Задание или Экзамен. У Экзамена
 * свой род («решён»), у решённого с первой попытки — своя пометка вместо
 * обычного состояния.
 */
function taskDotTitle(
  index: number,
  state: TaskState,
  flags: { exam: boolean; examLocked: boolean; firstAttempt: boolean },
): string {
  if (flags.examLocked) return 'Экзамен — откроется после остальных Заданий';
  const name = flags.exam ? 'Экзамен' : `Задание ${index + 1}`;
  if (flags.firstAttempt) {
    return flags.exam ? `${name} — решён с первой попытки` : `${name} — решено с первой попытки`;
  }
  return `${name} — ${taskStateName(state)}`;
}

/** Карточка Теории: текст, формулы и обозначения двух стандартов рядом. */
function TheoryCardView({ card, position, onNextCard, onFinish }: TheoryCardViewProps) {
  const isLastCard = position.index + 1 >= position.total;
  return (
    <section className="panel theory" aria-labelledby="theory-title">
      <p className="question-kind">
        Теория · карточка {position.index + 1} из {position.total}
      </p>
      <h2 id="theory-title" className="theory-title">
        {card.title}
      </h2>

      {card.paragraphs.map((paragraph) => (
        <p key={paragraph} className="theory-paragraph">
          {paragraph}
        </p>
      ))}

      {card.formulas?.map((formula) => (
        <p key={formula.text} className="theory-formula">
          <code className="formula-expression">{formula.text}</code>
          {formula.caption && <span className="formula-caption">{formula.caption}</span>}
        </p>
      ))}

      {card.symbols?.map((id) => (
        <ComponentSymbol key={id} id={id} />
      ))}

      <button type="button" className="button-primary" onClick={isLastCard ? onFinish : onNextCard}>
        {isLastCard ? 'К Заданиям' : 'Дальше'}
      </button>
    </section>
  );
}
