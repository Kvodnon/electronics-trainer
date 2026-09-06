/**
 * Передача файла данных через браузер: скачивание текста файлом и чтение
 * выбранного учеником файла. Слой побочных эффектов — домен и редьюсеры
 * остаются чистыми.
 */

/** Скачивает текст как файл с заданным именем. */
export function downloadTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Освобождение отложено: мгновенный revoke может отменить ещё не начавшуюся
  // загрузку.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Читает выбранный файл как текст; разбор и проверка — в домене. */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Файл не читается.'));
    reader.readAsText(file);
  });
}
