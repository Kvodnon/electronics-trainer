import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';

// Тест идёт по потоку Вопроса: ответ → Разбор → следующий.
// Домен не мокается, используются настоящие данные приложения.

describe('Вопрос с выбором варианта: поток от ответа до перехода дальше', () => {
  it('клик по неверному варианту → вердикт «Неверно» и Разбор к каждому варианту', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Ток уменьшится вдвое' }));

    expect(screen.getByText('Неверно')).toBeInTheDocument();
    expect(screen.getByText('Правильный ответ: Ток удвоится')).toBeInTheDocument();

    // Разбор к каждому варианту, не только к выбранному
    const секцияРазборов = screen.getByRole('region', { name: 'Разборы' });
    const разборы = within(секцияРазборов).getAllByRole('listitem');
    expect(разборы).toHaveLength(4);

    const разборУменьшится = разборы.find((элемент) =>
      within(элемент).queryByText('Ток уменьшится вдвое'),
    );
    expect(разборУменьшится).toBeDefined();
    expect(разборУменьшится!).toHaveTextContent(/пропорциональность перепутаны/);
    expect(разборУменьшится!).toHaveTextContent('ваш ответ');

    const разборУдвоится = разборы.find((элемент) =>
      within(элемент).queryByText('Ток удвоится'),
    );
    expect(разборУдвоится!).toHaveTextContent(/18 мА/);

    const разборНеИзменится = разборы.find((элемент) =>
      within(элемент).queryByText('Ток не изменится'),
    );
    expect(разборНеИзменится!).toHaveTextContent(/свойство самой цепи/);

    const разборВчетверо = разборы.find((элемент) =>
      within(элемент).queryByText('Ток увеличится вчетверо'),
    );
    expect(разборВчетверо!).toHaveTextContent(/P = U² \/ R/);
  });

  it('верный ответ → вердикт «Верно», «Дальше» ведёт к числовому Вопросу и далее к финалу', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));

    expect(screen.getByText('Верно')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    // Второе Задание последовательности — числовой Вопрос
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    expect(screen.getByText('Демонстрационные Задания пройдены')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));
    expect(screen.getByRole('button', { name: 'Ток удвоится' })).toBeEnabled();
    expect(screen.queryByText('Верно')).not.toBeInTheDocument();
  });
});
