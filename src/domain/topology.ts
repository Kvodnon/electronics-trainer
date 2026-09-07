/**
 * Топология Холста для решателей (ADR-0001): Провода объединяют выводы в
 * узлы, каждый Компонент даёт ветви между узлами своих выводов, связные
 * множества ветвей образуют острова. Общая для постоянного тока
 * (simulator.solveDc) и фазорного режима (phasor.solvePhasor): нумерация
 * узлов и состав ветвей не зависят от модели Компонентов. Чистый TypeScript
 * без DOM.
 */
import { pinKey, type CanvasState, type PlacedComponent } from './canvas';

/** Выводы транзистора: база, коллектор, эмиттер (слева, справа сверху, справа снизу). */
export const BASE_PIN = 0;
export const COLLECTOR_PIN = 1;
export const EMITTER_PIN = 2;

/**
 * Ветвь схемы: Компонент между узлами двух своих выводов. Большинство
 * Компонентов имеют одну ветвь (выводы 0 → 1); у транзистора две — переход
 * база—эмиттер и переход коллектор—эмиттер, у потенциометра две — плечи
 * вокруг движка.
 */
export interface TopologyBranch {
  readonly component: PlacedComponent;
  /** Выводы Компонента на концах ветви. */
  readonly pinA: number;
  readonly pinB: number;
  readonly nodeA: number;
  readonly nodeB: number;
}

/** Топология собранной схемы: ветви, число узлов и остров каждого узла. */
export interface Topology {
  readonly branches: readonly TopologyBranch[];
  /** Узлы нумеруются по порядку первого упоминания в ветвях. */
  readonly nodeCount: number;
  /** Имя острова узла: корень объединения узлов, соединённых ветвями. */
  readonly islandOf: (node: number) => string;
}

/** Ветви Компонента: две у трёхвыводных, одна у остальных. */
function branchesOf(
  component: PlacedComponent,
  nodeOf: (componentId: string, pin: number) => number,
): TopologyBranch[] {
  if (component.kind === 'transistor') {
    // переход база—эмиттер и переход коллектор—эмиттер
    return [
      {
        component,
        pinA: BASE_PIN,
        pinB: EMITTER_PIN,
        nodeA: nodeOf(component.id, BASE_PIN),
        nodeB: nodeOf(component.id, EMITTER_PIN),
      },
      {
        component,
        pinA: COLLECTOR_PIN,
        pinB: EMITTER_PIN,
        nodeA: nodeOf(component.id, COLLECTOR_PIN),
        nodeB: nodeOf(component.id, EMITTER_PIN),
      },
    ];
  }
  if (component.kind === 'potentiometer') {
    // выводы: 0 и 2 — концы сопротивления, 1 — движок
    return [
      { component, pinA: 0, pinB: 1, nodeA: nodeOf(component.id, 0), nodeB: nodeOf(component.id, 1) },
      { component, pinA: 1, pinB: 2, nodeA: nodeOf(component.id, 1), nodeB: nodeOf(component.id, 2) },
    ];
  }
  return [
    { component, pinA: 0, pinB: 1, nodeA: nodeOf(component.id, 0), nodeB: nodeOf(component.id, 1) },
  ];
}

/** Система непересекающихся множеств с двухпроходным сжатием путей. */
export class DisjointSet {
  private readonly parent = new Map<string, string>();

  /** Неизвестный элемент — сам себе корень: множество растёт по мере union/find. */
  find(item: string): string {
    let root = item;
    for (;;) {
      const upstream = this.parent.get(root);
      if (upstream === undefined || upstream === root) break;
      root = upstream;
    }
    let current = item;
    while (current !== root) {
      const next = this.parent.get(current) ?? root;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }
}

/**
 * Строит топологию собранной схемы. Провода, ссылающиеся на несуществующие
 * Компоненты, игнорируются — Холст мог быть сохранён частично.
 */
export function buildTopology(canvas: CanvasState): Topology {
  // Провода объединяют выводы в узлы; корень объединения — имя узла
  const knownIds = new Set(canvas.components.map((component) => component.id));
  const pinSets = new DisjointSet();
  for (const wire of canvas.wires) {
    if (!knownIds.has(wire.from.componentId) || !knownIds.has(wire.to.componentId)) continue;
    pinSets.union(pinKey(wire.from.componentId, wire.from.pin), pinKey(wire.to.componentId, wire.to.pin));
  }

  // Узлы нумеруются по порядку первого упоминания
  const nodeIndex = new Map<string, number>();
  const nodeOf = (componentId: string, pin: number): number => {
    const root = pinSets.find(pinKey(componentId, pin));
    let index = nodeIndex.get(root);
    if (index === undefined) {
      index = nodeIndex.size;
      nodeIndex.set(root, index);
    }
    return index;
  };

  const branches = canvas.components.flatMap((component) => branchesOf(component, nodeOf));

  // Остров — множество узлов, соединённых ветвями; имя острова — корень объединения
  const islandSets = new DisjointSet();
  for (const branch of branches) {
    if (branch.nodeA !== branch.nodeB) islandSets.union(String(branch.nodeA), String(branch.nodeB));
  }
  return {
    branches,
    nodeCount: nodeIndex.size,
    islandOf: (node: number) => islandSets.find(String(node)),
  };
}
