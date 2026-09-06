import { useEffect, useReducer, useState } from 'react';
import { CourseScreen } from './components/CourseScreen';
import { ModuleScreen } from './components/ModuleScreen';
import { course } from './content/course';
import { emptyProgress, progressReducer } from './domain/course';
import { defaultSymbolStandard, type SymbolStandard } from './domain/symbols';
import { loadProgress, saveProgress } from './storage/progressStorage';
import { loadSymbolStandard, saveSymbolStandard } from './storage/symbolStandardStorage';

/**
 * Каркас Тренажёра: экран Курса ↔ экран Модуля (Теория → Задания).
 * Прогресс и выбранный стандарт обозначений живут в редьюсере/состоянии
 * и автоматически сохраняются между сессиями — перезагрузка страницы
 * ничего не теряет.
 */
export function App() {
  const [progress, dispatch] = useReducer(progressReducer, null, () => {
    const saved = loadProgress();
    return saved ?? emptyProgress;
  });
  /** Стандарт обозначений Холста: выбор в Задании, по умолчанию — ГОСТ. */
  const [symbolStandard, setSymbolStandard] = useState<SymbolStandard>(
    () => loadSymbolStandard() ?? defaultSymbolStandard,
  );
  const [moduleId, setModuleId] = useState<string | null>(null);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  function handleSymbolStandardChange(standard: SymbolStandard) {
    setSymbolStandard(standard);
    saveSymbolStandard(standard);
  }

  const module =
    moduleId === null ? null : (course.modules.find((m) => m.id === moduleId) ?? null);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Электроника с нуля</h1>
        <p className="app-subtitle">Тренажёр: курс, вопросы и схемы</p>
      </header>

      <main>
        {module ? (
          <ModuleScreen
            key={module.id}
            module={module}
            progress={progress}
            symbolStandard={symbolStandard}
            onSymbolStandardChange={handleSymbolStandardChange}
            onProgressAction={dispatch}
            onExit={() => setModuleId(null)}
          />
        ) : (
          <CourseScreen course={course} progress={progress} onEnterModule={setModuleId} />
        )}
      </main>
    </div>
  );
}
