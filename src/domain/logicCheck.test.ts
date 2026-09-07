import { describe, expect, it } from 'vitest';
import { checkLogicTable } from './logicCheck';
import { evaluate, evaluationOfKind } from './evaluate';
import { emptyCanvas } from './canvas';
import type { LogicTask } from './task';
import type { DigitalCanvasState } from './digitalCanvas';
import {
  andGateTrap,
  digitalAssembly,
  halfAdderFromGates,
  openLoopNorPair,
  rsLatchFromNorCompositions,
  xorFromProductOfSums,
  xorFromSumOfProducts,
} from '../testing/digitalCircuits';

/**
 * Проверка цифровых Схема-заданий — домен-шов М3 (spec: Testing Decisions):
 * тесты идут через `evaluate(Задание, ответ)`, устройство перебора и
 * переноса состояния не фиксируется. Схемы — эталон-сборки из
 * testing/digitalCircuits, собранные редьюсером Холста.
 */

const xorTask: LogicTask = {
  kind: 'logic-task',
  id: 'fixture-xor',
  prompt: 'Соберите XOR.',
  palette: ['and', 'or', 'not', 'button', 'indicator'],
  inputs: 2,
  outputs: 1,
  truthTable: [
    { inputs: [0, 0], outputs: [0] },
    { inputs: [0, 1], outputs: [1] },
    { inputs: [1, 0], outputs: [1] },
    { inputs: [1, 1], outputs: [0] },
  ],
};

const halfAdderTask: LogicTask = {
  kind: 'logic-task',
  id: 'fixture-half-adder',
  prompt: 'Соберите полусумматор.',
  palette: ['and', 'or', 'not', 'button', 'indicator'],
  inputs: 2,
  outputs: 2,
  truthTable: [
    { inputs: [0, 0], outputs: [0, 0] },
    { inputs: [0, 1], outputs: [1, 0] },
    { inputs: [1, 0], outputs: [1, 0] },
    { inputs: [1, 1], outputs: [0, 1] },
  ],
};

/**
 * RS-триггер: строки с повторяющимся набором (0, 0) — «держит» проверяется
 * от состояния предыдущей строки, поэтому порядок строк значим.
 */
const rsLatchTask: LogicTask = {
  kind: 'logic-task',
  id: 'fixture-rs-latch',
  prompt: 'Соберите RS-триггер из двух ИЛИ-НЕ.',
  palette: ['or', 'not', 'button', 'indicator'],
  inputs: 2,
  outputs: 2,
  truthTable: [
    { inputs: [0, 1], outputs: [1, 0] },
    { inputs: [0, 0], outputs: [1, 0] },
    { inputs: [1, 0], outputs: [0, 1] },
    { inputs: [0, 0], outputs: [0, 1] },
    { inputs: [1, 1], outputs: [0, 0] },
  ],
};

function logicEvaluation(task: LogicTask, canvas: DigitalCanvasState) {
  const verdict = evaluationOfKind(evaluate(task, { kind: 'logic-answer', canvas }), 'logic-task');
  if (verdict === null) throw new Error('фикстура: ожидался вердикт цифрового Схема-задания');
  return verdict;
}

describe('Таблица истинности: перебор всех наборов входов (тикет 18)', () => {
  it('XOR: эталон-схема проходит все наборы входов через evaluate', () => {
    const verdict = logicEvaluation(xorTask, xorFromSumOfProducts());
    expect(verdict.outcome).toBe('correct');
    expect(verdict.diagnoses).toEqual([]);
    expect(verdict.rowChecks.map((check) => check.passed)).toEqual([true, true, true, true]);
    expect(verdict.rowChecks.map((check) => check.actual)).toEqual([[0], [1], [1], [0]]);
  });

  it('XOR: эквивалентная топология засчитывается — таблица одна, схемы разные', () => {
    const verdict = logicEvaluation(xorTask, xorFromProductOfSums());
    expect(verdict.outcome).toBe('correct');
  });

  it('XOR: элемент И на выходе ловится на наборе «Вход 1 = 0, Вход 2 = 1» с указанием элемента', () => {
    const verdict = logicEvaluation(xorTask, andGateTrap());
    expect(verdict.outcome).toBe('incorrect');

    const failed = verdict.rowChecks.filter((check) => !check.passed);
    expect(failed.map((check) => check.row.inputs)).toEqual([[0, 1], [1, 0], [1, 1]]);

    const [diagnosis] = verdict.diagnoses;
    expect(diagnosis.kind).toBe('logic-mismatch');
    expect(diagnosis.text).toMatch(/Вход 1 = 0, Вход 2 = 1/);
    expect(diagnosis.text).toMatch(/элемента И/);
    expect(diagnosis.spot).toBe('c3');
  });

  it('полусумматор: эталон проходит, оба выхода сверяются на каждом наборе', () => {
    const verdict = logicEvaluation(halfAdderTask, halfAdderFromGates());
    expect(verdict.outcome).toBe('correct');
    expect(verdict.rowChecks.map((check) => check.actual)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
  });

  it('Индикатор ни к чему не подключён — Диагноз указывает на Индикатор', () => {
    const hanging = digitalAssembly(['button', 'button', 'indicator'], []);
    const verdict = logicEvaluation(xorTask, hanging);

    const [diagnosis] = verdict.diagnoses;
    expect(verdict.outcome).toBe('incorrect');
    expect(diagnosis.kind).toBe('logic-mismatch');
    expect(diagnosis.text).toMatch(/не идёт сигнал/);
    expect(diagnosis.spot).toBe('c3');
  });
});

describe('Таблица истинности с памятью: RS-триггер (тикет 18)', () => {
  it('эталон держит оба состояния: повторяющиеся наборы проходят по порядку строк', () => {
    const verdict = logicEvaluation(rsLatchTask, rsLatchFromNorCompositions());
    expect(verdict.outcome).toBe('correct');
    expect(verdict.rowChecks.map((check) => check.actual)).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 1],
      [0, 0],
    ]);
  });

  it('пара ИЛИ-НЕ без перекрёстных связей не проходит: память не доказана', () => {
    const verdict = logicEvaluation(rsLatchTask, openLoopNorPair());
    expect(verdict.outcome).toBe('incorrect');
    // установку (0, 1) открытая пара ещё проходит, а «держит 1» — уже нет
    expect(verdict.rowChecks[0].passed).toBe(true);
    expect(verdict.rowChecks[1].passed).toBe(false);
    expect(verdict.diagnoses[0].text).toMatch(/Вход 1 = 0, Вход 2 = 0/);
  });
});

describe('Структура входов и выходов (тикет 18)', () => {
  it('Кнопок или Индикаторов не по условию — структурный Диагноз, таблица не проверяется', () => {
    const result = checkLogicTable(digitalAssembly(['button', 'indicator'], []), xorTask);
    expect(result.passed).toBe(false);
    expect(result.rowChecks).toEqual([]);
    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0].kind).toBe('structure');
    expect(result.diagnoses[0].text).toMatch(/2 Кнопок-входов и 1 Индикаторов-выходов/);
  });

  it('лишняя Кнопка помечается как место ошибки', () => {
    const result = checkLogicTable(
      digitalAssembly(['button', 'button', 'button', 'indicator'], []),
      xorTask,
    );
    expect(result.diagnoses[0].kind).toBe('structure');
    expect(result.diagnoses[0].spot).toBe('c3');
  });

  it('ответ другого вида не подходит цифровому Заданию — ошибка контракта', () => {
    expect(() => evaluate(xorTask, { kind: 'circuit-answer', canvas: emptyCanvas })).toThrow();
  });
});
