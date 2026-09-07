/**
 * Проверка цифровых Схема-заданий по таблице истинности (ADR-0002): схема
 * ученика прогоняется через все наборы входов, заданные строками Задания,
 * и уровни Индикаторов сверяются с требуемыми. Входы — Кнопки в порядке
 * установки, выходы — Индикаторы; состояния Кнопок на строках назначает
 * проверка, а не ученик. Строки применяются в порядке объявления, и уровни
 * сетей переносятся от строки к строке: «держит» у триггера осмысленно
 * только от предыдущего состояния, поэтому пара ИЛИ-НЕ без перекрёстных
 * связей установку проходит, а хранение — нет. Чистый TypeScript без DOM.
 */
import { pinKey } from './canvas';
import { evaluateDigital, type Bit } from './booleanEngine';
import {
  digitalPinCountOf,
  digitalPinRole,
  type DigitalCanvasState,
  type DigitalComponent,
} from './digitalCanvas';
import { createUnionFind } from './unionFind';
import type { LogicTask, LogicTableRow } from './task';

/** Сверка одной строки таблицы: требуемые уровни против получившихся. */
export interface LogicRowCheck {
  readonly row: LogicTableRow;
  readonly actual: readonly Bit[];
  readonly passed: boolean;
}

/** Диагноз цифрового Схема-задания: нарушение структуры или расходившаяся строка. */
export interface LogicDiagnosis {
  readonly kind: 'structure' | 'logic-mismatch';
  readonly text: string;
  /** Компонент для подсветки места ошибки; null — подсвечивать нечего. */
  readonly spot: string | null;
}

/** Итог проверки: сверка каждой строки и первый Диагноз, если схема не прошла. */
export interface LogicCheckResult {
  readonly rowChecks: readonly LogicRowCheck[];
  readonly diagnoses: readonly LogicDiagnosis[];
  readonly passed: boolean;
}

/**
 * Прогоняет схему по всем строкам таблицы истинности Задания. С расставленными
 * не по условию входами и выходами таблицу проверять не на чем — один
 * структурный Диагноз без строк.
 */
export function checkLogicTable(canvas: DigitalCanvasState, task: LogicTask): LogicCheckResult {
  const buttons = canvas.components.filter((component) => component.kind === 'button');
  const indicators = canvas.components.filter((component) => component.kind === 'indicator');
  if (buttons.length !== task.inputs || indicators.length !== task.outputs) {
    const extra =
      buttons.length > task.inputs
        ? buttons[task.inputs]
        : indicators.length > task.outputs
          ? indicators[task.outputs]
          : undefined;
    return {
      rowChecks: [],
      diagnoses: [
        {
          kind: 'structure',
          text:
            `Входы и выходы не расставлены: по условию нужно ${task.inputs} Кнопок-входов и ` +
            `${task.outputs} Индикаторов-выходов, а на схеме Кнопок ${buttons.length} и ` +
            'Индикаторов ' +
            `${indicators.length}. Порядок входов и выходов — порядок установки Кнопок и ` +
            'Индикаторов на Холст.',
          spot: extra?.id ?? null,
        },
      ],
      passed: false,
    };
  }

  const rowChecks: LogicRowCheck[] = [];
  const diagnoses: LogicDiagnosis[] = [];
  let carried: ReadonlyMap<string, Bit> | undefined;
  for (const row of task.truthTable) {
    const levels = evaluateDigital(withButtonLevels(canvas, buttons, row.inputs), 0, carried);
    carried = levels;
    const actual = indicators.map((indicator) => levels.get(pinKey(indicator.id, 0)) ?? 0);
    const passed = row.outputs.every((expected, index) => expected === actual[index]);
    rowChecks.push({ row, actual, passed });
    if (!passed && diagnoses.length === 0) {
      diagnoses.push(mismatchDiagnosis(canvas, levels, indicators, row, actual));
    }
  }
  return {
    rowChecks,
    diagnoses,
    passed: diagnoses.length === 0 && rowChecks.every((check) => check.passed),
  };
}

/** Копия Холста, где Кнопки стоят в состояния строки: перебор ведёт проверка. */
function withButtonLevels(
  canvas: DigitalCanvasState,
  buttons: readonly DigitalComponent[],
  inputs: readonly Bit[],
): DigitalCanvasState {
  const levelOf = new Map(buttons.map((button, index) => [button.id, inputs[index] === 1]));
  return {
    components: canvas.components.map((component) => {
      const high = levelOf.get(component.id);
      return high === undefined ? component : { ...component, high };
    }),
    wires: canvas.wires,
  };
}

/** Как назвать элемент и в чём его логика: Диагноз объясняет именно её. */
const GATE_LEXIS: Record<'and' | 'or' | 'not', { genitive: string; rule: string }> = {
  and: { genitive: 'элемента И', rule: 'И даёт 1, только когда оба его входа равны 1' },
  or: { genitive: 'элемента ИЛИ', rule: 'ИЛИ даёт 1, когда хотя бы один его вход равен 1' },
  not: { genitive: 'элемента НЕ', rule: 'НЕ выдаёт уровень, противоположный своему входу' },
};

/** Только у логических элементов есть логика, которую Диагноз объясняет. */
function isGate(kind: DigitalComponent['kind']): kind is 'and' | 'or' | 'not' {
  return kind === 'and' || kind === 'or' || kind === 'not';
}

/**
 * Диагноз первой расходившейся строки: какой набор входов, какой выход ожидался
 * и что сейчас выдаёт элемент-водитель этого Индикатора — его логика и есть
 * место, с которого начинается проверка схемы.
 */
function mismatchDiagnosis(
  canvas: DigitalCanvasState,
  levels: ReadonlyMap<string, Bit>,
  indicators: readonly DigitalComponent[],
  row: LogicTableRow,
  actual: readonly Bit[],
): LogicDiagnosis {
  const inputsPhrase = row.inputs.map((bit, index) => `Вход ${index + 1} = ${bit}`).join(', ');
  const diverging = row.outputs.findIndex((expected, index) => expected !== actual[index]);
  const head =
    `Набор входов ${inputsPhrase}: на выходе ${diverging + 1} ожидался ${row.outputs[diverging]}, ` +
    `а получился ${actual[diverging]}.`;
  const indicator = indicators[diverging];
  const driver = driverOf(canvas, indicator.id);

  if (driver === undefined) {
    return {
      kind: 'logic-mismatch',
      text: `${head} К Индикатору не идёт сигнал от логики: его вход не соединён с выходом элемента.`,
      spot: indicator.id,
    };
  }
  if (!isGate(driver.kind)) {
    return {
      kind: 'logic-mismatch',
      text:
        `${head} Сигнал на Индикатор приходит прямо от источника — между входом и выходом ` +
        'нет логического элемента.',
      spot: driver.id,
    };
  }

  const lexis = GATE_LEXIS[driver.kind];
  const inputCount = digitalPinCountOf(driver.kind) - 1;
  const gateInputs: Bit[] = [];
  for (let pin = 0; pin < inputCount; pin += 1) {
    gateInputs.push(levels.get(pinKey(driver.id, pin)) ?? 0);
  }
  const gateOutput = levels.get(pinKey(driver.id, inputCount)) ?? 0;
  return {
    kind: 'logic-mismatch',
    text:
      `${head} Начните проверку с ${lexis.genitive}, подающего сигнал на этот выход: ` +
      (gateInputs.length === 1
        ? `на его входе сейчас ${gateInputs[0]}`
        : `на его входах сейчас ${gateInputs.join(', ')}`) +
      `, поэтому на выходе ${gateOutput} — ${lexis.rule}.`,
    spot: driver.id,
  };
}

/**
 * Компонент, чей выход стоит в сети входа Индикатора: ближайший виновник
 * расхождения. Контракт редьюсера оставляет в сети одного водителя; схема
 * из загруженного файла с нарушением контракта всё же определённа — вернётся
 * первый водитель по порядку.
 */
function driverOf(canvas: DigitalCanvasState, indicatorId: string): DigitalComponent | undefined {
  const nets = createUnionFind();
  for (const wire of canvas.wires) {
    nets.union(pinKey(wire.from.componentId, wire.from.pin), pinKey(wire.to.componentId, wire.to.pin));
  }
  const indicatorNet = nets.find(pinKey(indicatorId, 0));
  for (const component of canvas.components) {
    for (let pin = 0; pin < digitalPinCountOf(component.kind); pin += 1) {
      if (nets.find(pinKey(component.id, pin)) !== indicatorNet) continue;
      if (digitalPinRole(component.kind, pin) !== 'output') continue;
      return component;
    }
  }
  return undefined;
}
