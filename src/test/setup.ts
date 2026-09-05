import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  // Тренажёр сохраняет Прогресс в localStorage — тесты изолируем с чистого листа.
  window.localStorage.clear();
});
