export function buildReverseAdjacency(
  graph: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, Set<string>> {
  const reverse = new Map<string, Set<string>>();
  for (const [from, targets] of graph) {
    for (const to of targets) {
      let incoming = reverse.get(to);
      if (!incoming) {
        incoming = new Set<string>();
        reverse.set(to, incoming);
      }
      incoming.add(from);
    }
  }
  return reverse;
}

export function collectNeighborhood(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  focus: string,
  depth: number
): Set<string> {
  const reverse = buildReverseAdjacency(graph);
  const visited = new Set<string>([focus]);
  let frontier: string[] = [focus];

  for (let hop = 0; hop < depth; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      expandInto(graph.get(node), visited, next);
      expandInto(reverse.get(node), visited, next);
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return visited;
}

function expandInto(
  neighbors: ReadonlySet<string> | undefined,
  visited: Set<string>,
  next: string[]
): void {
  if (!neighbors) return;
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      visited.add(neighbor);
      next.push(neighbor);
    }
  }
}

export function scopeGraphToNodes(
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  nodes: ReadonlySet<string>
): Map<string, Set<string>> {
  const scoped = new Map<string, Set<string>>();
  for (const node of nodes) {
    const targets = graph.get(node);
    const kept = new Set<string>();
    if (targets) {
      for (const target of targets) {
        if (nodes.has(target)) kept.add(target);
      }
    }
    scoped.set(node, kept);
  }
  return scoped;
}

export function filterCyclesByNeighborhood(
  cycles: ReadonlyArray<ReadonlyArray<string>>,
  neighborhood: ReadonlySet<string>
): string[][] {
  const result: string[][] = [];
  for (const cycle of cycles) {
    for (const node of cycle) {
      if (neighborhood.has(node)) {
        result.push(cycle.slice());
        break;
      }
    }
  }
  return result;
}
