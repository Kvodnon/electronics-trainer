import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NumericQuestionScreen } from './NumericQuestionScreen';
import { module1 } from '../content/m1';
import { evaluate, evaluationOfKind } from '../domain/evaluate';
import type { NumericAnswer } from '../domain/evaluate';
import type { NumericQuestion } from '../domain/task';

// Тест идёт по потоку числового Вопроса: ввод → вердикт → решение/Разбор.
// Домен не мокается, используются настоящие данные приложения.

/** Числовой Вопрос из настоящих данных М1; фикстура обязана его содержать. */
function numericQuestionOfModule1(): NumericQuestion {
  const found = module1.tasks.find(
    (task): task is NumericQuestion => task.kind === 'numeric-question',
  );
  if (!found) throw new Error('фикстура: в М1 ожидается числовой Вопрос');
  return found;
}

const question = numericQuestionOfModule1();

/** Экран с настоящим Заданием и подключённым состоянием Ответа. */
function QuestionScreenHarness() {
  const [answer, setAnswer] = useState<NumericAnswer | null>(null);
  const [finished, setFinished] = useState(false);
  const evaluation = answer ? evaluate(question, answer) : null;
  if (finished) return <p>Вопрос завершён</p>;
  return (
    <NumericQuestionScreen
      question={question}
      evaluation={evaluationOfKind(evaluation, 'numeric-question')}
      onAnswer={setAnswer}
      onNext={() => setFinished(true)}
    />
  );
}

async function submitAnswer(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), text);
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
}

describe('Числовой Вопрос: поток от ввода до перехода дальше', () => {
  it('мусор отклоняется с понятным сообщением, попытка не сжигается', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);

    await submitAnswer(user, 'абракадабра');

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent(/не удалось прочитать число/i);
    expect(screen.queryByText('Неверно')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ответ' })).toBeEnabled();

    // После отклонённого ввода ученик всё ещё может ответить — и ответ принимается
    await user.clear(screen.getByRole('textbox', { name: 'Ответ' }));
    await submitAnswer(user, '10мА');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('неизвестный суффикс — сообщение называет его и допустимые единицы', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);

    await submitAnswer(user, '10кг');

    expect(screen.getByRole('alert')).toHaveTextContent('кг');
    expect(screen.getByRole('alert')).toHaveTextContent('мА');
  });

  it('«0,01» — верный ответ', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);
    await submitAnswer(user, '0,01');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('«10мА» — тот же верный ответ в другой записи', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);
    await submitAnswer(user, '10мА');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('верный ответ → подтверждающий Разбор, «Дальше» завершает Вопрос', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);

    await submitAnswer(user, '10 мА');

    expect(screen.getByText('Верно')).toBeInTheDocument();
    const razbor = screen.getByRole('region', { name: 'Разбор' });
    expect(razbor).toHaveTextContent(/I = U \/ R/);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос завершён')).toBeInTheDocument();
  });

  it('неверный ответ → принятый диапазон и пошаговое решение', async () => {
    const user = userEvent.setup();
    render(<QuestionScreenHarness />);

    await submitAnswer(user, '1');

    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('9,5 мА');
    expect(screen.getByRole('status')).toHaveTextContent('10,5 мА');

    const solution = screen.getByRole('region', { name: 'Пошаговое решение' });
    const steps = within(solution).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('закон Ома');

    expect(screen.getByRole('textbox', { name: 'Ответ' })).toBeDisabled();
  });
});
