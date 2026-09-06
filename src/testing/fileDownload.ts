/**
 * Подмены браузерной передачи файлов для тестов: jsdom не умеет ни
 * blob-адресов, ни щелчков ссылок на скачивание. Содержимое скачивания —
 * настоящий Blob; чтение файла — настоящий FileReader.
 */
import { vi } from 'vitest';

/** Читает Blob как текст через FileReader — jsdom не даёт blob.text(). */
export function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

export interface DownloadedFile {
  readonly name: string;
  readonly text: Promise<string>;
}

/**
 * Перехватывает скачивание: downloadTextFile создаёт настоящий Blob, ссылка
 * не переходит никуда. restore возвращает браузерные точки на место, а
 * revokeObjectURL оставляет заглушкой — освобождение адреса отложено, и
 * настоящий вызов после restore мог бы упасть.
 */
export function stubDownload(): { readonly files: readonly DownloadedFile[]; restore: () => void } {
  const files: DownloadedFile[] = [];
  const blobs: { href: string; blob: Blob }[] = [];
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob: Blob) => {
    const href = `blob:mock-${blobs.length + 1}`;
    blobs.push({ href, blob });
    return href;
  };
  URL.revokeObjectURL = () => {};
  const clickSpy = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) {
      const entry = blobs.find((candidate) => candidate.href === this.href);
      files.push({ name: this.download, text: readBlobText(entry!.blob) });
    });
  return {
    files,
    restore() {
      URL.createObjectURL = originalCreateObjectURL;
      clickSpy.mockRestore();
    },
  };
}
