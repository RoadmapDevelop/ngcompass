interface Frame {
  readonly node: string;
  readonly iterator: Iterator<string>;
}

export function findCircularDependencies(
  graph: ReadonlyMap<string, ReadonlySet<string>>
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const onStackDepth = new Map<string, number>();
  const path: string[] = [];
  const seenCycles = new Set<string>();
  const stack: Frame[] = [];

  for (const root of graph.keys()) {
    if (visited.has(root)) continue;
    pushFrame(root, graph, visited, onStackDepth, path, stack);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const next = top.iterator.next();

      if (next.done) {
        onStackDepth.delete(top.node);
        path.pop();
        stack.pop();
        continue;
      }

      const neighbor = next.value;
      const depthInPath = onStackDepth.get(neighbor);

      if (depthInPath !== undefined) {
        const cycle = path.slice(depthInPath);
        const key = canonicalKey(cycle);
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycle.push(neighbor);
          cycles.push(cycle);
        }
        continue;
      }

      if (!visited.has(neighbor)) {
        pushFrame(neighbor, graph, visited, onStackDepth, path, stack);
      }
    }
  }

  return cycles;
}

function pushFrame(
  node: string,
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  visited: Set<string>,
  onStackDepth: Map<string, number>,
  path: string[],
  stack: Frame[]
): void {
  visited.add(node);
  onStackDepth.set(node, path.length);
  path.push(node);
  const neighbors = graph.get(node);
  stack.push({
    node,
    iterator: neighbors ? neighbors.values() : EMPTY_ITERATOR,
  });
}

const EMPTY_ITERATOR: Iterator<string> = {
  next: () => ({ done: true, value: undefined }),
};

function canonicalKey(cycleNodes: ReadonlyArray<string>): string {
  let minIndex = 0;
  for (let i = 1; i < cycleNodes.length; i++) {
    if (cycleNodes[i] < cycleNodes[minIndex]) {
      minIndex = i;
    }
  }
  const length = cycleNodes.length;
  let key = cycleNodes[minIndex];
  for (let offset = 1; offset < length; offset++) {
    key += '|' + cycleNodes[(minIndex + offset) % length];
  }
  return key;
}
