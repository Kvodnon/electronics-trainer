import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NumericQuestionScreen } from './NumericQuestionScreen';
import { demoNumericQuestion } from '../content/demo';
import { evaluate, evaluationOfKind } from '../domain/evaluate';
import type { NumericAnswer } from '../domain/evaluate';

// Тест идёт по потоку числового Вопроса: ввод → вердикт → решение/Разбор.
// Домен не мокается, используются настоящие данные приложения.

/** Экран с настоящим Заданием и подключённым состоянием Ответа. */
function ЭкранВопроса() {
  const [answer, setAnswer] = useState<NumericAnswer | null>(null);
  const [пройден, setПройден] = useState(false);
  const evaluation = answer ? evaluate(demoNumericQuestion, answer) : null;
  if (пройден) return <p>Вопрос завершён</p>;
  return (
    <NumericQuestionScreen
      question={demoNumericQuestion}
      evaluation={evaluationOfKind(evaluation, 'numeric-question')}
      onAnswer={setAnswer}
      onNext={() => setПройден(true)}
    />
  );
}

async function ответить(user: ReturnType<typeof userEvent.setup>, текст: string) {
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), текст);
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
}

describe('Числовой Вопрос: поток от ввода до перехода дальше', () => {
  it('мусор отклоняется с понятным сообщением, попытка не сжигается', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);

    await ответить(user, 'абракадабра');

    const ошибка = screen.getByRole('alert');
    expect(ошибка).toHaveTextContent(/не удалось прочитать число/i);
    expect(screen.queryByText('Неверно')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Ответ' })).toBeEnabled();

    // После отклонённого ввода ученик всё ещё может ответить — и ответ принимается
    await user.clear(screen.getByRole('textbox', { name: 'Ответ' }));
    await ответить(user, '10мА');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('неизвестный суффикс — сообщение называет его и допустимые единицы', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);

    await ответить(user, '10кг');

    expect(screen.getByRole('alert')).toHaveTextContent('кг');
    expect(screen.getByRole('alert')).toHaveTextContent('мА');
  });

  it('«0,01» — верный ответ', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);
    await ответить(user, '0,01');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('«10мА» — тот же верный ответ в другой записи', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);
    await ответить(user, '10мА');
    expect(screen.getByText('Верно')).toBeInTheDocument();
  });

  it('верный ответ → подтверждающий Разбор, «Дальше» завершает Вопрос', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);

    await ответить(user, '10 мА');

    expect(screen.getByText('Верно')).toBeInTheDocument();
    const разбор = screen.getByRole('region', { name: 'Разбор' });
    expect(разбор).toHaveTextContent(/I = U \/ R/);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос завершён')).toBeInTheDocument();
  });

  it('неверный ответ → принятый диапазон и пошаговое решение', async () => {
    const user = userEvent.setup();
    render(<ЭкранВопроса />);

    await ответить(user, '1');

    expect(screen.getByText('Неверно')).toBeInTheDocument();
    // Вердикт называет, что именно принималось
    expect(screen.getByRole('status')).toHaveTextContent('9,5 мА');
    expect(screen.getByRole('status')).toHaveTextContent('10,5 мА');

    const решение = screen.getByRole('region', { name: 'Пошаговое решение' });
    const шаги = within(решение).getAllByRole('listitem');
    expect(шаги).toHaveLength(4);
    expect(шаги[0]).toHaveTextContent('закон Ома');

    // После вердикта ввод заблокирован — Разбор раскрыт
    expect(screen.getByRole('textbox', { name: 'Ответ' })).toBeDisabled();
  });
});
