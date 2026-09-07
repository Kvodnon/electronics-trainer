import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DigitalCanvasScreen } from './DigitalCanvasScreen';

/**
 * Цифровой Холст по настоящему домену, без моков: сборка из Палитры,
 * Провода по выводам, живые уровни на схеме, Кнопка и Генератор.
 * Имя Компонента на схеме — вид и порядковый номер расстановки.
 */

function renderScreen() {
  return render(
    <DigitalCanvasScreen
      symbolStandard="gost"
      onSymbolStandardChange={() => {}}
      onExit={() => {}}
    />,
  );
}

/** Соединяет два вывода кликами: первый зажимает Провод, второй завершает. */
async function wirePins(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(screen.getByRole('button', { name: from }));
  await user.click(screen.getByRole('button', { name: to }));
}

describe('Цифровой Холст: сборка и живые уровни', () => {
  it('Кнопка → НЕ → Индикатор: уровни видны на выводах, клик по Кнопке всё переключает', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Кнопка' }));
    await user.click(screen.getByRole('button', { name: 'Элемент НЕ' }));
    await user.click(screen.getByRole('button', { name: 'Индикатор' }));
    await wirePins(
      user,
      'Вывод 1: Кнопка 1 — уровень 0',
      'Вывод 1: Элемент НЕ 2 — уровень 0',
    );
    await wirePins(
      user,
      'Вывод 2: Элемент НЕ 2 — уровень 1',
      // до соединения вход Индикатора читает 0 — уровень 1 появится с Проводом
      'Вывод 1: Индикатор 3 — уровень 0',
    );

    // отпущенная кнопка: НЕ выдаёт 1, Индикатор светится
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 3 — уровень 1' })).toBeInTheDocument();
    expect(document.querySelector('.digital-indicator-glow')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Кнопка 1' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Кнопка 1' }));

    // нажатая кнопка: НЕ выдаёт 0, Индикатор гаснет
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 3 — уровень 0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Вывод 1: Индикатор 3 — уровень 1' })).not.toBeInTheDocument();
    expect(document.querySelector('.digital-indicator-glow')).toBeNull();
    expect(screen.getByRole('button', { name: 'Кнопка 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('checkbox', { name: 'нажата' })).toBeChecked();
  });

  it('Провод окрашен уровнем сети: отпущенная Кнопка — низкий, нажатая — высокий', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Кнопка' }));
    await user.click(screen.getByRole('button', { name: 'Индикатор' }));
    await wirePins(user, 'Вывод 1: Кнопка 1 — уровень 0', 'Вывод 1: Индикатор 2 — уровень 0');

    const wire = screen.getByRole('button', { name: 'Провод w1 — уровень 0' });
    expect(wire).toHaveClass('wire-level-low');
    expect(wire).not.toHaveClass('wire-level-high');

    await user.click(screen.getByRole('button', { name: 'Кнопка 1' }));
    expect(screen.getByRole('button', { name: 'Провод w1 — уровень 1' })).toHaveClass('wire-level-high');
  });

  it('Демо-схема ставится целиком и живёт: НЕ светит при отпущенной Кнопке', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Демо-схема' }));

    expect(screen.getByRole('button', { name: 'Тактовый генератор 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Кнопка 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Элемент И 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Элемент НЕ 4' })).toBeInTheDocument();
    // Кнопка отпущена: её сеть 0, а НЕ выдаёт 1 на второй Индикатор
    expect(screen.getByRole('button', { name: 'Провод w2 — уровень 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Провод w5 — уровень 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 6 — уровень 1' })).toBeInTheDocument();
  });
});

describe('Цифровой Холст: тактовый генератор', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('тикает с заданной частотой, частота регулируется с Холста', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Тактовый генератор' }));
    fireEvent.click(screen.getByRole('button', { name: 'Индикатор' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Вывод 1: Тактовый генератор 1 — уровень 1' }));
    // до соединения вход Индикатора читает 0 — уровень придёт с Проводом
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Вывод 1: Индикатор 2 — уровень 0' }));

    // 2 Гц: t = 0 — 1, к t = 0,3 c сигнал сменился на 0
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 2 — уровень 1' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 2 — уровень 0' })).toBeInTheDocument();

    // выбор Компонента мышью, а не кликом: fireEvent.click не порождает mousedown,
    // которым Панель выбора и открывается
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Тактовый генератор 1' }));
    fireEvent.mouseUp(screen.getByRole('button', { name: 'Тактовый генератор 1' }));
    // частота видна и в подписи на Холсте, и в Панели выбора
    fireEvent.change(screen.getByRole('slider', { name: 'Частота, Гц' }), { target: { value: '10' } });
    expect(screen.getAllByText('10 Гц')).toHaveLength(2);

    // t = 0,4 c при 10 Гц: фаза 4,0 — снова 1
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByRole('button', { name: 'Вывод 1: Индикатор 2 — уровень 1' })).toBeInTheDocument();
  });
});
