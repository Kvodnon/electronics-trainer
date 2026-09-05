import { describe, expect, it } from 'vitest';
import { evaluate } from './evaluate';
import type { ChoiceQuestion } from './task';

// Фикстура независима от контента приложения: ожидания — известные литералы,
// а не значения, пересчитанные тем же способом, что и проверяемый код.
const вопрос: ChoiceQuestion = {
  kind: 'choice-question',
  id: 'fixture-01',
  prompt: 'Какое напряжение на резисторе 1 кОм при токе 5 мА?',
  choices: [
    {
      id: 'mv',
      text: '5 мВ',
      explanation:
        'Ошибка мышления: милиамперы умножены на килоомы «в лоб» без перевода в базовые единицы.',
    },
    {
      id: 'v',
      text: '5 В',
      explanation: 'Верно: U = I·R = 0,005 А · 1000 Ом = 5 В.',
    },
    {
      id: 'kv',
      text: '5 кВ',
      explanation: 'Ошибка мышления: приставки перепутаны местами — килоом посчитан как кило-ответ.',
    },
  ],
  correctChoiceId: 'v',
};

describe('evaluate: Вопрос с выбором варианта', () => {
  it('верный вариант → вердикт correct', () => {
    const вердикт = evaluate(вопрос, { chosenChoiceId: 'v' });
    expect(вердикт.outcome).toBe('correct');
  });

  it('неверный вариант → вердикт incorrect', () => {
    const вердикт = evaluate(вопрос, { chosenChoiceId: 'mv' });
    expect(вердикт.outcome).toBe('incorrect');
  });

  it('возвращает Разбор к каждому варианту, не только к выбранному', () => {
    const вердикт = evaluate(вопрос, { chosenChoiceId: 'mv' });
    expect(вердикт.reviews.map((r) => r.choiceId)).toEqual(['mv', 'v', 'kv']);
    expect(вердикт.reviews.map((r) => r.explanation)).toEqual([
      'Ошибка мышления: милиамперы умножены на килоомы «в лоб» без перевода в базовые единицы.',
      'Верно: U = I·R = 0,005 А · 1000 Ом = 5 В.',
      'Ошибка мышления: приставки перепутаны местами — килоом посчитан как кило-ответ.',
    ]);
  });

  it('помечает верным Разбор только верного варианта', () => {
    const вердикт = evaluate(вопрос, { chosenChoiceId: 'mv' });
    expect(вердикт.reviews.map((r) => r.isCorrect)).toEqual([false, true, false]);
  });

  it('Ответ с несуществующим вариантом — ошибка контракта', () => {
    expect(() => evaluate(вопрос, { chosenChoiceId: 'нет-такого' })).toThrow();
  });
});
