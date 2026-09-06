import { useState } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { module1 } from '../content/m1';
import { modulePaletteOf } from '../domain/course';
import { upsertCircuit, type SavedCircuit } from '../domain/sandbox';
import type { SymbolStandard } from '../domain/symbols';
import { wireRing } from '../testing/navigation';
import { SandboxScreen } from './SandboxScreen';

/**
 * Экран Песочницы — третий шов (React-компоненты через Testing Library):
 * свободный режим без «Проверить», живое поведение и Мультиметр на месте,
 * сохранение/загрузка/удаление именованных схем. Домен не мокается.
 */

/** Обвязка как в App: список схем, палитра и стандарт живут выше экрана. */
function renderSandbox() {
  function Harness() {
    const [standard, setStandard] = useState<SymbolStandard>('gost');
    const [circuits, setCircuits] = useState<readonly SavedCircuit[]>([]);
    return (
      <SandboxScreen
        palette={modulePaletteOf(module1)}
        circuits={circuits}
        onSaveCircuit={(name, canvas) => setCircuits((current) => upsertCircuit(current, name, canvas))}
        onDeleteCircuit={(circuitId) =>
          setCircuits((current) => current.filter((circuit) => circuit.id !== circuitId))
        }
        symbolStandard={standard}
        onSymbolStandardChange={setStandard}
        onExit={() => undefined}
      />
    );
  }
  return render(<Harness />);
}

/** Ставит батарею и лампочку и замыкает их в контур: лампочка горит. */
async function assembleLampLoop(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Батарея' }));
  await user.click(screen.getByRole('button', { name: 'Лампочка' }));
  await wireRing(user, ['Батарея 1', 'Лампочка 2']);
}

afterEach(cleanup);

describe('Свободный режим без проверки', () => {
  it('кнопки «Проверить» и оверлея нет, но живое поведение работает само', async () => {
    const user = userEvent.setup();
    renderSandbox();

    expect(screen.queryByRole('button', { name: 'Проверить' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Токи и напряжения' })).not.toBeInTheDocument();
    expect(document.querySelector('.symbol-lamp-glow')).toBeNull();

    await assembleLampLoop(user);

    // Симулятор считает схему без всякой проверки: лампочка светится
    const glow = document.querySelector('.symbol-lamp-glow');
    expect(glow).not.toBeNull();
    expect(glow!.getAttribute('opacity')).toBe('1');
  });

  it('Мультиметр работает без «Проверить»: напряжение из живого расчёта', async () => {
    const user = userEvent.setup();
    renderSandbox();
    await assembleLampLoop(user);

    await user.click(screen.getByRole('checkbox', { name: 'Мультиметр' }));
    // красный щуп на «плюсе» батареи, чёрный — на выводе лампочки
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Лампочка 2' }));

    expect(document.querySelector('.multimeter-display')!.textContent).toBe('8,99 В');
  });

  it('Палитра передаётся экрану целиком: все Компоненты, открытые Курсом', () => {
    renderSandbox();
    for (const name of ['Батарея', 'Резистор', 'Лампочка', 'Выключатель', 'Ключ', 'Моторчик']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('Осциллограф в Песочнице (тикет 14)', () => {
  /** Палитра с конденсатором: осциллограф появляется вместе с ним. */
  function renderSandboxWithCapacitor() {
    function Harness() {
      const [standard, setStandard] = useState<SymbolStandard>('gost');
      return (
        <SandboxScreen
          palette={[...modulePaletteOf(module1), 'capacitor' as const]}
          circuits={[]}
          onSaveCircuit={() => undefined}
          onDeleteCircuit={() => undefined}
          symbolStandard={standard}
          onSymbolStandardChange={setStandard}
          onExit={() => undefined}
        />
      );
    }
    return render(<Harness />);
  }

  it('осциллограф строится сам: ключ переключается на середине проигрывания', async () => {
    const user = userEvent.setup();
    renderSandboxWithCapacitor();

    // пустая схема: панель есть, кривой нет — нечего измерять
    expect(screen.getByText('Осциллограф')).toBeInTheDocument();
    expect(document.querySelector('polyline.scope-curve')).toBeNull();

    // зарядная цепь с разомкнутым выключателем: он сам замкнётся на середине
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Выключатель' }));
    await user.click(screen.getByRole('button', { name: 'Конденсатор' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Батарея 1' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Конденсатор 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Конденсатор 3' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 2: Выключатель 2' }));
    await user.click(screen.getByRole('button', { name: 'Вывод 1: Батарея 1' }));

    expect(document.querySelectorAll('polyline.scope-curve')).toHaveLength(1);
    expect(document.querySelector('.scope-toggle-mark')).not.toBeNull();

    // проигрывание ведёт бегунок по кривой заряда
    await user.click(screen.getByRole('button', { name: 'Проиграть заряд' }));
    expect(screen.getByText(/t = 0 с · U = 0 В/)).toBeInTheDocument();
  });
});

describe('Мои схемы: сохранение, загрузка, удаление', () => {
  /** Собирает контур, поворачивает лампочку и сохраняет схему под именем. */
  async function saveRingCircuit(user: ReturnType<typeof userEvent.setup>, name: string) {
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка' }));
    await user.click(screen.getByRole('button', { name: 'Лампочка 2' }));
    await user.click(screen.getByRole('button', { name: 'Повернуть' }));
    await wireRing(user, ['Батарея 1', 'Лампочка 2']);

    await user.type(screen.getByRole('textbox', { name: 'Название схемы' }), name);
    await user.click(screen.getByRole('button', { name: 'Сохранить схему' }));
  }

  it('сохранение → сброс → загрузка: схема возвращается без потерь и живёт', async () => {
    const user = userEvent.setup();
    renderSandbox();
    await saveRingCircuit(user, 'Кольцо');
    // поле имени очистилось, схема в списке
    expect(screen.getByRole('textbox', { name: 'Название схемы' })).toHaveValue('');
    expect(screen.getByText('Кольцо')).toBeInTheDocument();

    // черновик стирается, затем именованная схема загружается обратно
    await user.click(screen.getByRole('button', { name: 'Сбросить схему' }));
    expect(document.querySelector('.symbol-lamp-glow')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Загрузить «Кольцо»' }));

    // без потерь: позиции, поворот лампочек и Провод на месте
    expect(screen.getByRole('button', { name: 'Батарея 1' }).getAttribute('transform')).toBe(
      'translate(100 100) rotate(0)',
    );
    expect(screen.getByRole('button', { name: 'Лампочка 2' }).getAttribute('transform')).toBe(
      'translate(220 100) rotate(90)',
    );
    expect(screen.getByRole('button', { name: 'Провод w1' })).toBeInTheDocument();
    // и схема сразу живёт — Симулятор считается по загруженному Холсту
    expect(document.querySelector('.symbol-lamp-glow')).not.toBeNull();
  });

  it('то же имя перезаписывает схему, удаление убирает её из списка', async () => {
    const user = userEvent.setup();
    renderSandbox();

    await saveRingCircuit(user, 'Опыт');
    await user.click(screen.getByRole('button', { name: 'Сбросить схему' }));
    await user.click(screen.getByRole('button', { name: 'Батарея' }));
    await user.type(screen.getByRole('textbox', { name: 'Название схемы' }), 'Опыт');
    await user.click(screen.getByRole('button', { name: 'Сохранить схему' }));

    // копии нет — только перезаписанная схема
    expect(screen.getAllByText('Опыт')).toHaveLength(1);
    // перезаписана текущим Холстом: после загрузки лампочки нет
    await user.click(screen.getByRole('button', { name: 'Загрузить «Опыт»' }));
    expect(screen.getByRole('button', { name: 'Батарея 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Лампочка 2' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Удалить «Опыт»' }));
    expect(screen.queryByText('Опыт')).not.toBeInTheDocument();
    expect(screen.getByText(/Пока ничего не сохранено/)).toBeInTheDocument();
  });

  it('пустое имя не сохраняется: кнопка неактивна', async () => {
    const user = userEvent.setup();
    renderSandbox();

    const saveButton = screen.getByRole('button', { name: 'Сохранить схему' });
    expect(saveButton).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: 'Название схемы' }), '   ');
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Пока ничего не сохранено/)).toBeInTheDocument();
  });
});
