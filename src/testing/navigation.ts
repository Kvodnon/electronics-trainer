import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type User = ReturnType<typeof userEvent.setup>;

/**
 * Проводит ученика через карточки Теории Модуля к Заданиям:
 * «Дальше» на всех карточках, кроме последней, затем «К Заданиям».
 */
export async function passTheory(user: User, cards: number): Promise<void> {
  for (let index = 0; index < cards - 1; index += 1) {
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
  }
  await user.click(screen.getByRole('button', { name: 'К Заданиям' }));
}

/**
 * Проводит ученика с экрана Курса к Заданиям М1:
 * «Начать» → четыре карточки Теории → «К Заданиям».
 */
export async function enterModule1Tasks(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Начать' }));
  await passTheory(user, 4);
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

/**
 * Соединяет батарею, диод (или светодиод) и резистор в прямом включении:
 * «плюс» батареи — на анод (вывод 1) диода, катод — на резистор, резистор —
 * на «минус». Обычный wireRing включает диод наоборот: в кольце «вывод 2 →
 * вывод 1» ток входит в Компонент со стороны катода.
 */
export async function wireForwardDiode(
  user: User,
  names: readonly [battery: string, diode: string, resistor: string],
): Promise<void> {
  const [battery, diode, resistor] = names;
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${battery}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${diode}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${diode}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${resistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${resistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${battery}` }));
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
