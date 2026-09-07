import type { CourseData } from '../domain/course';
import { module1 } from './m1';
import { module2 } from './m2';
import { module3 } from './m3';
import { module4 } from './m4';

/**
 * Курс — линейная последовательность Модулей: следующий открыт только
 * после прохождения предыдущего. Задания М4 (тикет 21) открывают Модуль,
 * полный контент дописывает тикет 22.
 */
export const course: CourseData = {
  modules: [module1, module2, module3, module4],
};
