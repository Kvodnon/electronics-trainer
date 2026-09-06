import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Проводит ученика с экрана Курса к Заданиям М1:
 * «Начать» → две карточки Теории («Дальше», затем «К Заданиям»).
 */
export async function enterModule1Tasks(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Начать' }));
  await user.click(screen.getByRole('button', { name: 'Дальше' }));
  await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
}

/**
 * Рисует Проводы по кольцу: вывод 2 каждого Компонента — к выводу 1 следующего,
 * последний замыкается на первый.
 */
export async function wireRing(user: User, componentNames: readonly string[]): Promise<void> {
  for (let index = 0; index < componentNames.length; index += 1) {
    const from = componentNames[index];
    const to = componentNames[(index + 1) % componentNames.length];
    await user.click(screen.getByRole('button', { name: `Вывод 2: ${from}` }));
    await user.click(screen.getByRole('button', { name: `Вывод 1: ${to}` }));
  }
}

/** Выбирает Компонент и меняет его сопротивление в панели правки. */
export async function setResistance(
  user: User,
  componentName: string,
  resistance: string,
): Promise<void> {
  await user.click(screen.getByRole('button', { name: componentName }));
  await user.clear(screen.getByLabelText('Номинал, Ом'));
  await user.type(screen.getByLabelText('Номинал, Ом'), resistance);
  await user.click(screen.getByRole('button', { name: 'Применить' }));
}

/** Выбирает выключатель и замыкает его в панели правки. */
export async function closeSwitch(user: User, componentName: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: componentName }));
  await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
}
