/**
 * Русские формы имён Компонентов для строк Разбора и Диагнозов. Русский —
 * только в комментариях, UI-тексте и тестах (см. AGENTS.md: code style);
 * идентификаторы видов — английские данные домена.
 */
import type { ComponentKind, LedColor } from './canvas';

/** Формы имени вида Компонента: именительный, винительный и т.д. */
export interface ComponentLexis {
  readonly nominative: string;
  readonly accusative: string;
  readonly prepositional: string;
  readonly genitive: string;
  readonly genitivePlural: string;
}

export const COMPONENT_LEXIS: Record<ComponentKind, ComponentLexis> = {
  battery: { nominative: 'батарея', accusative: 'батарею', prepositional: 'батарее', genitive: 'батареи', genitivePlural: 'батарей' },
  resistor: { nominative: 'резистор', accusative: 'резистор', prepositional: 'резисторе', genitive: 'резистора', genitivePlural: 'резисторов' },
  lamp: { nominative: 'лампочка', accusative: 'лампочку', prepositional: 'лампочке', genitive: 'лампочки', genitivePlural: 'лампочек' },
  switch: { nominative: 'выключатель', accusative: 'выключатель', prepositional: 'выключателе', genitive: 'выключателя', genitivePlural: 'выключателей' },
  pushbutton: { nominative: 'ключ', accusative: 'ключ', prepositional: 'ключе', genitive: 'ключа', genitivePlural: 'ключей' },
  motor: { nominative: 'моторчик', accusative: 'моторчик', prepositional: 'моторчике', genitive: 'моторчика', genitivePlural: 'моторчиков' },
  diode: { nominative: 'диод', accusative: 'диод', prepositional: 'диоде', genitive: 'диода', genitivePlural: 'диодов' },
  led: { nominative: 'светодиод', accusative: 'светодиод', prepositional: 'светодиоде', genitive: 'светодиода', genitivePlural: 'светодиодов' },
  capacitor: { nominative: 'конденсатор', accusative: 'конденсатор', prepositional: 'конденсаторе', genitive: 'конденсатора', genitivePlural: 'конденсаторов' },
  transistor: { nominative: 'транзистор', accusative: 'транзистор', prepositional: 'транзисторе', genitive: 'транзистора', genitivePlural: 'транзисторов' },
  potentiometer: { nominative: 'потенциометр', accusative: 'потенциометр', prepositional: 'потенциометре', genitive: 'потенциометра', genitivePlural: 'потенциометров' },
  buzzer: { nominative: 'зуммер', accusative: 'зуммер', prepositional: 'зуммере', genitive: 'зуммера', genitivePlural: 'зуммеров' },
  acsource: { nominative: 'источник переменного напряжения', accusative: 'источник переменного напряжения', prepositional: 'источнике переменного напряжения', genitive: 'источника переменного напряжения', genitivePlural: 'источников переменного напряжения' },
  inductor: { nominative: 'катушка', accusative: 'катушку', prepositional: 'катушке', genitive: 'катушки', genitivePlural: 'катушек' },
};

/** Родительный падеж цвета свечения — для строк Диагнозов («порог красного»). */
export const LED_COLOR_GENITIVE: Record<LedColor, string> = {
  red: 'красного',
  yellow: 'жёлтого',
  green: 'зелёного',
  blue: 'синего',
};

/** Первая буква — заглавная: строки Разбора начинаются именем Компонента. */
export function cap(text: string): string {
  return text[0].toUpperCase() + text.slice(1);
}
