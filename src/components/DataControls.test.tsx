import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseBackup, serializeBackup } from '../domain/backup';
import type { BackupData } from '../domain/backup';
import { DataControls } from './DataControls';

// Кнопки данных над настоящим доменом (parseBackup не мокается); наружные
// действия — колбэки-двойники: применение данных живёт в App.

const progress = {
  taskStates: { 'm1-ohm-01': 'passed' },
  failedOnce: {},
} as const;

function renderControls() {
  const onExport = vi.fn();
  const onImport = vi.fn();
  const onReset = vi.fn();
  render(<DataControls onExport={onExport} onImport={onImport} onReset={onReset} />);
  return { onExport, onImport, onReset };
}

function backupFile(content: string): File {
  return new File([content], 'backup.json', { type: 'application/json' });
}

describe('Раздел «Данные»: экспорт и импорт', () => {
  it('«Экспорт в файл» просит App скачать файл', async () => {
    const user = userEvent.setup();
    const { onExport } = renderControls();

    await user.click(screen.getByRole('button', { name: 'Экспорт в файл' }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('файл этого приложения вызывает импорт с данными и показывает подтверждение', async () => {
    const user = userEvent.setup();
    const { onImport } = renderControls();

    const file = backupFile(serializeBackup({ progress, circuits: [] }));
    await user.upload(screen.getByLabelText('Файл импорта'), file);

    // чтение файла асинхронное — ждём видимое подтверждение
    expect(await screen.findByRole('status')).toHaveTextContent('восстановлены');
    expect(onImport).toHaveBeenCalledOnce();
    const data: BackupData = onImport.mock.calls[0][0];
    expect(parseBackup(serializeBackup(data))).toEqual({ ok: true, data });
    expect(data.progress).toEqual(progress);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('битый файл отклоняется с объяснением, импорт не вызывается', async () => {
    const user = userEvent.setup();
    const { onImport } = renderControls();

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile('{не json'));

    expect(await screen.findByRole('alert')).toHaveTextContent('не удаётся прочитать JSON');
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('после неудачного импорта удачный убирает объяснение ошибки', async () => {
    const user = userEvent.setup();
    const { onImport } = renderControls();

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile('{не json'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.upload(
      screen.getByLabelText('Файл импорта'),
      backupFile(serializeBackup({ progress, circuits: [] })),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('восстановлены');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onImport).toHaveBeenCalledOnce();
  });

  it('нечитаемый файл объясняется, импорта нет', async () => {
    const user = userEvent.setup();
    const { onImport } = renderControls();

    const readSpy = vi
      .spyOn(FileReader.prototype, 'readAsText')
      .mockImplementation(function (this: FileReader) {
        queueMicrotask(() => {
          Object.defineProperty(this, 'error', { value: new DOMException('запрещён') });
          // тип lib.dom требует ProgressEvent<FileReader>, событие тут любое
          this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
        });
      });

    await user.upload(screen.getByLabelText('Файл импорта'), backupFile('что-то'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Файл не читается');
    expect(onImport).not.toHaveBeenCalled();
    readSpy.mockRestore();
  });
});

describe('Раздел «Данные»: начать заново', () => {
  it('сброс только после явного подтверждения', async () => {
    const user = userEvent.setup();
    const { onReset } = renderControls();

    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    expect(screen.getByText(/Удалить весь Прогресс/)).toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.queryByText(/Удалить весь Прогресс/)).not.toBeInTheDocument();
    expect(onReset).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Начать заново' }));
    await user.click(screen.getByRole('button', { name: 'Да, начать заново' }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Удалить весь Прогресс/)).not.toBeInTheDocument();
  });
});
