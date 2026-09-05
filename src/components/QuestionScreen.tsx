import type { ChoiceQuestionEvaluation } from '../domain/evaluate';
import type { ChoiceQuestion } from '../domain/task';

interface QuestionScreenProps {
  question: ChoiceQuestion;
  evaluation: ChoiceQuestionEvaluation | null;
  chosenChoiceId: string | null;
  onAnswer: (choiceId: string) => void;
  onNext: () => void;
}

/**
 * Экран Вопроса с выбором варианта: тонкий слой над доменом —
 * рендерит Задание и вердикт `evaluate`, вся логика проверки в домене.
 */
export function QuestionScreen({
  question,
  evaluation,
  chosenChoiceId,
  onAnswer,
  onNext,
}: QuestionScreenProps) {
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
          const isChosen = choice.id === chosenChoiceId;
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
                {answered && isChosen && <span className="chip chip-chosen">ваш ответ</span>}
                {answered && review && (
                  <span className={`chip ${review.isCorrect ? 'chip-correct' : 'chip-incorrect'}`}>
                    {review.isCorrect ? 'верно' : 'неверно'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && evaluation && (
        <>
          <p role="status" className={`verdict verdict-${evaluation.outcome}`}>
            <span className="verdict-word">
              {evaluation.outcome === 'correct' ? 'Верно' : 'Неверно'}
            </span>
            {evaluation.outcome === 'incorrect' && correctReview && (
              <span className="verdict-correct-answer">
                Правильный ответ: {correctReview.text}
              </span>
            )}
          </p>

          <section className="reviews" aria-labelledby="reviews-heading">
            <h3 id="reviews-heading">Разборы</h3>
            <ul>
              {evaluation.reviews.map((review) => (
                <li
                  key={review.choiceId}
                  className={`review review-${review.isCorrect ? 'correct' : 'incorrect'} ${
                    review.choiceId === chosenChoiceId ? 'review-chosen' : ''
                  }`}
                >
                  <div className="review-head">
                    <span
                      className={`chip ${review.isCorrect ? 'chip-correct' : 'chip-incorrect'}`}
                    >
                      {review.isCorrect ? 'верно' : 'неверно'}
                    </span>
                    <h4 className="review-choice">{review.text}</h4>
                    {review.choiceId === chosenChoiceId && (
                      <span className="chip chip-chosen">ваш ответ</span>
                    )}
                  </div>
                  <p className="review-explanation">{review.explanation}</p>
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
