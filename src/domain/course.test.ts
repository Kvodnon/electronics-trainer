import { describe, expect, it } from 'vitest';
import {
  emptyProgress,
  examOf,
  isExamUnlocked,
  isModuleLocked,
  modulePaletteOf,
  moduleProgressOf,
  moduleTaskQueue,
  progressReducer,
  sandboxPaletteOf,
  solvedOnFirstAttemptOf,
  taskStateOf,
} from './course';
import type { CourseData, CourseProgress } from './course';
import type { ComponentKind } from './canvas';
import type { CircuitTask, Task } from './task';

// Фикстура: Курс из двух Модулей; в первом — два Вопроса и Экзамен.
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

function makeExam(id: string): CircuitTask {
  return {
    kind: 'circuit-task',
    id,
    isExam: true,
    prompt: `Экзамен ${id}`,
    palette: ['battery'],
    conditions: [],
  };
}

const course: CourseData = {
  modules: [
    {
      id: 'm1',
      title: 'Основы DC',
      summary: '',
      theory: [],
      tasks: [makeTask('m1-a'), makeTask('m1-b'), makeExam('m1-exam')],
    },
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

describe('Прогресс: сброс и восстановление', () => {
  it('«начать заново» возвращает пустой Прогресс', () => {
    const progress = progressReducer(passed('m1-a'), {
      type: 'task-returned-for-retry',
      taskId: 'm1-b',
    });
    const after = progressReducer(progress, { type: 'progress-reset' });
    expect(after).toEqual(emptyProgress);
  });

  it('импортированный Прогресс заменяет текущий целиком', () => {
    const imported: CourseProgress = {
      taskStates: { 'm2-x': 'passed', 'm2-y': 'returned-for-retry' },
      failedOnce: { 'm2-y': true },
    };
    const after = progressReducer(passed('m1-a'), { type: 'progress-restored', progress: imported });
    expect(after).toBe(imported);
    expect(taskStateOf(after, 'm1-a')).toBe('not-started');
    expect(solvedOnFirstAttemptOf(after, 'm2-x')).toBe(true);
    expect(taskStateOf(after, 'm2-y')).toBe('returned-for-retry');
  });
});

describe('Прогресс Модуля', () => {
  it('считает пройденные Задания и завершённость', () => {
    const progress = passed('m1-a');
    const moduleProgress = moduleProgressOf(course.modules[0], progress);
    expect(moduleProgress.total).toBe(3);
    expect(moduleProgress.passed).toBe(1);
    expect(moduleProgress.completed).toBe(false);
  });

  it('все Задания пройдены — Модуль завершён', () => {
    const progress = passed('m1-a', 'm1-b', 'm1-exam');
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
    expect(isModuleLocked(course, passed('m1-a', 'm1-b', 'm1-exam'), 'm2')).toBe(false);
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
    expect(moduleTaskQueue(course.modules[0], passed('m1-a', 'm1-b', 'm1-exam'))).toEqual([]);
  });
});

describe('Экзамен Модуля', () => {
  it('экзамен — последнее Схема-задание Модуля, помеченное как Экзамен', () => {
    expect(examOf(course.modules[0])?.id).toBe('m1-exam');
    expect(examOf(course.modules[1])).toBeNull();
  });

  it('экзамен закрыт, пока не закрыты остальные Задания Модуля', () => {
    expect(isExamUnlocked(course.modules[0], emptyProgress)).toBe(false);
    expect(isExamUnlocked(course.modules[0], passed('m1-a'))).toBe(false);

    const queue = moduleTaskQueue(course.modules[0], emptyProgress);
    expect(queue.map((task) => task.id)).toEqual(['m1-a', 'm1-b']);
  });

  it('все остальные Задания закрыты — экзамен последний в очереди, Модуль ещё не завершён', () => {
    const progress = passed('m1-a', 'm1-b');
    expect(isExamUnlocked(course.modules[0], progress)).toBe(true);
    expect(moduleTaskQueue(course.modules[0], progress).map((task) => task.id)).toEqual(['m1-exam']);
    expect(moduleProgressOf(course.modules[0], progress).completed).toBe(false);
    expect(isModuleLocked(course, progress, 'm2')).toBe(true);
  });

  it('прохождение Экзамена завершает Модуль и открывает следующий', () => {
    const progress = passed('m1-a', 'm1-b', 'm1-exam');
    expect(moduleProgressOf(course.modules[0], progress).completed).toBe(true);
    expect(isModuleLocked(course, progress, 'm2')).toBe(false);
  });

  it('ошибенное на Экзамене возвращается на повтор и не выпускает из Модуля', () => {
    const progress = progressReducer(passed('m1-a', 'm1-b'), {
      type: 'task-returned-for-retry',
      taskId: 'm1-exam',
    });
    expect(moduleTaskQueue(course.modules[0], progress).map((task) => task.id)).toEqual(['m1-exam']);
    expect(moduleProgressOf(course.modules[0], progress).completed).toBe(false);
  });

  it('экзамен на повторении не блокирует очередь остальных Заданий', () => {
    // Экзамен в повторе возможен только после остальных, но контракт очереди
    // не должен зависеть от порядка появления ошибок
    const progress = progressReducer(passed('m1-a'), {
      type: 'task-returned-for-retry',
      taskId: 'm1-b',
    });
    expect(moduleTaskQueue(course.modules[0], progress).map((task) => task.id)).toEqual(['m1-b']);
  });
});

describe('Решено с первой попытки', () => {
  it('непройденное Задание — не «с первой попытки»', () => {
    expect(solvedOnFirstAttemptOf(emptyProgress, 'm1-a')).toBe(false);
  });

  it('пройдено без единой ошибки — с первой попытки', () => {
    expect(solvedOnFirstAttemptOf(passed('m1-a'), 'm1-a')).toBe(true);
  });

  it('ошибка, затем прохождение — не с первой попытки', () => {
    const progress = progressReducer(emptyProgress, {
      type: 'task-returned-for-retry',
      taskId: 'm1-a',
    });
    const solved = progressReducer(progress, { type: 'task-passed', taskId: 'm1-a' });
    expect(solvedOnFirstAttemptOf(solved, 'm1-a')).toBe(false);
  });

  it('неудачная проверка Схема-задания (без ухода из Задания) тоже ломает «первую попытку»', () => {
    const afterFailure = progressReducer(emptyProgress, { type: 'attempt-failed', taskId: 'm1-exam' });
    expect(taskStateOf(afterFailure, 'm1-exam')).toBe('not-started');
    expect(moduleTaskQueue(course.modules[0], afterFailure).map((task) => task.id)).toEqual([
      'm1-a',
      'm1-b',
    ]);

    const solved = progressReducer(afterFailure, { type: 'task-passed', taskId: 'm1-exam' });
    expect(solvedOnFirstAttemptOf(solved, 'm1-exam')).toBe(false);
  });

  it('неудачная попытка на пройденном Задании статистику не портит', () => {
    const progress = passed('m1-a');
    const after = progressReducer(progress, { type: 'attempt-failed', taskId: 'm1-a' });
    expect(solvedOnFirstAttemptOf(after, 'm1-a')).toBe(true);
    expect(taskStateOf(after, 'm1-a')).toBe('passed');
  });

  it('повторная неудачная попытка не меняет состояние (идемпотентность и чистота)', () => {
    const progress = progressReducer(emptyProgress, { type: 'attempt-failed', taskId: 'm1-a' });
    const copy = structuredClone(progress);
    const again = progressReducer(progress, { type: 'attempt-failed', taskId: 'm1-a' });
    expect(again).toBe(progress);
    expect(progress).toEqual(copy);
  });

  it('Прогресс Модуля считает решённые с первой попытки', () => {
    const withRetry = progressReducer(emptyProgress, {
      type: 'task-returned-for-retry',
      taskId: 'm1-b',
    });
    const progress = progressReducer(withRetry, { type: 'task-passed', taskId: 'm1-a' });
    const moduleProgress = moduleProgressOf(course.modules[0], progress);
    expect(moduleProgress.passed).toBe(1);
    expect(moduleProgress.solvedOnFirstAttempt).toBe(1);
  });
});

describe('Палитра Песочницы: растёт с Прогрессом Курса', () => {
  // Фикстура с различающимися Палитрами: у М2 — свои Компоненты.
  function makeCircuit(id: string, palette: readonly ComponentKind[]): CircuitTask {
    return { kind: 'circuit-task', id, prompt: id, palette, conditions: [] };
  }

  const paletteCourse: CourseData = {
    modules: [
      {
        id: 'p1',
        title: 'Первый',
        summary: '',
        theory: [],
        tasks: [makeTask('p1-q'), makeCircuit('p1-c', ['battery', 'resistor'])],
      },
      {
        id: 'p2',
        title: 'Второй',
        summary: '',
        theory: [],
        tasks: [makeCircuit('p2-c', ['battery', 'lamp', 'switch'])],
      },
    ],
  };

  it('Палитра Модуля — объединение Палитр его Схема-заданий', () => {
    expect(modulePaletteOf(paletteCourse.modules[0])).toEqual(['battery', 'resistor']);
  });

  it('в начале Курса открыта только Палитра первого Модуля', () => {
    expect(sandboxPaletteOf(paletteCourse, emptyProgress)).toEqual(['battery', 'resistor']);
  });

  it('после прохождения Модуля его Компоненты остаются, Компоненты следующего открываются', () => {
    const progress = passed('p1-q', 'p1-c');
    expect(sandboxPaletteOf(paletteCourse, progress)).toEqual([
      'battery',
      'resistor',
      'lamp',
      'switch',
    ]);
  });

  it('дубликаты видов между Модулями не задваиваются, порядок устойчив', () => {
    const progress = passed('p1-q', 'p1-c');
    expect(sandboxPaletteOf(course, progress)).toEqual(
      sandboxPaletteOf(course, passed(...course.modules.flatMap((m) => m.tasks.map((t) => t.id)))),
    );
  });
});
