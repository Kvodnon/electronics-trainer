import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import {
  closeSwitch,
  enterModule1Tasks,
  setResistance,
  wireRing,
} from '../testing/navigation';

// Курс, Теория и Прогресс — по настоящим данным приложения, домен не мокается.
// «Перезагрузка страницы» моделируется размонтированием и новым рендером App:
// Прогресс восстанавливается из localStorage.

describe('Экран Курса', () => {
  it('показывает Модули с Прогрессом; следующий lockedButton', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Основы DC' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компоненты' })).toBeInTheDocument();

    // Прогресс по каждому Модулю: в М1 — Вопрос, Вопрос и Экзамен, в М2 — так же
    expect(screen.getAllByText('Заданий пройдено: 0 из 3')).toHaveLength(2);

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
    expect(screen.getByText('Заданий пройдено: 1 из 3')).toBeInTheDocument();
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
  it('ошибленное Задание возвращается в конце, следующее идёт вперёд, Экзамен открывается последним', async () => {
    const user = userEvent.setup();
    render(<App />);

    await enterModule1Tasks(user);

    // Внутри Модуля видно состояние каждого Задания; Экзамен пока закрыт
    expect(screen.getByTitle('Задание 1 — не начато')).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — не начато')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — откроется после остальных Заданий')).toBeInTheDocument();

    // Ошибка в первом Задании → оно уходит на повтор, вперёд идёт второе
    await user.click(screen.getByRole('button', { name: 'Ток не изменится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();
    expect(screen.getByText(/на повторении: 1/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 1 — на повторении')).toBeInTheDocument();

    // Второе закрыто верно с первой попытки → очередь возвращается к первому
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText(/удвоили напряжение источника/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — решено с первой попытки')).toBeInTheDocument();
    expect(screen.getByText(/с первой попытки: 1/)).toBeInTheDocument();

    // Первое решено со второй попытки → в Модуле остаётся только Экзамен
    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(screen.getByTitle('Задание 1 — пройдено')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — не начато')).toBeInTheDocument();
  });
});

describe('Лестница Подсказок', () => {
  it('подсказка открывается по ступеням: наводящий вопрос, затем почти решение', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterModule1Tasks(user);

    // До запроса ступеней нет
    expect(screen.queryByText(/числитель удваивается/)).not.toBeInTheDocument();

    // Ступень 1 — наводящий вопрос
    await user.click(screen.getByRole('button', { name: 'Подсказка' }));
    expect(screen.getByText(/числитель удваивается/)).toBeInTheDocument();
    expect(screen.queryByText(/Подставьте в I = U \/ R/)).not.toBeInTheDocument();

    // Ступень 2 — почти решение
    await user.click(screen.getByRole('button', { name: 'Ещё подсказка' }));
    expect(screen.getByText(/Подставьте в I = U \/ R/)).toBeInTheDocument();

    // Обе ступени на месте — готовый ответ не выдаётся и на второй
    expect(screen.getByText(/числитель удваивается/)).toBeInTheDocument();
  });

  it('подсказки доступны и в числовом Вопросе', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterModule1Tasks(user);

    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Подсказка' }));
    expect(screen.getByText(/формула связывает ток/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ещё подсказка' }));
    expect(screen.getByText(/Разделите напряжение на сопротивление/)).toBeInTheDocument();
  });
});

describe('Экзамен Модуля', () => {
  it('экзамен закрыт, пока не закрыты остальные Задания, и открывается последним', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterModule1Tasks(user);

    // Пока Вопросы не пройдены, экзамен в очереди не показывается вовсе
    expect(screen.queryByText('Экзамен')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // Все остальные Задания закрыты — экзамен открылся последним
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — не начато')).toBeInTheDocument();

    // Экзамен не сдан — Модуль не завершён: М2 всё ещё заблокирована
    await user.click(screen.getByRole('button', { name: '← К Модулям' }));
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();
  });

  it('неудачная проверка Экзамена портит «первую попытку», сдача завершает Модуль и открывает следующий', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Оба Вопроса М1 — верно, с первой попытки
    await enterModule1Tasks(user);
    await user.click(screen.getByRole('button', { name: 'Ток удвоится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // Экзамен — финальное Схема-задание Модуля
    expect(screen.getByText('Экзамен')).toBeInTheDocument();

    // Контур: батарея, выключатель, резистор 60 Ом, лампочка (ток 50 мА)
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await wireRing(user, ['Батарея 1', 'Резистор 3', 'Лампочка 4', 'Выключатель 2']);
    await setResistance(user, 'Резистор 3', '60');

    // Разомкнутый выключатель — неудачная проверка: «с первой попытки» сорвана
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();

    await closeSwitch(user, 'Выключатель 2');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();

    // Экзамен сдан — Модуль завершён, следующий открыт
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
    expect(screen.getByText(/с первой попытки: 2/)).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — пройдено')).toBeInTheDocument();
    expect(screen.queryByTitle('Экзамен — решён с первой попытки')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'К списку Модулей' }));
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
  });
});

describe('Схема-задание в потоке Курса', () => {
  it('М1 сдана → М2: Теория, Вопрос, Схема-задание и Экзамен — Курс завершается', async () => {
    const user = userEvent.setup();
    // М1 закрыта заранее — сразу к М2
    window.localStorage.setItem(
      'electronics-trainer.progress.v1',
      JSON.stringify({
        taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'passed', 'm1-exam': 'passed' },
      }),
    );
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));

    // Вопрос М2
    await user.click(screen.getByRole('button', { name: 'Ток прекращается' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // витрина Схема-задания: батарея, выключатель, лампочка
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await wireRing(user, ['Батарея 1', 'Выключатель 2', 'Лампочка 3']);

    // разомкнуто — не пройдено; замыкаем — пройдено
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    await closeSwitch(user, 'Выключатель 2');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // Экзамен М2 — моторчик должен крутиться при токе 60–100 мА
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Моторчик' }));
    await wireRing(user, ['Батарея 1', 'Резистор 3', 'Моторчик 4', 'Выключатель 2']);
    await setResistance(user, 'Резистор 3', '50');
    await closeSwitch(user, 'Выключатель 2');
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
      JSON.stringify({
        taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'passed', 'm1-exam': 'passed' },
      }),
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
