import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import type { ChoiceQuestion, NumericQuestion } from './task';

// Фикстуры независимы от контента приложения: ожидания — известные литералы,
// а не значения, пересчитанные тем же способом, что и проверяемый код.
const вопрос: ChoiceQuestion = {
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
    const вердикт = evaluate(вопрос, { kind: 'choice-answer', chosenChoiceId: 'v' });
    expect(вердикт.outcome).toBe('correct');
    if (вердикт.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(вердикт.chosenChoiceId).toBe('v');
  });

  it('неверный вариант → вердикт incorrect', () => {
    const вердикт = evaluate(вопрос, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    expect(вердикт.outcome).toBe('incorrect');
  });

  it('возвращает Разбор к каждому варианту, не только к выбранному', () => {
    const вердикт = evaluate(вопрос, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    if (вердикт.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(вердикт.reviews.map((r) => r.choiceId)).toEqual(['mv', 'v', 'kv']);
    expect(вердикт.reviews.map((r) => r.razbor)).toEqual([
      'Ошибка мышления: милиамперы умножены на килоомы «в лоб» без перевода в базовые единицы.',
      'Верно: U = I·R = 0,005 А · 1000 Ом = 5 В.',
      'Ошибка мышления: приставки перепутаны местами — килоом посчитан как кило-ответ.',
    ]);
  });

  it('помечает верным Разбор только верного варианта', () => {
    const вердикт = evaluate(вопрос, { kind: 'choice-answer', chosenChoiceId: 'mv' });
    if (вердикт.kind !== 'choice-question') throw new Error('ожидался вердикт выбора');
    expect(вердикт.reviews.map((r) => r.isCorrect)).toEqual([false, true, false]);
  });

  it('Ответ с несуществующим вариантом — ошибка контракта', () => {
    expect(() => evaluate(вопрос, { kind: 'choice-answer', chosenChoiceId: 'нет-такого' })).toThrow();
  });
});

const числовойВопрос: NumericQuestion = {
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
    const вердикт = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 0.01 });
    expect(вердикт.outcome).toBe('correct');
    if (вердикт.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(вердикт.answeredValue).toBe(0.01);
    expect(вердикт.razbor).toContain('Верно');
  });

  it('неверный ответ → вердикт incorrect с пошаговым решением', () => {
    const вердикт = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 1 });
    expect(вердикт.outcome).toBe('incorrect');
    if (вердикт.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(вердикт.solutionSteps).toHaveLength(3);
  });

  it('допуск по умолчанию ±5%: граница диапазона принимается, шаг за ней — нет', () => {
    const нижняя = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 0.0095 });
    const верхняя = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 0.0105 });
    const нижеГраницы = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 0.0094 });
    const вышеГраницы = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 0.0106 });
    expect(нижняя.outcome).toBe('correct');
    expect(верхняя.outcome).toBe('correct');
    expect(нижеГраницы.outcome).toBe('incorrect');
    expect(вышеГраницы.outcome).toBe('incorrect');
  });

  it('Задание переопределяет допуск: ±20% вместо ±5%', () => {
    const сДопуском: NumericQuestion = { ...числовойВопрос, tolerance: 0.2 };
    expect(evaluate(сДопуском, { kind: 'numeric-answer', value: 0.012 }).outcome).toBe('correct');
    expect(evaluate(сДопуском, { kind: 'numeric-answer', value: 0.008 }).outcome).toBe('correct');
    expect(evaluate(сДопуском, { kind: 'numeric-answer', value: 0.0121 }).outcome).toBe('incorrect');
  });

  it('допуск 0 — только точное значение', () => {
    const точный: NumericQuestion = { ...числовойВопрос, tolerance: 0 };
    expect(evaluate(точный, { kind: 'numeric-answer', value: 0.01 }).outcome).toBe('correct');
    expect(evaluate(точный, { kind: 'numeric-answer', value: 0.0101 }).outcome).toBe('incorrect');
  });

  it('вердикт называет принятый диапазон и эффективный допуск', () => {
    const вердикт = evaluate(числовойВопрос, { kind: 'numeric-answer', value: 1 });
    if (вердикт.kind !== 'numeric-question') throw new Error('ожидался числовой вердикт');
    expect(вердикт.acceptedFrom).toBeCloseTo(0.0095, 10);
    expect(вердикт.acceptedTo).toBeCloseTo(0.0105, 10);
    expect(вердикт.tolerance).toBe(0.05);
  });

  it('Ответ чужого вида — ошибка контракта', () => {
    expect(() => evaluate(числовойВопрос, { kind: 'choice-answer', chosenChoiceId: 'v' })).toThrow();
    expect(() => evaluate(вопрос, { kind: 'numeric-answer', value: 1 })).toThrow();
  });
});
