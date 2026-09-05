import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Проводит ученика с экрана Курса к Заданиям М1:
 * «Начать» → две карточки Теории («Дальше», затем «К Заданиям»).
 */
export async function войтиВЗаданияМодуля1(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Начать' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
}
