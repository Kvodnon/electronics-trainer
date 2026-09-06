import { render, screen } from '@testing-library/react';
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
  wireForwardDiode,
  wireRing,
} from '../testing/navigation';
// Курс, Теория и Прогресс — по настоящим данным приложения, домен не мокается.
// «Перезагрузка страницы» моделируется размонтированием и новым рендером App:
// Прогресс восстанавливается из localStorage. Скачивание файла перехватывает
// заглушка из src/testing — содержимое при этом настоящий Blob.

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

/** Отвечает на Вопросы М2 (диод, ток светодиода, конденсатор, τ) — очередь доходит до Схема-заданий. */
async function passModule2Questions(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Светодиод не светится' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '15мА');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'Ток прекращается' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.type(screen.getByRole('textbox', { name: 'Ответ' }), '1с');
  await user.click(screen.getByRole('button', { name: 'Ответить' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
}

describe('Экран Курса', () => {
  it('показывает Модули с Прогрессом; следующий lockedButton', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Основы DC' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Компоненты' })).toBeInTheDocument();

    // Прогресс по каждому Модулю: полный контент М1 — 22 Задания, М2 — 8 (тикет 14)
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 0 из 8')).toBeInTheDocument();

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
    expect(screen.getByText('Теория · карточка 1 из 4')).toBeInTheDocument();
    expect(screen.getByText('Резистор')).toBeInTheDocument();
    expect(screen.getByText('Источник постоянного напряжения')).toBeInTheDocument();
    const symbolFigures = screen.getAllByRole('img', { name: /Обозначение: стандарт/ });
    expect(symbolFigures).toHaveLength(4);
    expect(screen.getAllByText('ГОСТ / IEC')).toHaveLength(2);
    expect(screen.getAllByText('ANSI')).toHaveLength(2);

    // Вторая карточка: формулы закона Ома
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('Теория · карточка 2 из 4')).toBeInTheDocument();
    expect(screen.getByText('I = U / R')).toBeInTheDocument();

    // Последняя карточка ведёт к Заданиям
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

    // Первое Задание пройдено, на экране второе
    expect(screen.getByText('Вопрос с числовым ответом')).toBeInTheDocument();

    firstRender.unmount();
    render(<App />);

    // Курс помнит Прогресс М1; М2 всё ещё заблокирована
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();

    // Очередь продолжается со второго Задания
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
    const firstRender = render(<App />);
    await enterModule1Tasks(user);

    // Пока остальные Задания не пройдены, экзамен в очереди не показывается вовсе
    expect(screen.queryByText('Экзамен')).not.toBeInTheDocument();
    firstRender.unmount();

    // Все Задания, кроме Экзамена, закрыты — Экзамен открылся последним
    seedModule1Progress(['m1-exam']);
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 4);
    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(screen.getByTitle('Экзамен — не начато')).toBeInTheDocument();

    // Экзамен не сдан — Модуль не завершён: М2 всё ещё заблокирована
    await user.click(screen.getByRole('button', { name: '← К Модулям' }));
    expect(screen.getByText('Заданий пройдено: 21 из 22')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();
  });

  it('неудачная проверка Экзамена портит «первую попытку», сдача завершает Модуль и открывает следующий', async () => {
    const user = userEvent.setup();
    seedModule1Progress(['m1-exam']);
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await passTheory(user, 4);

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
    // М1 закрыта заранее — сразу к М2 (три карточки Теории → Задания)
    seedModule1Progress();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await passTheory(user, 3);
    await passModule2Questions(user);

    // «зажги светодиод»: светодиод с токоограничивающим резистором в прямом включении
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));
    await wireForwardDiode(user, ['Батарея 1', 'Светодиод 3', 'Резистор 2']);
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));

    // диод в прямом направлении
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
    seedModule1Progress();
    const user = userEvent.setup();
    const firstRender = render(<App />);

    // М2: Теория → Вопросы → Схема-задание (проходим Вопросы очереди)
    await user.click(screen.getByRole('button', { name: 'Начать' }));
    await passTheory(user, 3);
    await passModule2Questions(user);

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
    await passTheory(user, 3);
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

    // Палитра по текущему Прогрессу (М1) — и без «Проверить»:
    // Компоненты М2 закрыты, пока Модуль не открыт в Курсе
    expect(screen.getByRole('button', { name: 'Моторчик' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Диод' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Светодиод' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Конденсатор' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 0 из 8')).toBeInTheDocument();

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile(content));
    expect(await screen.findByRole('status')).toHaveTextContent('восстановлены');

    // Прогресс Курса вернулся, М2 снова закрыта до поры
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();
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

    // Без подтверждения ничего не стирается
    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByText(/Удалить весь Прогресс/)).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Заданий пройдено: 1 из 22')).toBeInTheDocument();

    // Подтверждение — Прогресс обнуляется, схема Песочницы выживает
    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    await user.click(screen.getByRole('button', { name: 'Да, начать заново' }));
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 0 из 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Заблокирован' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Открыть' }));
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    // Пустой Прогресс переживает перезагрузку
    firstRender.unmount();
    render(<App />);
    expect(screen.getByText('Заданий пройдено: 0 из 22')).toBeInTheDocument();
    expect(screen.getByText('Заданий пройдено: 0 из 8')).toBeInTheDocument();
  });
});
