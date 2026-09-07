import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModuleScreen } from '../ModuleScreen';
import { LogicTaskScreen } from './LogicTaskScreen';
import { module3 } from '../../content/m3';
import { evaluate, evaluationOfKind, type Answer } from '../../domain/evaluate';
import { emptyProgress } from '../../domain/course';
import type { LogicTask } from '../../domain/task';
import type { SymbolStandard } from '../../domain/symbols';

/**
 * Экран цифрового Схема-задания — третий шов (spec: Testing Decisions):
 * сборка, «Проверить» и вердикт проверяются как действия ученика; домен
 * не мокается. Схемы собираются кликами по Палитре и выводам.
 */

function logicTaskOf(id: string): LogicTask {
  const task = module3.tasks.find(
    (candidate): candidate is LogicTask => candidate.kind === 'logic-task' && candidate.id === id,
  );
  if (!task) throw new Error(`фикстура: нет цифрового Схема-задания «${id}»`);
  return task;
}

/** Обвязка как в ModuleScreen: ответ хранит родитель, вердикт считает домен. */
function renderCheckableTask(task: LogicTask) {
  const onNext = vi.fn();
  function Harness() {
    const [answer, setAnswer] = useState<Answer | null>(null);
    const [standard, setStandard] = useState<SymbolStandard>('gost');
    const evaluation = answer !== null ? evaluate(task, answer) : null;
    return (
      <LogicTaskScreen
        task={task}
        evaluation={evaluationOfKind(evaluation, 'logic-task')}
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

/**
 * Ловушка: две Кнопки и Индикатор, между ними элемент И. Кнопки и Индикатор
 * ставятся первыми — порядок установки задаёт входы и выход Задания.
 */
async function assembleAndTrap(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Кнопка' }));
  await user.click(screen.getByRole('button', { name: 'Кнопка' }));
  await user.click(screen.getByRole('button', { name: 'Индикатор' }));
  await user.click(screen.getByRole('button', { name: 'Элемент И' }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 1/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент И 4/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 2/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент И 4/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 3: Элемент И 4/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Индикатор 3/ }));
}

/** XOR a·¬b + ¬a·b из настоящего контента М3: восемь Компонентов, девять Проводов. */
async function assembleXor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Кнопка' }));
  await user.click(screen.getByRole('button', { name: 'Кнопка' }));
  await user.click(screen.getByRole('button', { name: 'Индикатор' }));
  await user.click(screen.getByRole('button', { name: 'Элемент И' }));
  await user.click(screen.getByRole('button', { name: 'Элемент НЕ' }));
  await user.click(screen.getByRole('button', { name: 'Элемент НЕ' }));
  await user.click(screen.getByRole('button', { name: 'Элемент И' }));
  await user.click(screen.getByRole('button', { name: 'Элемент ИЛИ' }));

  // a и b — на инверторы
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 1/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент НЕ 5/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 2/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент НЕ 6/ }));

  // первое слагаемое: a · ¬b (Элемент И 4)
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 1/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент И 4/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент НЕ 6/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент И 4/ }));

  // второе слагаемое: b · ¬a (Элемент И 7)
  await user.click(screen.getByRole('button', { name: /Вывод 1: Кнопка 2/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент И 7/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент НЕ 5/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент И 7/ }));

  // ИЛИ и Индикатор
  await user.click(screen.getByRole('button', { name: /Вывод 3: Элемент И 4/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Элемент ИЛИ 8/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 3: Элемент И 7/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 2: Элемент ИЛИ 8/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 3: Элемент ИЛИ 8/ }));
  await user.click(screen.getByRole('button', { name: /Вывод 1: Индикатор 3/ }));
}

afterEach(cleanup);

describe('Кнопка «Проверить» на цифровом Схема-задании', () => {
  it('пустой Холст → структурный Диагноз без таблицы истинности', async () => {
    const user = userEvent.setup();
    renderCheckableTask(logicTaskOf('m3-xor'));

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Входы и выходы не расставлены/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Таблица истинности — Разбор')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Дальше' })).not.toBeInTheDocument();
  });

  it('ловушка на элементе И → «Не пройдено» с набором входов, таблицей и подсветкой элемента', async () => {
    const user = userEvent.setup();
    renderCheckableTask(logicTaskOf('m3-xor'));
    await assembleAndTrap(user);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Не пройдено')).toBeInTheDocument();
    expect(screen.getByText(/Вход 1 = 0, Вход 2 = 1/)).toBeInTheDocument();
    expect(screen.getByText(/элемента И/)).toBeInTheDocument();

    const truthTable = screen.getByLabelText('Таблица истинности — Разбор');
    expect(truthTable).toBeInTheDocument();
    expect(truthTable.querySelectorAll('tr.logic-row-passed')).toHaveLength(1);
    expect(truthTable.querySelectorAll('tr.logic-row-failed')).toHaveLength(3);

    const gate = screen.getByRole('button', { name: 'Элемент И 4' });
    expect(gate.getAttribute('class')).toContain('canvas-component-fault');
    expect(document.querySelector('.fault-ring')).not.toBeNull();
  });

  it('XOR из контента М3: полный цикл — сборка → «Проверить» → «Пройдено» → «Дальше»', async () => {
    const user = userEvent.setup();
    const onNext = renderCheckableTask(logicTaskOf('m3-xor'));
    await assembleXor(user);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(screen.getByText('Пройдено')).toBeInTheDocument();
    const truthTable = screen.getByLabelText('Таблица истинности — Разбор');
    expect(truthTable.querySelectorAll('tr.logic-row-passed')).toHaveLength(4);
    expect(truthTable.querySelectorAll('tr.logic-row-failed')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('вердикт снимается после правки схемы, как у аналогового Схема-задания', async () => {
    const user = userEvent.setup();
    renderCheckableTask(logicTaskOf('m3-xor'));
    await assembleAndTrap(user);

    await user.click(screen.getByRole('button', { name: 'Проверить' }));
    expect(screen.getByText('Не пройдено')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Элемент НЕ' }));
    expect(screen.queryByText('Не пройдено')).not.toBeInTheDocument();
  });
});

describe('Модуль М3 ведёт к цифровому Схема-заданию', () => {
  it('после Теории Задание М3 открывается на цифровом Холсте с проверкой', async () => {
    const user = userEvent.setup();
    render(
      <ModuleScreen
        module={module3}
        progress={emptyProgress}
        symbolStandard="gost"
        onSymbolStandardChange={() => undefined}
        onProgressAction={() => undefined}
        onExit={() => undefined}
      />,
    );

    for (let card = 0; card < 3; card += 1) {
      await user.click(screen.getByRole('button', { name: 'Дальше' }));
    }
    await user.click(screen.getByRole('button', { name: 'К Заданиям' }));

    expect(screen.getByText('Схема-задание')).toBeInTheDocument();
    expect(screen.getByText(/Исключающее ИЛИ/)).toBeInTheDocument();
    for (const name of ['Кнопка', 'Индикатор', 'Элемент И', 'Элемент ИЛИ', 'Элемент НЕ']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Проверить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подсказка' })).toBeInTheDocument();
  });
});
