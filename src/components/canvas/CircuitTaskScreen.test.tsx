import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CircuitTask } from '../../domain/task';
import { module1Palette } from '../../content/m1';
import { module2 } from '../../content/m2';
import { evaluate, evaluationOfKind, type Answer } from '../../domain/evaluate';
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
function renderTask(task: CircuitTask = demoTask) {
  return render(
    <CircuitTaskScreen
      task={task}
      evaluation={null}
      onAnswer={() => undefined}
      onNext={() => undefined}
    />,
  );
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
    // у каждого элемента Палитры — свой символ
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
    // номинал по умолчанию подписан рядом
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

    // после правки поле перерисовывается с новым номиналом
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

    // второй раз — клавишей Delete
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

    // первый клик по выводу — начало Провода, подсказка меняется
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

    // после Esc клик по выводу начинает новый Провод, а не завершает старый
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
    // прямо навстречу: батарея (100,100) → лампочка (220,100)
    expect(wireLine()).toBe('140,100 180,100');

    dragTo(screen.getByRole('button', { name: 'Лампочка 2' }), svg, 220, 100, 420, 260);
    expect(screen.getByRole('button', { name: 'Лампочка 2' }).getAttribute('transform')).toBe(
      'translate(420 260) rotate(0)',
    );
    // Провод перестроился за лампочкой — ортогональным маршрутом
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

    // поворот
    await user.click(undo);
    expect(screen.getByRole('button', { name: 'Лампочка 2' }).getAttribute('transform')).toBe(
      'translate(220 100) rotate(0)',
    );
    // Провод
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Провод w1' })).not.toBeInTheDocument();
    // лампочка, батарея
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Лампочка 2' })).not.toBeInTheDocument();
    await user.click(undo);
    expect(screen.queryByRole('button', { name: 'Батарея 1' })).not.toBeInTheDocument();
    expect(undo).toBeDisabled();

    // всё возвращается
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

  /**
   * Обвязка как в ModuleScreen: ответ хранит родитель, вердикт считает
   * домен. Проверяется экран целиком, без моков.
   */
  function renderCheckableTask(task: CircuitTask) {
    const onNext = vi.fn();
    function Harness() {
      const [answer, setAnswer] = useState<Answer | null>(null);
      const evaluation = answer !== null ? evaluate(task, answer) : null;
      return (
        <CircuitTaskScreen
          task={task}
          evaluation={evaluationOfKind(evaluation, 'circuit-task')}
          onAnswer={setAnswer}
          onNext={onNext}
        />
      );
    }
    render(<Harness />);
    return onNext;
  }

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
    // только один Провод — контур не замкнут
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Лампочка не горит: мощность 0 Вт/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Дальше' })).not.toBeInTheDocument();

    // ученик достраивает контур — устаревший вердикт исчезает
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 2' }));
    expect(screen.queryByText('Не пройдено')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
  });

  it('витрина М2 из настоящего контента проходит: батарея, выключатель, лампочка, выключатель замкнут', async () => {
    const user = userEvent.setup();
    const m2Demo = module2.tasks.find((task) => task.kind === 'circuit-task') as CircuitTask;
    renderCheckableTask(m2Demo);

    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Лампочка 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));

    // разомкнутый выключатель — лампочка не горит
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();

    // замыкаем — схема проходит по условию
    await user.click(screen.getByRole('button', { name: 'Выключатель 2' }));
    await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Выключатель на схеме: 1 шт/)).toBeInTheDocument();
  });
});
