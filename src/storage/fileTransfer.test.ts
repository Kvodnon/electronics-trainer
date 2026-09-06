import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile, readTextFile } from './fileTransfer';
import { readBlobText } from '../testing/fileDownload';

// Скачивание идёт через скрытую ссылку и blob-адрес; jsdom не умеет ни то,
// ни другое — подменяем ровно эти браузерные точки, остальное настоящее.

describe('Скачивание файла данных', () => {
  it('файл скачивается с заданным именем и содержимым, адрес освобождается позже', async () => {
    const downloaded: { name: string; content: string }[] = [];
    const revoked: string[] = [];
    let blob: Blob | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = (created: Blob) => {
      blob = created;
      return 'blob:mock';
    };
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded.push({ name: this.download, content: '' });
      });

    try {
      downloadTextFile('backup.json', '{"kind":"test"}');
      // сам вызов не освобождает адрес: мгновенный revoke отменяет загрузку
      expect(revoked).toEqual([]);
      expect(downloaded).toEqual([{ name: 'backup.json', content: '' }]);
      await expect(readBlobText(blob!)).resolves.toBe('{"kind":"test"}');
      expect(clickSpy).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(revoked).toEqual(['blob:mock']);
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      clickSpy.mockRestore();
    }
  });
});

describe('Чтение выбранного файла', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('содержимое файла читается как текст', async () => {
    const file = new File(['{"kind":"test"}'], 'backup.json', { type: 'application/json' });
    await expect(readTextFile(file)).resolves.toBe('{"kind":"test"}');
  });
});
