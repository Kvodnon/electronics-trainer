import { blockingModuleOf, moduleProgressOf } from '../domain/course';
import type { CourseData, CourseProgress } from '../domain/course';
import { ModuleProgressLine } from './ModuleProgressLine';

interface CourseScreenProps {
  course: CourseData;
  progress: CourseProgress;
  onEnterModule: (moduleId: string) => void;
}

/**
 * Экран Курса: линейный список Модулей. Следующий Модуль заблокирован,
 * пока не пройден предыдущий; у каждого Модуля виден его Прогресс.
 */
export function CourseScreen({ course, progress, onEnterModule }: CourseScreenProps) {
  return (
    <section className="course" aria-labelledby="course-heading">
      <h2 id="course-heading">Курс</h2>
      <p className="course-subtitle">
        Следующий Модуль открывается после прохождения предыдущего.
      </p>

      <ul className="module-list">
        {course.modules.map((module, index) => {
          const итог = moduleProgressOf(module, progress);
          const блокирующий = blockingModuleOf(course, progress, module.id);
          const actionLabel =
            блокирующий !== null
              ? 'Заблокирован'
              : итог.completed
                ? 'Повторить'
                : итог.passed > 0 || итог.returnedForRetry > 0
                  ? 'Продолжить'
                  : 'Начать';

          return (
            <li
              key={module.id}
              className={`module-card ${блокирующий !== null ? 'module-card-locked' : ''}`}
            >
              <div className="module-head">
                <p className="module-index">Модуль {index + 1}</p>
                <h3 className="module-title">{module.title}</h3>
                {итог.completed && <span className="chip chip-correct">Пройден</span>}
              </div>
              <p className="module-summary">{module.summary}</p>
              <ModuleProgressLine progress={итог} />
              {блокирующий && (
                <p className="module-lock-hint">Откроется после Модуля «{блокирующий.title}»</p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={блокирующий !== null}
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
