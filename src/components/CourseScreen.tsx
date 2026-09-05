import { isModuleLocked, moduleProgressOf } from '../domain/course';
import type { CourseData, CourseProgress } from '../domain/course';

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
          const locked = isModuleLocked(course, progress, module.id);
          const первыйНепройденный =
                course.modules
                  .slice(0, index)
                  .find((предыдущий) => !moduleProgressOf(предыдущий, progress).completed);
          const actionLabel = locked
            ? 'Заблокирован'
            : итог.completed
              ? 'Повторить'
              : итог.passed > 0 || итог.returnedForRetry > 0
                ? 'Продолжить'
                : 'Начать';

          return (
            <li
              key={module.id}
              className={`module-card ${locked ? 'module-card-locked' : ''}`}
            >
              <div className="module-head">
                <p className="module-index">Модуль {index + 1}</p>
                <h3 className="module-title">{module.title}</h3>
                {итог.completed && <span className="chip chip-correct">Пройден</span>}
              </div>
              <p className="module-summary">{module.summary}</p>
              <p className="module-progress">
                Заданий пройдено: {итог.passed} из {итог.total}
                {итог.returnedForRetry > 0 && (
                  <span className="module-progress-retry">
                    {' '}
                    · на повторении: {итог.returnedForRetry}
                  </span>
                )}
              </p>
              {locked && первыйНепройденный && (
                <p className="module-lock-hint">
                  Откроется после Модуля «{первыйНепройденный.title}»
                </p>
              )}
              <button
                type="button"
                className="button-primary"
                disabled={locked}
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
