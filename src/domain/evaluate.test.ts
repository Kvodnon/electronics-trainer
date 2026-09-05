import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import type { ChoiceQuestion, NumericQuestion } from './task';

// Фикстуры независимы от контента приложения: ожидания — известные литералы,
// а не значения, пересчитанные тем же способом, что и проверяемый код.
const question: ChoiceQuestion = {
  kind: 'choice-question',
  id: 'fixture-01',
  prompt: 'Какое напряжение на резисторе 1 кОм при токе 5 мА?',
  choices: [
    {
      id: 'mv',
      text: '5 мВ',
      razbor:
        'Ошибка мышления: милиамперы умножены на килоомы «в лоб» без перевода в базовые единицы.',
    },
    {
      id: 'v',
      text: '5 В',
      razbor: 'Верно: U = I·R = 0,005 А · 1000 Ом = 5 В.',
    },
    {
      id: 'kv',
      text: '5 кВ',
      razbor: 'Ошибка мышления: приставки перепутаны местами — килоом посчитан как кило-ответ.',
    },
  ],
  correctChoiceId: 'v',
};

describe('evaluate: Вопрос с выбором варианта', () => {
  it('верный вариант → вердикт correct', () => {
    const verdict = evaluate(question, { kind: 'choice-answer', chosenChoiceId: 'v' });
    expect(verdict.outcome).toBe('correct');
    if (verdict.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(verdict.chosenChoiceId).toBe('v');
  });

  it('неверный вариант → вердикт incorrect', () => {
    const verdict = evaluate(question, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    expect(verdict.outcome).toBe('incorrect');
  });

  it('возвращает Разбор к каждому варианту, не только к выбранному', () => {
    const verdict = evaluate(question, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    if (verdict.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(verdict.reviews.map((r) => r.choiceId)).toEqual(['mv', 'v', 'kv']);
    expect(verdict.reviews.map((r) => r.razbor)).toEqual([
      'Ошибка мышления: милиамперы умножены на килоомы «в лоб» без перевода в базовые единицы.',
      'Верно: U = I·R = 0,005 А · 1000 Ом = 5 В.',
      'Ошибка мышления: приставки перепутаны местами — килоом посчитан как кило-ответ.',
    ]);
  });

  it('помечает верным Разбор только верного варианта', () => {
    const verdict = evaluate(question, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    if (verdict.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(verdict.reviews.map((r) => r.isCorrect)).toEqual([false, true, false]);
  });

  it('Ответ с несуществующим вариантом — ошибка контракта', () => {
    expect(() => evaluate(question, { kind: 'choice-answer', chosenChoiceId: 'нет-такого' })).toThrow();
  });
});

const numericQuestion: NumericQuestion = {
  kind: 'numeric-question',
  id: 'fixture-num-01',
  prompt: 'Чему равен ток через резистор 1 кОм при напряжении 10 В?',
  unit: 'А',
  expectedValue: 0.01,
  razbor: 'Верно: I = U / R = 10 В / 1000 Ом = 0,01 А = 10 мА.',
  solutionSteps: [
    'Закон Ома: I = U / R.',
    '1 кОм = 1000 Ом.',
    'I = 10 В / 1000 Ом = 0,01 А.',
  ],
};

describe('evaluate: числовой Вопрос', () => {
  it('верный ответ → вердикт correct с подтверждающим Разбором', () => {
    const verdict = evaluate(numericQuestion, { kind: 'numeric-answer', value: 0.01 });
    expect(verdict.outcome).toBe('correct');
    if (verdict.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(verdict.answeredValue).toBe(0.01);
    expect(verdict.razbor).toContain('Верно');
  });

  it('неверный ответ → вердикт incorrect с пошаговым решением', () => {
    const verdict = evaluate(numericQuestion, { kind: 'numeric-answer', value: 1 });
    expect(verdict.outcome).toBe('incorrect');
    if (verdict.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(verdict.solutionSteps).toHaveLength(3);
  });

  it('допуск по умолчанию ±5%: граница диапазона принимается, шаг за ней — нет', () => {
    const atLowerBound = evaluate(numericQuestion, { kind: 'numeric-answer', value: 0.0095 });
    const atUpperBound = evaluate(numericQuestion, { kind: 'numeric-answer', value: 0.0105 });
    const belowBounds = evaluate(numericQuestion, { kind: 'numeric-answer', value: 0.0094 });
    const aboveBounds = evaluate(numericQuestion, { kind: 'numeric-answer', value: 0.0106 });
    expect(atLowerBound.outcome).toBe('correct');
    expect(atUpperBound.outcome).toBe('correct');
    expect(belowBounds.outcome).toBe('incorrect');
    expect(aboveBounds.outcome).toBe('incorrect');
  });

  it('Задание переопределяет допуск: ±20% вместо ±5%', () => {
    const withTolerance: NumericQuestion = { ...numericQuestion, tolerance: 0.2 };
    expect(evaluate(withTolerance, { kind: 'numeric-answer', value: 0.012 }).outcome).toBe('correct');
    expect(evaluate(withTolerance, { kind: 'numeric-answer', value: 0.008 }).outcome).toBe('correct');
    expect(evaluate(withTolerance, { kind: 'numeric-answer', value: 0.0121 }).outcome).toBe('incorrect');
  });

  it('допуск 0 — только точное значение', () => {
    const exact: NumericQuestion = { ...numericQuestion, tolerance: 0 };
    expect(evaluate(exact, { kind: 'numeric-answer', value: 0.01 }).outcome).toBe('correct');
    expect(evaluate(exact, { kind: 'numeric-answer', value: 0.0101 }).outcome).toBe('incorrect');
  });

  it('вердикт называет принятый диапазон и эффективный допуск', () => {
    const verdict = evaluate(numericQuestion, { kind: 'numeric-answer', value: 1 });
    if (verdict.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(verdict.acceptedFrom).toBeCloseTo(0.0095, 10);
    expect(verdict.acceptedTo).toBeCloseTo(0.0105, 10);
    expect(verdict.tolerance).toBe(0.05);
  });

  it('Ответ чужого вида — ошибка контракта', () => {
    expect(() => evaluate(numericQuestion, { kind: 'choice-answer', chosenChoiceId: 'v' })).toThrow();
    expect(() => evaluate(question, { kind: 'numeric-answer', value: 1 })).toThrow();
  });

  it('Схема-задание честно сообщает, что проверка появится с Симулятором (тикет 05)', () => {
    const circuitTask = {
      kind: 'circuit-task',
      id: 'demo',
      prompt: 'Соберите цепь',
      palette: ['battery', 'lamp'],
    } as const;
    expect(() => evaluate(circuitTask, { kind: 'choice-answer', chosenChoiceId: 'v' })).toThrow(
      /Симулятором/,
    );
  });
});
