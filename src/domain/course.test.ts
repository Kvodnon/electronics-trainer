import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  isModuleLocked,
  moduleProgressOf,
  moduleTaskQueue,
  progressReducer,
  taskStateOf,
} from './course';
import type { CourseData, CourseProgress } from './course';
import type { Task } from './task';

// Фикстура: Курс из двух Модулей — по два Задания в каждом.
// Реальный контент М1/М2 живёт в src/content и тестами редьюсера не используется.

function makeTask(id: string): Task {
  return {
    kind: 'choice-question',
    id,
    prompt: `Вопрос ${id}`,
    choices: [{ id: 'yes', text: 'да', razbor: 'разбор' }],
    correctChoiceId: 'yes',
  };
}

const course: CourseData = {
  modules: [
    { id: 'm1', title: 'Основы DC', summary: '', theory: [], tasks: [makeTask('m1-a'), makeTask('m1-b')] },
    { id: 'm2', title: 'Компоненты', summary: '', theory: [], tasks: [makeTask('m2-a')] },
  ],
};

function passed(...taskIds: string[]): CourseProgress {
  return taskIds.reduce(
    (progress, taskId) => progressReducer(progress, { type: 'task-passed', taskId }),
    emptyProgress,
  );
}

describe('Прогресс: состояния Заданий', () => {
  it('неизвестное Задание — «не начато»', () => {
    expect(taskStateOf(emptyProgress, 'm1-a')).toBe('not-started');
  });

  it('прохождение Задания отмечает его пройденным', () => {
    const progress = progressReducer(emptyProgress, { type: 'task-passed', taskId: 'm1-a' });
    expect(taskStateOf(progress, 'm1-a')).toBe('passed');
    expect(taskStateOf(progress, 'm1-b')).toBe('not-started');
  });

  it('повторное прохождение — идемпотентно', () => {
    const progress = passed('m1-a');
    const again = progressReducer(progress, { type: 'task-passed', taskId: 'm1-a' });
    expect(taskStateOf(again, 'm1-a')).toBe('passed');
  });

  it('ошибка отправляет Задание на повтор', () => {
    const progress = progressReducer(emptyProgress, {
      type: 'task-returned-for-retry',
      taskId: 'm1-a',
    });
    expect(taskStateOf(progress, 'm1-a')).toBe('returned-for-retry');
  });

  it('пройденное Задание не возвращается на повтор — «пройдено» терминально', () => {
    const progress = passed('m1-a');
    const after = progressReducer(progress, { type: 'task-returned-for-retry', taskId: 'm1-a' });
    expect(taskStateOf(after, 'm1-a')).toBe('passed');
  });

  it('редьюсер не мутирует предыдущее состояние', () => {
    const progress = passed('m1-a');
    const copy = structuredClone(progress);
    progressReducer(progress, { type: 'task-passed', taskId: 'm1-b' });
    expect(progress).toEqual(copy);
  });
});

describe('Прогресс Модуля', () => {
  it('считает пройденные Задания и завершённость', () => {
    const progress = passed('m1-a');
    const moduleProgress = moduleProgressOf(course.modules[0], progress);
    expect(moduleProgress.total).toBe(2);
    expect(moduleProgress.passed).toBe(1);
    expect(moduleProgress.completed).toBe(false);
  });

  it('все Задания пройдены — Модуль завершён', () => {
    const progress = passed('m1-a', 'm1-b');
    expect(moduleProgressOf(course.modules[0], progress).completed).toBe(true);
  });

  it('Задание на повторении не даёт Модулю завершиться', () => {
    const progress = progressReducer(passed('m1-a'), {
      type: 'task-returned-for-retry',
      taskId: 'm1-b',
    });
    const moduleProgress = moduleProgressOf(course.modules[0], progress);
    expect(moduleProgress.completed).toBe(false);
    expect(moduleProgress.returnedForRetry).toBe(1);
  });
});

describe('Блокировка Модулей', () => {
  it('первый Модуль открыт сразу', () => {
    expect(isModuleLocked(course, emptyProgress, 'm1')).toBe(false);
  });

  it('следующий Модуль заблокирован, пока предыдущий не пройден', () => {
    expect(isModuleLocked(course, emptyProgress, 'm2')).toBe(true);
    expect(isModuleLocked(course, passed('m1-a'), 'm2')).toBe(true);
  });

  it('прохождение предыдущего Модуля разблокирует следующий', () => {
    expect(isModuleLocked(course, passed('m1-a', 'm1-b'), 'm2')).toBe(false);
  });

  it('неизвестный Модуль — ошибка контракта, а не «заблокирован»', () => {
    expect(() => isModuleLocked(course, emptyProgress, 'нет-такого')).toThrow();
  });

  it('Модуль без Заданий не блокирует Курс навсегда', () => {
    const courseWithEmptyModule: CourseData = {
      modules: [
        { id: 'пустой', title: 'Пустой', summary: '', theory: [], tasks: [] },
        { id: 'm2', title: 'Компоненты', summary: '', theory: [], tasks: [makeTask('m2-a')] },
      ],
    };
    expect(moduleProgressOf(courseWithEmptyModule.modules[0], emptyProgress).completed).toBe(true);
    expect(isModuleLocked(courseWithEmptyModule, emptyProgress, 'm2')).toBe(false);
  });
});

describe('Очередь Заданий Модуля', () => {
  it('в начале — все непройденные Задания в порядке Модуля', () => {
    const queue = moduleTaskQueue(course.modules[0], emptyProgress);
    expect(queue.map((task) => task.id)).toEqual(['m1-a', 'm1-b']);
  });

  it('пройденные Задания выпадают из очереди', () => {
    const queue = moduleTaskQueue(course.modules[0], passed('m1-a'));
    expect(queue.map((task) => task.id)).toEqual(['m1-b']);
  });

  it('Задание на повторении встаёт в конец, даже если в Модуле оно было первым', () => {
    const progress = progressReducer(emptyProgress, {
      type: 'task-returned-for-retry',
      taskId: 'm1-a',
    });
    // m1-a вернулось на повтор, m1-b ещё не начато — вперёд идёт не начатое
    const queue = moduleTaskQueue(course.modules[0], progress);
    expect(queue.map((task) => task.id)).toEqual(['m1-b', 'm1-a']);
  });

  it('пустая queue — Модуль пройден', () => {
    expect(moduleTaskQueue(course.modules[0], passed('m1-a', 'm1-b'))).toEqual([]);
  });
});
