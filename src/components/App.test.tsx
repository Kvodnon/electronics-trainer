import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { enterModule1Tasks } from '../testing/navigation';

// Курс, Теория и Прогресс — по настоящим данным приложения, домен не мокается.
// «Перезагрузка страницы» моделируется размонтированием и новым рендером App:
// Прогресс восстанавливается из localStorage.

describe('Экран Курса', () => {
  it('показывает Модули с Прогрессом; следующий lockedButton', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Основы DC' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компоненты' })).toBeInTheDocument();

    // Прогресс по каждому Модулю
    expect(screen.getByText('Заданий пройдено: 0 из 2')).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 0 из 1')).toBeInTheDocument();

    // М1 доступна, М2 заблокирована с подсказкой
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    const lockedButton = screen.getByRole('button', { name: 'Заблокирован' });
    expect(lockedButton).toBeDisabled();
    expect(screen.getByText('Откроется после Модуля «Основы DC»')).toBeInTheDocument();
  });
});

describe('Теория перед Заданиями Модуля', () => {
  it('карточки идут по очереди; symbolFigures — в двух стандартах рядом', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));

    // Первая карточка: два Компонента × два стандарта
    expect(screen.getByText('Теория · карточка 1 из 2')).toBeInTheDocument();
    expect(screen.getByText('Резистор')).toBeInTheDocument();
    expect(screen.getByText('Источник постоянного напряжения')).toBeInTheDocument();
    const symbolFigures = screen.getAllByRole('img', { name: /Обозначение: стандарт/ });
    expect(symbolFigures).toHaveLength(4);
    expect(screen.getAllByText('ГОСТ / IEC')).toHaveLength(2);
    expect(screen.getAllByText('ANSI')).toHaveLength(2);

    // Вторая карточка: формулы
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Теория · карточка 2 из 2')).toBeInTheDocument();
    expect(screen.getByText('I = U / R')).toBeInTheDocument();

    // Переход к Заданиям
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
    expect(screen.getByText(/удвоили напряжение источника/)).toBeInTheDocument();
  });
});

describe('Прогресс между сессиями', () => {
  it('перезагрузка страницы не теряет Прогресс: Курс и очередь Заданий на месте', async () => {
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await enterModule1Tasks(user);
    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // Первое Задание пройдено, на экране второе
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);

    // Курс помнит Прогресс М1; М2 всё ещё заблокирована
    expect(screen.getByText('Заданий пройдено: 1 из 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();

    // Очередь продолжается со второго Задания
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();
    expect(screen.queryByText(/удвоили напряжение источника/)).not.toBeInTheDocument();
  });
});

describe('Повтор ошибок внутри Модуля', () => {
  it('ошибленное Задание возвращается в конце, следующее идёт вперёд', async () => {
    const user = userEvent.setup();
    render(<App />);

    await enterModule1Tasks(user);

    // Внутри Модуля видно состояние каждого Задания
    expect(screen.getByTitle('Задание 1 — не начато')).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — не начато')).toBeInTheDocument();

    // Ошибка в первом Задании → оно уходит на повтор, вперёд идёт второе
    await user.click(screen.getByRole('button', { name: 'Ток не изменится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();
    expect(screen.getByText(/на повторении: 1/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 1 — на повторении')).toBeInTheDocument();

    // Второе закрыто верно → очередь возвращается к первому
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText(/удвоили напряжение источника/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — пройдено')).toBeInTheDocument();

    // Первое решено — Модуль завершён
    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
  });
});
