import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { parseBackup } from '../domain/backup';
import { stubDownload } from '../testing/fileDownload';
import {
  closeSwitch,
  enterModule1Tasks,
  setResistance,
  wireRing,
} from '../testing/navigation';
// Курс, Теория и Прогресс — по настоящим данным приложения, домен не мокается.
// «Перезагрузка страницы» моделируется размонтированием и новым рендером App:
// Прогресс восстанавливается из localStorage. Скачивание файла перехватывает
// заглушка из src/testing — содержимое при этом настоящий Blob.

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

describe('Песочница', () => {
  it('открывается из главного меню, схемы переживают перезагрузку страницы', async () => {
    // изолируем хранилище схем от других тестов файла
    window.localStorage.removeItem('electronics-trainer.sandbox.v1');
    const user = userEvent.setup();
    const firstRender = render(<App />);

    // вход из главного меню — с самого начала Курса
    expect(screen.getByRole('heading', { name: 'Песочница' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    // Палитра по текущему Прогрессу (М1) — и без «Проверить»
    expect(screen.getByRole('button', { name: 'Моторчик' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument();

    // контур из батареи и лампочки, сохранение под именем
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await wireRing(user, ['Батарея 1', 'Лампочка 2']);
    await user.type(screen.getByRole('textbox', { name: 'Название схемы' }), 'Кольцо');
    await user.click(screen.getByRole('button', { name: 'Сохранить схему' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    // «перезагрузка страницы»: новый App читает хранилище схем
    firstRender.unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(screen.getByText('Кольцо')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Загрузить «Кольцо»' }));

    // загрузка без потерь: схема на Холсте и сразу живёт
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
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();
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

    // Переустановка системы или новый браузер: хранилище пусто
    window.localStorage.clear();
    const secondRender = render(<App />);
    expect(screen.getAllByText('Заданий пройдено: 0 из 3')).toHaveLength(2);

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile(content));
    expect(await screen.findByRole('status')).toHaveTextContent('восстановлены');

    // Прогресс Курса вернулся, М2 снова закрыта до поры
    expect(screen.getByText('Заданий пройдено: 1 из 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();

    // Схема Песочницы вернулась и переживает следующую перезагрузку
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

    expect(screen.getByText('Заданий пройдено: 1 из 3')).toBeInTheDocument();
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

    // Без подтверждения ничего не стирается
    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByText(/Удалить весь Прогресс/)).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 1 из 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Заданий пройдено: 1 из 3')).toBeInTheDocument();

    // Подтверждение — Прогресс обнуляется, схема Песочницы выживает
    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    await user.click(screen.getByRole('button', { name: 'Да, начать заново' }));
    expect(screen.getAllByText('Заданий пройдено: 0 из 3')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    // Пустой Прогресс переживает перезагрузку
    firstRender.unmount();
    render(<App />);
    expect(screen.getAllByText('Заданий пройдено: 0 из 3')).toHaveLength(2);
  });
});
