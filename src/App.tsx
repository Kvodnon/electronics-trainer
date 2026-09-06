import { useEffect, useReducer, useState } from 'react';
import { CourseScreen } from './components/CourseScreen';
import { ModuleScreen } from './components/ModuleScreen';
import { SandboxScreen } from './components/SandboxScreen';
import { course } from './content/course';
import { emptyProgress, progressReducer, sandboxPaletteOf } from './domain/course';
import { upsertCircuit } from './domain/sandbox';
import type { CanvasState } from './domain/canvas';
import { defaultSymbolStandard, type SymbolStandard } from './domain/symbols';
import { loadProgress, saveProgress } from './storage/progressStorage';
import { loadSandboxCircuits, saveSandboxCircuits } from './storage/sandboxStorage';
import { loadSymbolStandard, saveSymbolStandard } from './storage/symbolStandardStorage';

/**
 * Каркас Тренажёра: экран Курса (с входом в Песочницу) ↔ экран Модуля
 * (Теория → Задания). Прогресс, схемы Песочницы и выбранный стандарт
 * обозначений живут в редьюсере/состоянии и автоматически сохраняются
 * между сессиями — перезагрузка страницы ничего не теряет.
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
  /** Схемы Песочницы: тот же localStorage, что и у Прогресса. */
  const [circuits, setCircuits] = useState(() => loadSandboxCircuits());
  const [moduleId, setModuleId] = useState<string | null>(null);
  const [sandboxOpen, setSandboxOpen] = useState(false);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    saveSandboxCircuits(circuits);
  }, [circuits]);

  function handleSymbolStandardChange(standard: SymbolStandard) {
    setSymbolStandard(standard);
    saveSymbolStandard(standard);
  }

  function handleSaveCircuit(name: string, canvas: CanvasState) {
    setCircuits((current) => upsertCircuit(current, name, canvas));
  }

  function handleDeleteCircuit(circuitId: string) {
    setCircuits((current) => current.filter((circuit) => circuit.id !== circuitId));
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
        {sandboxOpen ? (
          <SandboxScreen
            palette={sandboxPaletteOf(course, progress)}
            circuits={circuits}
            onSaveCircuit={handleSaveCircuit}
            onDeleteCircuit={handleDeleteCircuit}
            symbolStandard={symbolStandard}
            onSymbolStandardChange={handleSymbolStandardChange}
            onExit={() => setSandboxOpen(false)}
          />
        ) : module ? (
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
          <CourseScreen
            course={course}
            progress={progress}
            onEnterModule={setModuleId}
            onOpenSandbox={() => setSandboxOpen(true)}
          />
        )}
      </main>
    </div>
  );
}
