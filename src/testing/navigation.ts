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

/**
 * Собирает ключ на транзисторе: кнопка с резистором — в базу (вывод 1),
 * коллектор (вывод 2) — через второй резистор и светодиод на «плюс»,
 * эмиттер (вывод 3) — на «минус» батареи.
 */
export async function wireTransistorKey(
  user: User,
  names: readonly [
    battery: string,
    pushbutton: string,
    baseResistor: string,
    collectorResistor: string,
    transistor: string,
    led: string,
  ],
): Promise<void> {
  const [battery, pushbutton, baseResistor, collectorResistor, transistor, led] = names;
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${battery}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${pushbutton}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${pushbutton}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${baseResistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${baseResistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${transistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${battery}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${collectorResistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${collectorResistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${led}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${led}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${transistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 3: ${transistor}` }));
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

/**
 * Собирает задержанный ключ: как wireTransistorKey, плюс конденсатор —
 * с выхода резистора базы (база транзистора) на «минус» батареи. Заряжаясь
 * через резистор базы, конденсатор растягивает открытие ключа во времени.
 */
export async function wireDelayKey(
  user: User,
  names: readonly [
    battery: string,
    pushbutton: string,
    baseResistor: string,
    collectorResistor: string,
    transistor: string,
    led: string,
    capacitor: string,
  ],
): Promise<void> {
  const [battery, pushbutton, baseResistor, collectorResistor, transistor, led, capacitor] = names;
  await wireTransistorKey(user, [
    battery,
    pushbutton,
    baseResistor,
    collectorResistor,
    transistor,
    led,
  ]);
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${baseResistor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 1: ${capacitor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${capacitor}` }));
  await user.click(screen.getByRole('button', { name: `Вывод 2: ${battery}` }));
}

/** Выбирает выключатель и замыкает его в панели правки. */
export async function closeSwitch(user: User, componentName: string): Promise<void> {
  await user.click(screen.getByRole('button', { name: componentName }));
  await user.click(screen.getByRole('checkbox', { name: 'замкнут' }));
}
