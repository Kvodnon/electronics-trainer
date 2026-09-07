import { useState } from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CircuitTask } from '../../domain/task';
import type { SymbolStandard } from '../../domain/symbols';
import { module1Palette } from '../../content/m1';
import { module2 } from '../../content/m2';
import { isExamTask } from '../../domain/course';
import { evaluate, evaluationOfKind, type Answer } from '../../domain/evaluate';
import { setResistance, closeSwitch, wireForwardDiode, wireRing, wireTransistorKey } from '../../testing/navigation';
import { CircuitTaskScreen } from './CircuitTaskScreen';

/**
 * Экран Схема-задания — третий шов (React-компоненты через Testing Library,
 * см. spec: Testing Decisions): все операции редактора и проверка «Проверить»
 * проверяются как действия ученика; домен не мокается.
 */

const demoTask: CircuitTask = {
  kind: 'circuit-task',
  id: 'demo',
  prompt: 'Соберите цепь: батарея, выключатель, лампочка.',
  palette: module1Palette,
  conditions: [],
};

/** Рендер только редактора: проверка не участвовала, вердикта нет. */
function renderTask(task: CircuitTask = demoTask, initialStandard: SymbolStandard = 'gost') {
  /** Обвязка как в ModuleScreen: стандарт обозначений живёт выше экрана Задания. */
  function Harness() {
    const [standard, setStandard] = useState(initialStandard);
    return (
      <CircuitTaskScreen
        task={task}
        evaluation={null}
        onAnswer={() => undefined}
        onNext={() => undefined}
        symbolStandard={standard}
        onSymbolStandardChange={setStandard}
      />
    );
  }
  return render(<Harness />);
}

/** jsdom не считает layout: сообщаем Холсту его реальный размер (viewBox 800×560). */
function mockCanvasRect(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector('svg.canvas-svg') as SVGSVGElement;
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 800,
    bottom: 560,
    width: 800,
    height: 560,
  } as DOMRect);
  return svg;
}

/**
 * Замыкает контур вокруг поставленной первым «Батареи 1»: «плюс» — к Компоненту,
 * второй вывод Компонента — к «минусу». Батарея уже на Холсте.
 */
async function assembleLoop(user: ReturnType<typeof userEvent.setup>, secondComponentName: string) {
  await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${secondComponentName}` }));
  await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${secondComponentName}` }));
}

/**
 * Перетаскивание Компонента мышью: взять в (fromX, fromY), отпустить в (toX, toY).
 * Жест из трёх событий fireEvent: userEvent авто-отпускает зажатую кнопку
 * между вызовами, а события — настоящие, порядок контролирует тест.
 */
function dragTo(
  target: Element,
  svg: SVGSVGElement,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  fireEvent.mouseDown(target, { button: 0, clientX: fromX, clientY: fromY });
  fireEvent.mouseMove(svg, { clientX: toX, clientY: toY });
  fireEvent.mouseUp(svg, { clientX: toX, clientY: toY });
}

afterEach(cleanup);

describe('Палитра М1', () => {
  it('показывает все Компоненты М1 с обозначениями в ГОСТ', () => {
    renderTask();

    for (const name of ['Батарея', 'Резистор', 'Лампочка', 'Выключатель', 'Ключ', 'Моторчик']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    const symbols = document.querySelectorAll('svg.palette-symbol');
    expect(symbols).toHaveLength(6);
    for (const symbol of symbols) {
      expect(symbol.querySelector('path, rect, circle')).not.toBeNull();
    }
  });
});

describe('Постановка и правка Компонентов', () => {
  it('клик по Палитре ставит Компонент на Холст; клик по нему открывает панель правки', async () => {
    const user = userEvent.setup();
    renderTask();

    await user.click(screen.getByRole('button', { name: 'Батарея' }));

    const onCanvas = screen.getByRole('button', { name: 'Батарея 1' });
    expect(onCanvas.getAttribute('transform')).toBe('translate(100 100) rotate(0)');
    expect(screen.getByText('9 В')).toBeInTheDocument();

    await user.click(onCanvas);
    expect(screen.getByText('Батарея 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повернуть' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument();
  });

  it('поворот шагает по 90°: кнопкой и клавишей R (и «к» в русской раскладке)', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    const resistor = screen.getByRole('button', { name: 'Резистор 1' });

    await user.click(resistor);
    await user.click(screen.getByRole('button', { name: 'Повернуть' }));
    expect(resistor.getAttribute('transform')).toBe('translate(100 100) rotate(90)');

    await user.keyboard('к');
    expect(resistor.getAttribute('transform')).toBe('translate(100 100) rotate(180)');
  });

  it('номинал правится: 4,5 В через запятую; неверная запись объясняется', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Батарея 1' }));

    const field = screen.getByLabelText('Номинал, В');
    await user.clear(field);
    await user.type(field, '4,5');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByText('4,5 В')).toBeInTheDocument();

    const refreshed = screen.getByLabelText('Номинал, В');
    await user.clear(refreshed);
    await user.type(refreshed, 'девять');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    expect(screen.getByText(/Не удалось прочитать число/)).toBeInTheDocument();
  });

  it('выключатель замыкается галочкой в панели правки', async () => {
    const user = userEvent.setup();
    const { container } = renderTask();
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель 1' }));

    const label = () => container.querySelector('text.canvas-label')?.textContent;
    expect(label()).toBe('разомкнут');

    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    expect(label()).toBe('замкнут');
  });

  it('удаление Компонента убирает и его Провода (кнопкой и клавишей Delete)', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(screen.queryByRole('button', { name: 'Провод w1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Батарея 1' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка 2' }));
    await user.keyboard('{Delete}');
    expect(screen.queryByRole('button', { name: 'Лампочка 2' })).not.toBeInTheDocument();
  });
});

describe('Провода', () => {
  it('Провод тянется кликом по выводам: от батареи к лампочке', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));

    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    expect(screen.getByText(/Проведите Провод до второго вывода/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(screen.queryByText(/Проведите Провод/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();
  });

  it('Esc отменяет начатый Провод', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));

    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    expect(screen.queryByRole('button', { name: 'Провод w1' })).not.toBeInTheDocument();
    expect(screen.getByText(/Проведите Провод до второго вывода/)).toBeInTheDocument();
  });

  it('Провод выбирается кликом и удаляется кнопкой', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    await user.click(screen.getByRole('button', { name: 'Провод w1' }));
    expect(screen.getByText('Провод', { selector: '.canvas-selection-name' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    expect(screen.queryByRole('button', { name: 'Провод w1' })).not.toBeInTheDocument();
  });

  it('при перемещении Компонента Провод перерисовывается, соединение не рвётся', async () => {
    const user = userEvent.setup();
    const { container } = renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    const svg = mockCanvasRect(container);
    const wireLine = () => container.querySelector('polyline.wire-line')?.getAttribute('points');
    expect(wireLine()).toBe('140,100 180,100');

    dragTo(screen.getByRole('button', { name: 'Лампочка 2' }), svg, 220, 100, 420, 260);
    expect(screen.getByRole('button', { name: 'Лампочка 2' }).getAttribute('transform')).toBe(
      'translate(420 260) rotate(0)',
    );
    expect(wireLine()).toBe('140,100 360,100 360,260 380,260');
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();
  });
});

describe('Undo/redo и сброс', () => {
  it('отмена и возврат покрывают постановку, Провод и поворот', async () => {
    const user = userEvent.setup();
    renderTask();
    const undo = screen.getByRole('button', { name: 'Отменить' });
    const redo = screen.getByRole('button', { name: 'Вернуть' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Повернуть' }));

    await user.click(undo);
    expect(screen.getByRole('button', { name: 'Лампочка 2' }).getAttribute('transform')).toBe(
      'translate(220 100) rotate(0)',
    );
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Провод w1' })).not.toBeInTheDocument();
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Лампочка 2' })).not.toBeInTheDocument();
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Батарея 1' })).not.toBeInTheDocument();
    expect(undo).toBeDisabled();

    await user.click(redo);
    expect(screen.getByRole('button', { name: 'Батарея 1' })).toBeInTheDocument();
  });

  it('Сбросить схему очищает Холст; сброс тоже отменяется', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Моторчик' }));
    expect(screen.getByRole('button', { name: 'Батарея 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить схему' }));
    expect(screen.queryByRole('button', { name: 'Батарея 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Моторчик 2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(screen.getByRole('button', { name: 'Батарея 1' })).toBeInTheDocument();
  });
});

/**
 * Обвязка как в ModuleScreen: ответ хранит родитель, вердикт считает
 * домен. Проверяется экран целиком, без моков.
 */
function renderCheckableTask(task: CircuitTask) {
  const onNext = vi.fn();
  function Harness() {
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [standard, setStandard] = useState<SymbolStandard>('gost');
    const evaluation = answer !== null ? evaluate(task, answer) : null;
    return (
      <CircuitTaskScreen
        task={task}
        evaluation={evaluationOfKind(evaluation, 'circuit-task')}
        onAnswer={setAnswer}
        onNext={onNext}
        symbolStandard={standard}
        onSymbolStandardChange={setStandard}
      />
    );
  }
  render(<Harness />);
  return onNext;
}

describe('Кнопка «Проверить»', () => {
  /** Задание: батарея и лампочка, лампочка горит, ток 50–100 мА. */
  const litTask: CircuitTask = {
    kind: 'circuit-task',
    id: 'lit',
    prompt: 'Соберите цепь: батарея и лампочка, лампочка должна гореть.',
    palette: module1Palette,
    conditions: [
      { kind: 'component-used', componentKind: 'battery' },
      { kind: 'component-used', componentKind: 'lamp' },
      { kind: 'current-through', componentKind: 'lamp', range: { from: 0.05, to: 0.1 } },
      { kind: 'component-active', componentKind: 'lamp', active: true },
    ],
  };

  /** Ставит батарею и лампочку и соединяет их в контур. */
  async function assembleLampLoop(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 2' }));
  }

  it('простейшая цепь → «Проверить» → «Пройдено» с Разбором по расчёту', async () => {
    const user = userEvent.setup();
    const onNext = renderCheckableTask(litTask);
    await assembleLampLoop(user);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    // Разбор построен на вычисленном токе и границах условия
    expect(screen.getByText(/Ток через лампочку — 74,9 мА, в границах условия \(50–100 мА\)/)).toBeInTheDocument();
    expect(screen.getByText(/Лампочка горит/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('разорванная цепь → «Не пройдено»; после правки вердикт снимается и схема проходит', async () => {
    const user = userEvent.setup();
    renderCheckableTask(litTask);
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Лампочка не горит: мощность 0 Вт/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Дальше' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 2' }));
    expect(screen.queryByText('Не пройдено')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
  });

  it('витрина М2 из настоящего контента проходит: светодиод с резистором в прямом включении', async () => {
    const user = userEvent.setup();
    // первое Схема-задание М2 — «зажги светодиод с токоограничивающим резистором»
    const m2Led = module2.tasks.find((task) => task.kind === 'circuit-task') as CircuitTask;
    renderCheckableTask(m2Led);

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();

    // прямое включение: «плюс» батареи — на анод (вывод 1) светодиода
    await wireForwardDiode(user, ['Батарея 1', 'Светодиод 3', 'Резистор 2']);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Ток через светодиод/)).toBeInTheDocument();
    expect(screen.getByText(/Светодиод светится/)).toBeInTheDocument();
  });

  it('светодиод в обратном включении → Диагноз «диод не проводит в обратную сторону» с местом ошибки', async () => {
    const user = userEvent.setup();
    const m2Led = module2.tasks.find((task) => task.kind === 'circuit-task') as CircuitTask;
    renderCheckableTask(m2Led);

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Светодиод' }));
    // катод (вывод 2) — к «плюсу» батареи: диод заперт
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Светодиод 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Светодиод 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Резистор 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Резистор 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/обратную сторону/)).toBeInTheDocument();
  });
});

describe('Живое поведение схемы', () => {
  it('лампочка в замкнутом контуре светится ещё до «Проверить», тёмная — без контура', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    expect(document.querySelector('.symbol-lamp-glow')).toBeNull();

    await assembleLoop(user, 'Лампочка 2');
    const glow = document.querySelector('.symbol-lamp-glow');
    expect(glow).not.toBeNull();
    // 9 В на 120 Ом — полный накал, яркость насыщена
    expect(glow!.getAttribute('opacity')).toBe('1');
  });

  it('моторчик в замкнутом контуре вращается', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Моторчик' }));
    expect(document.querySelector('.motor-rotor-spinning')).toBeNull();

    await assembleLoop(user, 'Моторчик 2');
    expect(document.querySelector('.motor-rotor-spinning')).not.toBeNull();
  });
});

describe('Диагноз и подсветка места ошибки', () => {
  /** Задание: лампочка горит с током 50–100 мА. */
  const litTask: CircuitTask = {
    kind: 'circuit-task',
    id: 'diagnose-lit',
    prompt: 'Соберите цепь: батарея и лампочка, лампочка должна гореть.',
    palette: module1Palette,
    conditions: [
      { kind: 'current-through', componentKind: 'lamp', range: { from: 0.05, to: 0.1 } },
      { kind: 'component-active', componentKind: 'lamp', active: true },
    ],
  };

  it('схема-ловушка с обрывом → «Проверить» → Диагноз назван, место ошибки подсвечено', async () => {
    const user = userEvent.setup();
    renderCheckableTask(litTask);
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Обрыв цепи/)).toBeInTheDocument();
    const lamp = screen.getByRole('button', { name: 'Лампочка 2' });
    expect(lamp.getAttribute('class')).toContain('canvas-component-fault');
    expect(document.querySelector('.fault-ring')).not.toBeNull();
  });

  it('перемычка между полюсами батареи → КЗ, подсвечен Провод-виновник', async () => {
    const user = userEvent.setup();
    renderCheckableTask(litTask);
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText(/Короткое замыкание/)).toBeInTheDocument();
    const wire = screen.getByRole('button', { name: 'Провод w1' });
    expect(wire.getAttribute('class')).toContain('wire-fault');
  });

  it('«работает, но не по условию» — отдельное слово вердикта, не «Пройдено» и не «Не пройдено»', async () => {
    const user = userEvent.setup();
    renderCheckableTask(litTask);
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    // лампочка 500 Ом: горит (0,16 Вт), но ток 18 мА — ниже условия
    await user.click(screen.getByRole('button', { name: 'Лампочка 2' }));
    await user.clear(screen.getByLabelText('Номинал, Ом'));
    await user.type(screen.getByLabelText('Номинал, Ом'), '500');
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    await assembleLoop(user, 'Лампочка 2');

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Работает, но не по условию')).toBeInTheDocument();
    expect(screen.queryByText('Пройдено')).not.toBeInTheDocument();
    expect(screen.queryByText('Не пройдено')).not.toBeInTheDocument();
    expect(screen.getByText(/работает, но не по условию/)).toBeInTheDocument();
  });
});

describe('Оверлей токов и напряжений', () => {
  const litTask: CircuitTask = {
    kind: 'circuit-task',
    id: 'overlay-lit',
    prompt: 'Соберите цепь: батарея и лампочка, лампочка должна гореть.',
    palette: module1Palette,
    conditions: [
      { kind: 'current-through', componentKind: 'lamp', range: { from: 0.05, to: 0.1 } },
      { kind: 'component-active', componentKind: 'lamp', active: true },
    ],
  };

  it('выключается и включается после «Проверить», значения совпадают с расчётом', async () => {
    const user = userEvent.setup();
    renderCheckableTask(litTask);
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await assembleLoop(user, 'Лампочка 2');

    const toggle = screen.getByRole('checkbox', { name: 'Токи и напряжения' });
    expect(toggle).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(document.querySelector('.canvas-wire-reading')).toBeNull();

    await user.click(toggle);
    // 9 В / 120,1 Ом = 74,9 мА: подпись тока на каждом из двух Проводов контура
    const wireLabels = document.querySelectorAll('text.canvas-wire-reading');
    expect(wireLabels).toHaveLength(2);
    for (const label of wireLabels) expect(label.textContent).toBe('74,9 мА');
    // напряжение из того же решения: на батарее и на лампочке — одно и то же (внутреннее падение мало)
    expect(screen.getAllByText('8,99 В')).toHaveLength(2);

    await user.click(toggle);
    expect(document.querySelector('text.canvas-wire-reading')).toBeNull();
  });
});

describe('Мультиметр', () => {
  /** Чекбокс режима измерений, выбор режима и табло Мультиметра. */
  const multimeterToggle = () => screen.getByRole('checkbox', { name: 'Мультиметр' });
  const modeSelect = () => screen.getByRole('combobox', { name: 'Режим мультиметра' });
  const display = () => document.querySelector('.multimeter-display')!;

  /** Контур батарея — выключатель — лампочка; выключатель остаётся разомкнутым. */
  async function assembleSwitchedLoop(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
  }

  it('включается, щупы к двум точкам — видно напряжение из расчёта', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await assembleLoop(user, 'Лампочка 2');

    expect(multimeterToggle()).not.toBeChecked();
    await user.click(multimeterToggle());
    expect(display().textContent).toBe('—');

    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    expect(display().textContent).toBe('—');
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(display().textContent).toBe('8,99 В');
  });

  it('щупы снимаются Esc и прикладываются заново: перестановка меняет знак', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await assembleLoop(user, 'Лампочка 2');
    await user.click(multimeterToggle());
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(display().textContent).toBe('8,99 В');

    await user.keyboard('{Escape}');
    expect(display().textContent).toBe('—');

    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    expect(display().textContent).toBe('-8,99 В');
  });

  it('ток ветви обновляется после переключения выключателя, без перезапуска режима', async () => {
    const user = userEvent.setup();
    renderTask();
    await assembleSwitchedLoop(user);
    await user.click(screen.getByRole('button', { name: 'Выключатель 2' }));
    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));

    await user.click(multimeterToggle());
    await user.selectOptions(modeSelect(), 'current');
    await user.click(screen.getByRole('button', { name: 'Выключатель 2' }));
    expect(display().textContent).toBe('74,9 мА');

    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    expect(display().textContent).toBe('0 А');
    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    expect(display().textContent).toBe('74,9 мА');
  });

  it('щупы без общей цепи — измерение невозможно: «—»', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(multimeterToggle());
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(display().textContent).toBe('—');
  });

  it('в режиме измерений клик по выводу прикладывает щуп, а не тянет Провод; после выключения Холст редактируется как прежде', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));

    await user.click(multimeterToggle());
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    expect(document.querySelector('.canvas-pin-source')).toBeNull();
    expect(document.querySelector('.multimeter-probe-red')).not.toBeNull();

    await user.click(multimeterToggle());
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();
  });

  it('щупы рисуются на Холсте: кольца на точках измерения', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await assembleLoop(user, 'Лампочка 2');
    await user.click(multimeterToggle());
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    expect(document.querySelectorAll('.multimeter-probe-red')).toHaveLength(1);
    expect(document.querySelectorAll('.multimeter-probe-black')).toHaveLength(1);

    await user.selectOptions(modeSelect(), 'current');
    await user.click(screen.getByRole('button', { name: 'Лампочка 2' }));
    expect(document.querySelectorAll('.multimeter-probe-red')).toHaveLength(1);
    expect(document.querySelectorAll('.multimeter-probe-black')).toHaveLength(1);
    expect(display().textContent).toBe('74,9 мА');
  });
});

describe('Стандарт обозначений', () => {
  const standardSelect = () => screen.getByRole('combobox', { name: 'Обозначения' });

  /** В группе Компонента есть наклонный сегмент (зигзаг ANSI или плечо). */
  const hasSlantedPath = (group: Element) =>
    [...group.querySelectorAll('path')].some((p) => (p.getAttribute('d') ?? '').includes('L'));

  it('по умолчанию ГОСТ; выбор ANSI мгновенно перерисовывает Палитру и Холст', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Резистор' }));

    const canvasResistor = screen.getByRole('button', { name: 'Резистор 1' });
    // ГОСТ: резистор — прямоугольник, в Палитре и на Холсте
    expect(canvasResistor.querySelector('rect')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Резистор' }).querySelector('svg.palette-symbol rect')).not.toBeNull();

    await user.selectOptions(standardSelect(), 'ansi');

    // ANSI: прямоугольник сменён зигзагом — без перезагрузки и правки схемы
    expect(canvasResistor.querySelector('rect')).toBeNull();
    expect(hasSlantedPath(canvasResistor)).toBe(true);
    const paletteResistor = screen.getByRole('button', { name: 'Резистор' });
    expect(paletteResistor.querySelector('svg.palette-symbol rect')).toBeNull();
    expect(hasSlantedPath(paletteResistor.querySelector('svg.palette-symbol')!)).toBe(true);

    await user.selectOptions(standardSelect(), 'gost');
    expect(canvasResistor.querySelector('rect')).not.toBeNull();
  });

  it('в ANSI у каждого Компонента Палитры М1 — свой символ; батарея ANSI — круг с «+/−»', async () => {
    const user = userEvent.setup();
    renderTask();

    await user.selectOptions(standardSelect(), 'ansi');

    for (const name of ['Батарея', 'Резистор', 'Лампочка', 'Выключатель', 'Ключ', 'Моторчик']) {
      const symbol = screen.getByRole('button', { name }).querySelector('svg.palette-symbol');
      expect(symbol).not.toBeNull();
      expect(symbol!.querySelector('path, rect, circle')).not.toBeNull();
    }
    // батарея ANSI — круг с знаками; у батареи ГОСТ круга нет
    const batterySymbol = screen.getByRole('button', { name: 'Батарея' }).querySelector('svg.palette-symbol')!;
    expect(batterySymbol.querySelector('circle')).not.toBeNull();
    expect(batterySymbol.textContent).toContain('+');
    expect(batterySymbol.textContent).toContain('−');
  });

  it('переключение не сбрасывает работу: состояние Холста идентично до и после', async () => {
    const user = userEvent.setup();
    const { container } = renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 2' }));
    // замкнутый выключатель — состояние Компонента тоже не должно сброситься
    await user.click(screen.getByRole('button', { name: 'Выключатель 3' }));
    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    expect(screen.getByText('замкнут', { selector: 'text.canvas-label' })).toBeInTheDocument();

    // всё, что определяет собранную работу: позиции и повороты, Провода,
    // номиналы, состояние коммутаторов, выводы (сами символы меняются —
    // это и есть переключение, в снимок они не входят)
    const stateSnapshot = () =>
      JSON.stringify({
        components: [...container.querySelectorAll('g.canvas-component')].map((g) => g.getAttribute('transform')),
        wires: [...container.querySelectorAll('polyline.wire-line')].map((p) => p.getAttribute('points')),
        labels: [...container.querySelectorAll('text.canvas-label')].map((t) => t.textContent),
        pins: [...container.querySelectorAll('circle.canvas-pin')].map(
          (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`,
        ),
      });
    const before = stateSnapshot();

    await user.selectOptions(standardSelect(), 'ansi');
    expect(stateSnapshot()).toBe(before);

    await user.selectOptions(standardSelect(), 'gost');
    expect(stateSnapshot()).toBe(before);
  });

  it('живое поведение не зависит от стандарта: лампочка светится и в ANSI', async () => {
    const user = userEvent.setup();
    renderTask();
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await assembleLoop(user, 'Лампочка 2');

    await user.selectOptions(standardSelect(), 'ansi');

    const glow = document.querySelector('.symbol-lamp-glow');
    expect(glow).not.toBeNull();
    // 9 В на 120 Ом — полный накал, как и в ГОСТ
    expect(glow!.getAttribute('opacity')).toBe('1');
  });
});

describe('Подсказки и Экзамен на экране Схема-задания', () => {
  /** Витринное Схема-задание М2 из настоящего контента (с Подсказками). */
  function renderModule2Task(task = module2.tasks.find((t): t is CircuitTask => t.kind === 'circuit-task')!) {
    return renderTask(task);
  }

  it('подсказка открывается по ступеням, пока Задание не решено', async () => {
    const user = userEvent.setup();
    renderModule2Task();

    expect(screen.getByText('Схема-задание')).toBeInTheDocument();
    expect(screen.queryByText(/прямой порог светодиода/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Подсказка' }));
    expect(screen.getByText(/прямой порог светодиода/)).toBeInTheDocument();
    expect(screen.queryByText(/по стрелке/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ещё подсказка' }));
    expect(screen.getByText(/по стрелке/)).toBeInTheDocument();
  });

  it('Экзамен помечен вместо «Схема-задание»', () => {
    const exam = module2.tasks.find(isExamTask)!;
    if (exam.kind !== 'circuit-task') throw new Error('фикстура: Экзамен М2 — аналоговое Схема-задание');
    renderModule2Task(exam);

    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(screen.queryByText('Схема-задание')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подсказка' })).toBeInTheDocument();
  });
});

/**
 * Переходный режим и Осциллограф (тикет 14): график напряжения во времени,
 * проигрывание заряда с наполнением конденсатора, ёмкость в панели правки.
 * Берём настоящее Схема-задание М2 «заряди конденсатор» из контента.
 */
describe('Осциллограф переходного режима', () => {
  function capacitorTask(): CircuitTask {
    const task = module2.tasks.find(
      (candidate): candidate is CircuitTask => candidate.kind === 'circuit-task' && candidate.id === 'm2-capacitor-charge',
    );
    if (task === undefined) throw new Error('фикстура: в М2 нет задания m2-capacitor-charge');
    return task;
  }

  /** Ставит батарею, выключатель, резистор и конденсатор и замыкает их в кольцо. */
  async function assembleChargingLoop(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    // кольцо: вывод 2 каждого — к выводу 1 следующего (порядок по времени постановки)
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Конденсатор 4' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Конденсатор 4' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Резистор 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Резистор 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
  }

  it('осциллограф рисует кривую заряда, отметку ключа и постоянной времени', async () => {
    const user = userEvent.setup();
    renderTask(capacitorTask());

    expect(screen.getByRole('img', { name: 'График напряжения конденсатора во времени' })).toBeInTheDocument();
    // пока на Холсте нет конденсатора, кривой нет — только сетка
    expect(document.querySelector('polyline.scope-curve')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    expect(document.querySelectorAll('polyline.scope-curve')).toHaveLength(1);
    expect(document.querySelector('.scope-toggle-mark')).not.toBeNull();
    expect(screen.getByText('ключ', { selector: '.scope-mark-label' })).toBeInTheDocument();
    // отметка τ стоит, потому что у конденсатора есть резистивный путь в конечном состоянии
    expect(screen.getByText(/^τ = /, { selector: '.scope-mark-label' })).toBeInTheDocument();
  });

  it('без переходного режима в Задании осциллографа нет', () => {
    renderTask();
    expect(screen.queryByText('Осциллограф')).not.toBeInTheDocument();
    expect(document.querySelector('svg.scope-svg')).toBeNull();
  });

  it('«Проиграть заряд» ведёт бегунок: показание времени растёт, конденсатор наполняется', async () => {
    const user = userEvent.setup();
    renderTask(capacitorTask());
    expect(document.querySelector('.scope-playhead')).toBeNull();
    expect(document.querySelector('.symbol-capacitor-charge')).toBeNull();

    await assembleChargingLoop(user);
    await user.click(screen.getByRole('button', { name: 'Проиграть заряд' }));

    expect(screen.getByText(/t = 0 с · U = 0 В/)).toBeInTheDocument();
    expect(document.querySelector('.scope-playhead')).not.toBeNull();
    await waitFor(() => expect(document.querySelector('.symbol-capacitor-charge')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Остановить' }));
    expect(screen.getByRole('button', { name: 'Проиграть заряд' })).toBeInTheDocument();
  }, 10_000);

  it('ёмкость конденсатора правится в панели правки и подписывается с приставкой', async () => {
    const user = userEvent.setup();
    renderTask(capacitorTask());
    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    await user.click(screen.getByRole('button', { name: 'Конденсатор 1' }));

    expect(screen.getByText('100 мкФ')).toBeInTheDocument();
    const field = screen.getByLabelText('Номинал, Ф');
    await user.clear(field);
    await user.type(field, '200мкФ');
    await user.click(screen.getByRole('button', { name: 'Применить' }));

    expect(screen.getByText('200 мкФ')).toBeInTheDocument();
  });

  it('полный цикл: собранная и подогнанная схема проходит проверку по расчёту во времени', async () => {
    const user = userEvent.setup();
    /** Обвязка с настоящей проверкой, как в тестах «Проверить» выше. */
    function Harness() {
      const [answer, setAnswer] = useState<Answer | null>(null);
      const [standard, setStandard] = useState<SymbolStandard>('gost');
      const task = capacitorTask();
      const evaluation = answer !== null ? evaluate(task, answer) : null;
      return (
        <CircuitTaskScreen
          task={task}
          evaluation={evaluationOfKind(evaluation, 'circuit-task')}
          onAnswer={setAnswer}
          onNext={() => undefined}
          symbolStandard={standard}
          onSymbolStandardChange={setStandard}
        />
      );
    }
    render(<Harness />);

    await assembleChargingLoop(user);
    await setResistance(user, 'Резистор 3', '19кОм');

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Постоянная времени RC-цепи — 1,9 с, в границах/)).toBeInTheDocument();
    expect(screen.getByText(/Напряжение на конденсаторе в момент t = 3 с — 6,59 В, в границах/)).toBeInTheDocument();
  });

  it('схема без подбора: заряд слишком быстрый — «работает, но не по условию» с числами', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [answer, setAnswer] = useState<Answer | null>(null);
      const [standard, setStandard] = useState<SymbolStandard>('gost');
      const task = capacitorTask();
      const evaluation = answer !== null ? evaluate(task, answer) : null;
      return (
        <CircuitTaskScreen
          task={task}
          evaluation={evaluationOfKind(evaluation, 'circuit-task')}
          onAnswer={setAnswer}
          onNext={() => undefined}
          symbolStandard={standard}
          onSymbolStandardChange={setStandard}
        />
      );
    }
    render(<Harness />);

    await assembleChargingLoop(user);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Работает, но не по условию')).toBeInTheDocument();
    expect(screen.getByText(/Постоянная времени RC-цепи — 100 мс/)).toBeInTheDocument();
  });
});


describe('Задания М2: транзистор, потенциометр, зуммер (тикет 15)', () => {
  function circuitTaskOf(id: string): CircuitTask {
    const task = module2.tasks.find(
      (candidate): candidate is CircuitTask => candidate.kind === 'circuit-task' && candidate.id === id,
    );
    if (!task) throw new Error(`фикстура: нет Схема-задания «${id}»`);
    return task;
  }

  it('«ключ на транзисторе»: полный цикл — разомкнутая кнопка ловится, замкнутая проходит с Разбором', async () => {
    const user = userEvent.setup();
    renderCheckableTask(circuitTaskOf('m2-transistor-switch'));

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
    // базовый резистор 10 кОм — ток кнопки остаётся «малым» (условие Задания)
    await setResistance(user, 'Резистор 3', '10кОм');

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/контакт разомкнут/)).toBeInTheDocument();

    await closeSwitch(user, 'Ключ 2');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Светодиод светится/)).toBeInTheDocument();
    expect(screen.getByText(/Ток через светодиод/)).toBeInTheDocument();
  });

  it('«делитель с потенциометром»: движок подгоняется ползунком, проверяется по напряжению', async () => {
    const user = userEvent.setup();
    renderCheckableTask(circuitTaskOf('m2-pot-divider'));

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Потенциометр' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Потенциометр 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 3: Потенциометр 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));

    // движок у «минуса» — 0,45 В, не хватает: «работает, но не по условию»
    await user.click(screen.getByRole('button', { name: 'Потенциометр 2' }));
    const wiper = screen.getByRole('slider', { name: /Положение движка/ });
    fireEvent.change(wiper, { target: { value: '95' } });
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Работает, но не по условию')).toBeInTheDocument();
    expect(screen.getByText(/Напряжение на движке потенциометра/)).toBeInTheDocument();

    // поворот движка на 60 % — 3,6 В, в границах условия
    await user.click(screen.getByRole('button', { name: 'Потенциометр 2' }));
    fireEvent.change(screen.getByRole('slider', { name: /Положение движка/ }), { target: { value: '60' } });
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/3,6 В/)).toBeInTheDocument();
  });

  it('«зуммер»: резистор по умолчанию тих, после подбора — звучит', async () => {
    const user = userEvent.setup();
    renderCheckableTask(circuitTaskOf('m2-buzzer-check'));

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Резистор' }));
    await user.click(screen.getByRole('button', { name: 'Зуммер' }));
    await wireRing(user, ['Батарея 1', 'Зуммер 3', 'Резистор 2']);

    // 1 кОм по умолчанию — ток 8,6 мА ниже порога звучания
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Работает, но не по условию')).toBeInTheDocument();
    expect(screen.getByText(/Зуммер не звучит/)).toBeInTheDocument();

    await setResistance(user, 'Резистор 2', '100');
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Зуммер звучит/)).toBeInTheDocument();
  });
});
