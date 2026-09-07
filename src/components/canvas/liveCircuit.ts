import { useMemo, useState } from 'react';
import type { CanvasHistory, PinRef } from '../../domain/canvas';
import { solveCircuit, effectiveReadings, type CircuitSolution } from '../../domain/phasor';
import type { ComponentReading } from '../../domain/simulator';
import {
  emptyProbes,
  measure,
  type MultimeterMode,
  type MultimeterProbes,
  type MultimeterResult,
} from '../../domain/multimeter';
import type { MultimeterGestures } from './CanvasEditor';

/**
 * Общая кинематика экранов с Холстом (Схема-задание и Песочница): живое
 * решение Симулятора и состояние Мультиметра. Хуки не знают ни о Заданиях,
 * ни о проверке — Песочница получает то же живое поведение без «Проверить».
 */

/** Живая схема: решение и показания пересчитываются на каждое изменение Холста. */
export function useLiveCircuit(history: CanvasHistory): {
  readonly solution: CircuitSolution | null;
  readonly readings: ReadonlyMap<string, ComponentReading>;
} {
  /** Решение Симулятора: сбой схемы — null, живое поведение просто гаснет.
   * Схемы с источником ~ решаются суперпозицией (DC + фазор). */
  const solution = useMemo<CircuitSolution | null>(
    () => solveCircuit(history.present),
    [history.present],
  );

  /** Живое поведение Холста: лампочка светится, моторчик вращается; на
   * переменном токе активность считается по действующим значениям. */
  const readings = useMemo(
    () => (solution === null ? new Map<string, ComponentReading>() : effectiveReadings(history.present, solution)),
    [solution, history.present],
  );

  return { solution, readings };
}

export interface MultimeterState {
  /** Включённость режима измерений. */
  readonly on: boolean;
  readonly mode: MultimeterMode;
  readonly probes: MultimeterProbes;
  /** Показание по приложенным щупам; выключен — «idle». */
  readonly result: MultimeterResult;
  /** Готовый пропс Холста: выключен — null, обычное редактирование. */
  readonly gestures: MultimeterGestures | null;
  readonly toggle: (on: boolean) => void;
  readonly changeMode: (mode: MultimeterMode) => void;
}

/**
 * Мультиметр: включённость, режим и приложенные щупы (точки или ветвь).
 * Смена режима и выключение снимают щупы. Показание считается из живого
 * решения — обновляется с любым изменением схемы само собой.
 */
export function useMultimeter(liveSolution: CircuitSolution | null): MultimeterState {
  const [on, setOn] = useState(false);
  const [mode, setMode] = useState<MultimeterMode>('voltage');
  const [probes, setProbes] = useState<MultimeterProbes>(emptyProbes);
  /** Какой щуп приложится следующим кликом по точке: красный, затем чёрный. */
  const [nextProbe, setNextProbe] = useState<'red' | 'black'>('red');

  function clearProbes() {
    setProbes(emptyProbes);
    setNextProbe('red');
  }

  function toggle(next: boolean) {
    setOn(next);
    clearProbes();
  }

  function changeMode(next: MultimeterMode) {
    setMode(next);
    clearProbes();
  }

  function applyPinProbe(ref: PinRef) {
    if (nextProbe === 'red') setProbes((current) => ({ ...current, red: ref }));
    else setProbes((current) => ({ ...current, black: ref }));
    setNextProbe(nextProbe === 'red' ? 'black' : 'red');
  }

  function applyBranchProbe(componentId: string) {
    setProbes((current) => ({ ...current, branch: componentId }));
  }

  const result = useMemo<MultimeterResult>(
    () => (on ? measure(liveSolution, mode, probes) : { status: 'idle' }),
    [on, mode, probes, liveSolution],
  );

  const gestures: MultimeterGestures | null = on
    ? { mode, probes, onPinProbe: applyPinProbe, onBranchProbe: applyBranchProbe, onClearProbes: clearProbes }
    : null;

  return { on, mode, probes, result, gestures, toggle, changeMode };
}
