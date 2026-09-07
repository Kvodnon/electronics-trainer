import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { module1 } from '../content/m1';
import { parseBackup } from '../domain/backup';
import { stubDownload } from '../testing/fileDownload';
import {
  closeSwitch,
  enterModule1Tasks,
  passTheory,
  setResistance,
  wireDelayKey,
  wireForwardDiode,
  wireRing,
  wireTransistorKey,
} from '../testing/navigation';
// Курс, Теория и Прогресс — по настоящим данным приложения, домен не мокается.
// «Перезагрузка страницы» моделируется размонтированием и новым рендером App:
// Прогресс восстанавливается из localStorage. Скачивание файла перехватывает
// заглушка из src/testing — содержимое при этом настоящий Blob.

/** Ближайший заблокированный Модуль: с М3 в Курсе их несколько, тесты проверяют М2. */
const firstLockedButton = () => screen.getAllByRole('button', { name: 'Заблокирован' })[0];

/** Карточка Модуля на Экране Курса: Модули с одинаковым числом Заданий различаем по заголовку. */
const moduleCardOf = (title: string): HTMLElement => {
  const card = screen.getByRole('heading', { name: title }).closest('li');
  if (card === null) throw new Error(`нет карточки Модуля «${title}»`);
  return card;
};

/** Сеет Прогресс М1: все Задания пройдены, кроме перечисленных в except. */
function seedModule1Progress(except: readonly string[] = []): void {
  const taskStates = Object.fromEntries(
    module1.tasks
      .filter((task) => !except.includes(task.id))
      .map((task) => [task.id, 'passed']),
  );
  window.localStorage.setItem(
    'electronics-trainer.progress.v1',
    JSON.stringify({ taskStates }),
  );
}

/**
 * Отвечает на Вопросы М2 (диод, ток через диод, ток светодиода, цвет порога,
 * конденсатор, τ, темп τ, режим ключа, β транзистора, резистор базы, движок
 * потенциометра, порог зуммера, резистор зуммера) — очередь доходит до
 * Схема-заданий.
 */
async function passModule2Questions(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Светодиод не светится' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '15мА');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'Синий' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'Ток прекращается' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '1с');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'Вырастет в 4 раза' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'В насыщении: раскрыт до упора' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: /растёт неограниченно/ }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '4,5В');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'Тишину: ток ниже порога' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '100Ом');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
}

describe('Экран Курса', () => {
  it('показывает Модули с Прогрессом; следующий lockedButton', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Основы DC' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компоненты' })).toBeInTheDocument();

    // Прогресс по каждому Модулю: полный контент М1 — 22 Задания,
    // М2 — 20 (тикет 16), М4 — 20 (тикет 22); равные объёмы различаем по карточкам
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(within(moduleCardOf('Компоненты')).getByText('Заданий пройдено: 0 из 20')).toBeInTheDocument();
    expect(within(moduleCardOf('Переменный ток')).getByText('Заданий пройдено: 0 из 20')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    const lockedButton = firstLockedButton();
    expect(lockedButton).toBeDisabled();
    // все Модули после непройденной М1 держит она же — ближайшая незакрытая
    expect(screen.getAllByText('Откроется после Модуля «Основы DC»')).toHaveLength(3);
  });
});

describe('Теория перед Заданиями Модуля', () => {
  it('карточки идут по очереди; symbolFigures — в двух стандартах рядом', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));

    expect(screen.getByText('Теория · карточка 1 из 4')).toBeInTheDocument();
    expect(screen.getByText('Резистор')).toBeInTheDocument();
    expect(screen.getByText('Источник постоянного напряжения')).toBeInTheDocument();
    const symbolFigures = screen.getAllByRole('img', { name: /Обозначение: стандарт/ });
    expect(symbolFigures).toHaveLength(4);
    expect(screen.getAllByText('ГОСТ / IEC')).toHaveLength(2);
    expect(screen.getAllByText('ANSI')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Теория · карточка 2 из 4')).toBeInTheDocument();
    expect(screen.getByText('I = U / R')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
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

    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);

    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();
    expect(firstLockedButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 4);
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();
    expect(screen.queryByText(/удвоили напряжение источника/)).not.toBeInTheDocument();
  });
});

describe('Повтор ошибок внутри Модуля', () => {
  it('ошибленное Задание возвращается в конец очереди, очередь продолжается вперёд', async () => {
    const user = userEvent.setup();
    render(<App />);

    await enterModule1Tasks(user);

    expect(screen.getByTitle('Задание 1 — не начато')).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — не начато')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — откроется после остальных Заданий')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ток не изменится' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();
    expect(screen.getByText(/на повторении: 1/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 1 — на повторении')).toBeInTheDocument();

    // Второе закрыто верно с первой попытки → очередь продолжается третьим:
    // ошибленное первое вернётся только после всех не начатых Заданий
    await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '10мА');
    await user.click(screen.getByRole('button', { name: 'Ответить' }));
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText(/4,7 кОм/)).toBeInTheDocument();
    expect(screen.getByTitle('Задание 1 — на повторении')).toBeInTheDocument();
    expect(screen.getByTitle('Задание 2 — решено с первой попытки')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — откроется после остальных Заданий')).toBeInTheDocument();
  });
});

describe('Лестница Подсказок', () => {
  it('подсказка открывается по ступеням: наводящий вопрос, затем почти решение', async () => {
    const user = userEvent.setup();
    render(<App />);
    await enterModule1Tasks(user);

    expect(screen.queryByText(/числитель удваивается/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Подсказка' }));
    expect(screen.getByText(/числитель удваивается/)).toBeInTheDocument();
    expect(screen.queryByText(/Подставьте в I = U \/ R/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ещё подсказка' }));
    expect(screen.getByText(/Подставьте в I = U \/ R/)).toBeInTheDocument();

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
    const firstRender = render(<App />);
    await enterModule1Tasks(user);

    expect(screen.queryByText('Экзамен')).not.toBeInTheDocument();
    firstRender.unmount();

    seedModule1Progress(['m1-exam']);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 4);
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — не начато')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← К Модулям' }));
    expect(screen.getByText('Заданий пройдено: 21 из 22')).toBeInTheDocument();
    expect(firstLockedButton()).toBeDisabled();
  });

  it('неудачная проверка Экзамена портит «первую попытку», сдача завершает Модуль и открывает следующий', async () => {
    const user = userEvent.setup();
    seedModule1Progress(['m1-exam']);
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 4);

    expect(screen.getByText('Экзамен')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await wireRing(user, ['Батарея 1', 'Резистор 3', 'Лампочка 4', 'Выключатель 2']);
    await setResistance(user, 'Резистор 3', '60');

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();

    await closeSwitch(user, 'Выключатель 2');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
    expect(screen.getByText(/с первой попытки: 21/)).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — пройдено')).toBeInTheDocument();
    expect(screen.queryByTitle('Экзамен — решён с первой попытки')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'К списку Модулей' }));
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
  });
});

describe('Схема-задание в потоке Курса', () => {
  it('М1 сдана → М2: Теория, Вопросы, Схема-задания и Экзамен — Курс завершается', async () => {
    const user = userEvent.setup();
    seedModule1Progress();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await passTheory(user, 6);
    await passModule2Questions(user);

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));
    await wireForwardDiode(user, ['Батарея 1', 'Светодиод 3', 'Резистор 2']);
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Диод' }));
    await wireForwardDiode(user, ['Батарея 1', 'Диод 3', 'Резистор 2']);
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // «заряди конденсатор к сроку»: ключ сам замкнётся в t = 0,5 с,
    // резистор 19 кОм даёт τ = 1,9 с и ≈ 6,6 В к контрольному моменту t = 3 с
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    await wireRing(user, ['Батарея 1', 'Конденсатор 4', 'Резистор 3', 'Выключатель 2']);
    await setResistance(user, 'Резистор 3', '19кОм');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Постоянная времени RC-цепи/)).toBeInTheDocument();
    expect(screen.getByText(/в момент t = 3 с/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // «ключ на транзисторе»: кнопка с резистором — в базу, коллектор через второй
    // резистор и светодиод. Базу ограничиваем до 10 кОм (ток кнопки — «малый»),
    // замыкаем кнопку — насыщение, ток светодиода ≈ 14,6 мА
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Ключ' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Транзистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));
    await wireTransistorKey(user, [
      'Батарея 1',
      'Ключ 2',
      'Резистор 3',
      'Резистор 4',
      'Транзистор 5',
      'Светодиод 6',
    ]);
    await setResistance(user, 'Резистор 3', '10кОм');
    await closeSwitch(user, 'Ключ 2');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // «делитель с потенциометром»: концы на батарею, поворот движка на 60 % даёт 3,6 В
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Потенциометр' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Потенциометр 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 3: Потенциометр 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Потенциометр 2' }));
    fireEvent.change(screen.getByRole('slider', { name: /Положение движка/ }), { target: { value: '60' } });
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Напряжение на движке потенциометра/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // «зуммер»: резистор 100 Ом даёт ≈ 60 мА — выше порога звучания, в границах
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Зуммер' }));
    await wireRing(user, ['Батарея 1', 'Зуммер 3', 'Резистор 2']);
    await setResistance(user, 'Резистор 2', '100');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Зуммер звучит/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // Экзамен М2 — задержанное включение: кнопка через RC-цепь в базе
    // открывает транзистор со светодиодом. База 100 кОм даёт τ = 10 с:
    // в t = 1 с задержка ещё идёт, к t = 3 с светодиод уже горит (≈ 7 мА)
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Ключ' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Транзистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));
    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    await wireDelayKey(user, [
      'Батарея 1',
      'Ключ 2',
      'Резистор 3',
      'Резистор 4',
      'Транзистор 5',
      'Светодиод 6',
      'Конденсатор 7',
    ]);
    await setResistance(user, 'Резистор 3', '100кОм');
    await setResistance(user, 'Резистор 4', '1кОм');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    // контрольные моменты t = 1 с и t = 3 с — в измеренных проверках с числами
    expect(screen.getAllByText(/Постоянная времени RC-цепи/)).toHaveLength(2);
    expect(screen.getAllByText(/в момент t = 1 с/)).toHaveLength(1);
    expect(screen.getAllByText(/в момент t = 3 с/)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Модуль пройден')).toBeInTheDocument();
  });
});

describe('Стандарт обозначений между сессиями', () => {
  it('выбор ANSI в Задании сохраняется, переживает перезагрузку и применяется к следующему Заданию', async () => {
    seedModule1Progress();
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await passTheory(user, 6);
    await passModule2Questions(user);

    // по умолчанию ГОСТ: батарея в Палитре — пластины, без круга
    const batterySymbol = () =>
      screen.getByRole('button', { name: 'Батарея' }).querySelector('svg.palette-symbol')!;
    expect(batterySymbol().querySelector('circle')).toBeNull();

    // переключение на ANSI — мгновенно, перерисовка прямо в Задании
    await user.selectOptions(screen.getByRole('combobox', { name: 'Обозначения' }), 'ansi');
    expect(batterySymbol().querySelector('circle')).not.toBeNull();
    expect(window.localStorage.getItem('electronics-trainer.symbol-standard.v1')).toBe('ansi');

    firstRender.unmount();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 6);
    expect(screen.getByRole('combobox', { name: 'Обозначения' })).toHaveValue('ansi');
    expect(batterySymbol().querySelector('circle')).not.toBeNull();
  });
});

describe('Песочница', () => {
  it('открывается из главного меню, схемы переживают перезагрузку страницы', async () => {
    window.localStorage.removeItem('electronics-trainer.sandbox.v1');
    const user = userEvent.setup();
    const firstRender = render(<App />);

    expect(screen.getByRole('heading', { name: 'Песочница' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(screen.getByRole('button', { name: 'Моторчик' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Диод' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Светодиод' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Конденсатор' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await wireRing(user, ['Батарея 1', 'Лампочка 2']);
    await user.type(screen.getByRole('textbox', { name: 'Название схемы' }), 'Кольцо');
    await user.click(screen.getByRole('button', { name: 'Сохранить схему' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(screen.getByText('Кольцо')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Загрузить «Кольцо»' }));

    expect(screen.getByRole('button', { name: 'Батарея 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Лампочка 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();
    expect(document.querySelector('.symbol-lamp-glow')).not.toBeNull();
  });

  it('выход возвращает в главное меню, Прогресс Курса не тронут', async () => {
    window.localStorage.removeItem('electronics-trainer.sandbox.v1');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    await user.click(screen.getByRole('button', { name: '← К Курсу' }));

    expect(screen.getByRole('heading', { name: 'Основы DC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    expect(firstLockedButton()).toBeDisabled();
  });
});

function backupFile(content: string): File {
  return new File([content], 'electronics-trainer-backup.json', { type: 'application/json' });
}

/** Прогресс с попыткой на повторе и одна схема Песочницы — состояние для переноса. */
function seedProgressAndCircuit() {
  window.localStorage.setItem(
    'electronics-trainer.progress.v1',
    JSON.stringify({
      taskStates: { 'm1-ohm-01': 'passed', 'm1-ohm-02': 'returned-for-retry' },
      failedOnce: { 'm1-ohm-02': true },
    }),
  );
  window.localStorage.setItem(
    'electronics-trainer.sandbox.v1',
    JSON.stringify([
      {
        id: 's1',
        name: 'Кольцо',
        canvas: {
          components: [{ id: 'c1', kind: 'battery', x: 100, y: 100, rotation: 0, voltage: 4.5 }],
          wires: [],
        },
      },
    ]),
  );
}

describe('Данные: экспорт, импорт и сброс', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('экспорт скачивает файл с Прогрессом и схемами Песочницы', async () => {
    seedProgressAndCircuit();
    const user = userEvent.setup();
    render(<App />);
    const download = stubDownload();

    await user.click(screen.getByRole('button', { name: 'Экспорт в файл' }));
    download.restore();

    expect(download.files).toHaveLength(1);
    expect(download.files[0].name).toBe('electronics-trainer-backup.json');
    const parsed = parseBackup(await download.files[0].text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.progress.taskStates).toEqual({
      'm1-ohm-01': 'passed',
      'm1-ohm-02': 'returned-for-retry',
    });
    expect(parsed.data.progress.failedOnce).toEqual({ 'm1-ohm-02': true });
    expect(parsed.data.circuits.map((circuit) => circuit.name)).toEqual(['Кольцо']);
  });

  it('импорт после «переустановки» восстанавливает Прогресс и схемы', async () => {
    seedProgressAndCircuit();
    const user = userEvent.setup();
    const firstRender = render(<App />);
    const download = stubDownload();
    await user.click(screen.getByRole('button', { name: 'Экспорт в файл' }));
    download.restore();
    const content = await download.files[0].text;
    firstRender.unmount();

    window.localStorage.clear();
    const secondRender = render(<App />);
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(within(moduleCardOf('Переменный ток')).getByText('Заданий пройдено: 0 из 20')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile(content));
    expect(await screen.findByRole('status')).toHaveTextContent('восстановлены');

    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled();
    expect(firstLockedButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();
    secondRender.unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();
  });

  it('битый файл отклоняется с объяснением, текущие данные не тронуты', async () => {
    seedProgressAndCircuit();
    const user = userEvent.setup();
    render(<App />);

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile('{не json'));
    expect(await screen.findByRole('alert')).toHaveTextContent('не удаётся прочитать JSON');

    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();
  });

  it('чужой файл отклоняется: приложение называет причину', async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.upload(
      screen.getByLabelText('Файл импорта'),
      backupFile(JSON.stringify({ hello: 'мир' })),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('не файл Тренажёра');
  });

  it('«Начать заново» стирает Прогресс после подтверждения, схемы остаются', async () => {
    seedProgressAndCircuit();
    const user = userEvent.setup();
    const firstRender = render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByText(/Удалить весь Прогресс/)).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    await user.click(screen.getByRole('button', { name: 'Да, начать заново' }));
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(within(moduleCardOf('Переменный ток')).getByText('Заданий пройдено: 0 из 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    expect(firstLockedButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(within(moduleCardOf('Переменный ток')).getByText('Заданий пройдено: 0 из 20')).toBeInTheDocument();
  });
});
