import { useRef, useState } from 'react';
import { parseBackup } from '../domain/backup';
import type { BackupData } from '../domain/backup';
import { readTextFile } from '../storage/fileTransfer';

interface DataControlsProps {
  /** Экспорт: App скачивает снимок Прогресса и схем Песочницы. */
  readonly onExport: () => void;
  /** Импорт: файл прочитан и проверен, App применяет данные. */
  readonly onImport: (data: BackupData) => void;
  /** «Начать заново»: сброс Прогресса после подтверждения. */
  readonly onReset: () => void;
}

/**
 * Раздел «Данные» главного меню: выгрузка Прогресса и схем Песочницы в файл,
 * восстановление из файла (другой браузер, переустановка) и «начать заново».
 * Битый или чужой файл отклоняется объяснением — текущие данные не тронуты.
 */
export function DataControls({ onExport, onImport, onReset }: DataControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  async function handleFileChosen(file: File | undefined) {
    if (file === undefined) return;
    setRestored(false);
    let parsed;
    try {
      parsed = parseBackup(await readTextFile(file));
    } catch {
      // Файл выбрался, но не прочитался: объясняем, импорта нет
      setImportError('Файл не читается: возможно, он повреждён или доступ к нему запрещён.');
      return;
    }
    if (parsed.ok) {
      setImportError(null);
      setRestored(true);
      onImport(parsed.data);
    } else {
      setImportError(parsed.error);
    }
  }

  function handleResetConfirmed() {
    setConfirmingReset(false);
    onReset();
  }

  return (
    <section className="panel data-controls" aria-labelledby="data-controls-heading">
      <h2 id="data-controls-heading">Данные</h2>
      <p className="data-intro">
        Прогресс и схемы Песочницы помещаются в один файл: выгрузите его, чтобы
        перенести курс в другой браузер или вернуть после переустановки. Импорт
        заменяет текущие данные.
      </p>
      <div className="data-actions">
        <button type="button" className="button-secondary" onClick={onExport}>
          Экспорт в файл
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => fileInputRef.current?.click()}
        >
          Импорт из файла
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="data-import-field"
          aria-label="Файл импорта"
          onChange={(event) => {
            void handleFileChosen(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {confirmingReset ? (
          <span className="data-reset-confirm" role="group" aria-label="Подтверждение сброса">
            Удалить весь Прогресс? Схемы Песочницы останутся.
            <button
              type="button"
              className="button-secondary button-danger"
              onClick={handleResetConfirmed}
            >
              Да, начать заново
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setConfirmingReset(false)}
            >
              Отмена
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="button-secondary button-danger"
            onClick={() => setConfirmingReset(true)}
          >
            Начать заново
          </button>
        )}
      </div>
      {importError !== null && (
        <p className="data-message data-message-error" role="alert">
          {importError}
        </p>
      )}
      {restored && (
        <p className="data-message data-message-ok" role="status">
          Прогресс и схемы Песочницы восстановлены.
        </p>
      )}
    </section>
  );
}
