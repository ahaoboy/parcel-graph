import type { IGraph } from "@parcel-graph/type";
const n = 10000;
const type = 10;
const edges = Array(n * 100)
    .fill(0)
    .map(() => {
        const from = 1 + ((Math.random() * n) | 0);
        const to = 1 + ((Math.random() * n) | 0);
        const t = 1 + ((Math.random() * type) | 0);
        return [from, to, t] as const;
    });
export const test = (Graph: new () => IGraph) => {
    console.log('start')
    const g = new Graph();
    const idMap: Record<number, number> = {};
    for (let i = 0; i <= n; i++) {
        const id = g.addNode(i);
        idMap[i] = id;
    }
    for (const [f, to, t] of edges) {
        g.addEdge(idMap[f], idMap[to], t);
    }
    for (const [f, to, t] of edges) {
        g.hasEdge(idMap[f], idMap[to], t);
    }

    for (let i = 0; i < n; i++) {
        g.getNodeIdsConnectedTo(idMap[i]);
        g.getNodeIdsConnectedFrom(idMap[i]);
        g.getNodeIdsConnectedFrom(idMap[i]);
        g.getNodeIdsConnectedTo(idMap[i]);
    }

    return g
}
