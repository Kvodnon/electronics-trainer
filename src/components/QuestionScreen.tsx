import type { ReactNode } from 'react';
import { HintLadder } from './HintLadder';
import { Verdict } from './Verdict';
import type { ChoiceQuestionEvaluation } from '../domain/evaluate';
import type { ChoiceQuestion } from '../domain/task';

type ChipTone = 'correct' | 'incorrect' | 'chosen';

function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

interface QuestionScreenProps {
  question: ChoiceQuestion;
  evaluation: ChoiceQuestionEvaluation | null;
  onAnswer: (choiceId: string) => void;
  onNext: () => void;
}

/**
 * Экран Вопроса с выбором варианта: тонкий слой над доменом —
 * рендерит Задание и вердикт `evaluate`, вся логика проверки в домене.
 */
export function QuestionScreen({ question, evaluation, onAnswer, onNext }: QuestionScreenProps) {
  const answered = evaluation !== null;
  const reviewByChoice = new Map(evaluation?.reviews.map((r) => [r.choiceId, r]) ?? []);
  const correctReview = evaluation?.reviews.find((r) => r.isCorrect) ?? null;

  return (
    <section className="panel question" aria-labelledby="question-prompt">
      <p className="question-kind">Вопрос с выбором варианта</p>
      <h2 id="question-prompt" className="question-prompt">
        {question.prompt}
      </h2>

      <ul className="choices">
        {question.choices.map((choice) => {
          const review = reviewByChoice.get(choice.id);
          const isChosen = choice.id === evaluation?.chosenChoiceId;
          const state = !answered
            ? 'idle'
            : isChosen && review?.isCorrect
              ? 'chosen-correct'
              : isChosen
                ? 'chosen-incorrect'
                : review?.isCorrect
                  ? 'revealed-correct'
                  : 'muted';
          return (
            <li key={choice.id}>
              <button
                type="button"
                className={`choice choice-${state}`}
                disabled={answered}
                onClick={() => onAnswer(choice.id)}
              >
                <span className="choice-text">{choice.text}</span>
                {answered && isChosen && <Chip tone="chosen">ваш ответ</Chip>}
                {answered && review && (
                  <Chip tone={review.isCorrect ? 'correct' : 'incorrect'}>
                    {review.isCorrect ? 'верно' : 'неверно'}
                  </Chip>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!answered && question.hints && <HintLadder hints={question.hints} />}

      {evaluation && (
        <>
          <Verdict outcome={evaluation.outcome}>
            {evaluation.outcome === 'incorrect' && correctReview && (
              <span className="verdict-correct-answer">
                Правильный ответ: {correctReview.text}
              </span>
            )}
          </Verdict>

          <section className="reviews" aria-labelledby="reviews-heading">
            <h3 id="reviews-heading">Разборы</h3>
            <ul>
              {evaluation.reviews.map((review) => (
                <li
                  key={review.choiceId}
                  className={`review review-${review.isCorrect ? 'correct' : 'incorrect'} ${
                    review.choiceId === evaluation.chosenChoiceId ? 'review-chosen' : ''
                  }`}
                >
                  <div className="review-head">
                    <Chip tone={review.isCorrect ? 'correct' : 'incorrect'}>
                      {review.isCorrect ? 'верно' : 'неверно'}
                    </Chip>
                    <h4 className="review-choice">{review.text}</h4>
                    {review.choiceId === evaluation.chosenChoiceId && (
                      <Chip tone="chosen">ваш ответ</Chip>
                    )}
                  </div>
                  <p className="review-explanation">{review.razbor}</p>
                </li>
              ))}
            </ul>
          </section>

          <button type="button" className="button-primary" onClick={onNext}>
            Дальше
          </button>
        </>
      )}
    </section>
  );
}
