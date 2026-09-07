import type { CourseData } from '../domain/course';
import { module1 } from './m1';
import { module2 } from './m2';
import { module3 } from './m3';

/**
 * Курс — линейная последовательность Модулей: следующий открыт только
 * после прохождения предыдущего. Модули М3 и М4 добавляются волнами
 * тикетов 17–22 без переделки этой структуры.
 */
export const course: CourseData = {
  modules: [module1, module2, module3],
};
