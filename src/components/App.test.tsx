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

    // Прогресс по каждому Модулю: в М1 и М2 по два Задания
    expect(screen.getAllByText('Заданий пройдено: 0 из 2')).toHaveLength(2);

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

describe('Схема-задание в потоке Курса', () => {
  it('М1 пройдена → М2: Теория, Вопрос и Схема-задание с «Проверить» — Курс завершается', async () => {
    const user = userEvent.setup();
    render(<App />);

    // закрываем М1
    await enterModule1Tasks(user);
    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '0,01');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'К списку Модулей' }));

    // М2 открылась
    await user.click(screen.getByRole('button', { name: 'Начать' }));

    // витрина Схема-задания проходит: батарея, выключатель, лампочка
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
    await user.click(screen.getByRole('button', { name: 'Ток прекращается' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));

    // разомкнуто — не пройдено; замыкаем — пройдено
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Выключатель 2' }));
    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
  });
});

describe('Стандарт обозначений между сессиями', () => {
  it('выбор ANSI в Задании сохраняется, переживает перезагрузку и применяется к следующему Заданию', async () => {
    // М1 закрыта заранее — сразу к Схема-заданию М2
    window.localStorage.setItem(
      'electronics-trainer.progress.v1',
      JSON.stringify({ taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'passed' } }),
    );
    const user = userEvent.setup();
    const firstRender = render(<App />);

    // М2: Теория → Вопрос → Схема-задание
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
    await user.click(screen.getByRole('button', { name: 'Ток прекращается' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // по умолчанию ГОСТ: батарея в Палитре — пластины, без круга
    const batterySymbol = () =>
      screen.getByRole('button', { name: 'Батарея' }).querySelector('svg.palette-symbol')!;
    expect(batterySymbol().querySelector('circle')).toBeNull();

    // переключение на ANSI — мгновенно, перерисовка прямо в Задании
    await user.selectOptions(screen.getByRole('combobox', { name: 'Обозначения' }), 'ansi');
    expect(batterySymbol().querySelector('circle')).not.toBeNull();
    expect(window.localStorage.getItem('electronics-trainer.symbol-standard.v1')).toBe('ansi');

    // «перезагрузка страницы»
    firstRender.unmount();
    render(<App />);

    // выбор стандарта применяется к следующему Заданию без переключателя
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
    expect(screen.getByRole('combobox', { name: 'Обозначения' })).toHaveValue('ansi');
    expect(batterySymbol().querySelector('circle')).not.toBeNull();
  });
});
