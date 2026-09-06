import { blockingModuleOf, moduleProgressOf } from '../domain/course';
import type { CourseData, CourseProgress } from '../domain/course';
import { ModuleProgressLine } from './ModuleProgressLine';

interface CourseScreenProps {
  course: CourseData;
  progress: CourseProgress;
  onEnterModule: (moduleId: string) => void;
  /** Песочница доступна с самого начала Курса. */
  onOpenSandbox: () => void;
}

/**
 * Экран Курса: главный меню Тренажёра. Наверху — вход в Песочницу, ниже —
 * линейный список Модулей. Следующий Модуль заблокирован, пока не пройден
 * предыдущий; у каждого Модуля виден его Прогресс.
 */
export function CourseScreen({ course, progress, onEnterModule, onOpenSandbox }: CourseScreenProps) {
  return (
    <section className="course" aria-labelledby="course-heading">
      <h2 id="course-heading">Курс</h2>
      <p className="course-subtitle">
        Следующий Модуль открывается после прохождения предыдущего.
      </p>

      <section className="panel sandbox-entry" aria-labelledby="sandbox-entry-heading">
        <div className="sandbox-entry-text">
          <h3 id="sandbox-entry-heading" className="module-title">
            Песочница
          </h3>
          <p className="module-summary">
            Свободные эксперименты без Заданий и проверки: Палитра открытых Компонентов,
            Симулятор, Мультиметр и ваши сохранённые схемы.
          </p>
        </div>
        <button type="button" className="button-primary" onClick={onOpenSandbox}>
          Открыть
        </button>
      </section>

      <ul className="module-list">
        {course.modules.map((module, index) => {
          const moduleProgress = moduleProgressOf(module, progress);
          const blocker = blockingModuleOf(course, progress, module.id);
          const actionLabel =
            blocker !== null
              ? 'Заблокирован'
              : moduleProgress.completed
                ? 'Повторить'
                : moduleProgress.passed > 0 || moduleProgress.returnedForRetry > 0
                  ? 'Продолжить'
                  : 'Начать';

          return (
            <li
              key={module.id}
              className={`module-card ${blocker !== null ? 'module-card-locked' : ''}`}
            >
              <div className="module-head">
                <p className="module-index">Модуль {index + 1}</p>
                <h3 className="module-title">{module.title}</h3>
                {moduleProgress.completed && <span className="chip chip-correct">Пройден</span>}
              </div>
              <p className="module-summary">{module.summary}</p>
              <ModuleProgressLine progress={moduleProgress} />
              {blocker && (
                <p className="module-lock-hint">Откроется после Модуля «{blocker.title}»</p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={blocker !== null}
                onClick={() => onEnterModule(module.id)}
              >
                {actionLabel}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
