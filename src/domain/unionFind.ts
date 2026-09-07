/**
 * Union-find по строковым ключам (ключи выводов вида «c1:0»): общий механизм
 * сетей цифрового Холста — редьюсер проверяет правило «один выход на сеть»,
 * булевый движок объединяет выводы по Проводам. Ключ без объединения — сам
 * себе корень, поэтому одиночные сети не нужно объявлять заранее.
 */
export interface UnionFind {
  /** Корень сети ключа; ключ без объединений — сам себе корень. */
  find(key: string): string;
  /** Объединяет сети двух ключей. */
  union(a: string, b: string): void;
}

export function createUnionFind(): UnionFind {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    const resolved = parent.get(key) ?? key;
    if (resolved === key) return key;
    const root = find(resolved);
    parent.set(key, root);
    return root;
  };
  return {
    find,
    union: (a, b) => parent.set(find(a), find(b)),
  };
}
