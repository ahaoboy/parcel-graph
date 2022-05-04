import type { IGraph } from "@parcel-graph/type";
import { V2, V1 } from "../src";
const test = (Graph: new () => IGraph, type: string) => {
    const n = 1000;
    const ty = 10;
    const edges = Array(n * 100)
        .fill(0)
        .map(() => {
            const from = 1 + ((Math.random() * n) | 0);
            const to = 1 + ((Math.random() * n) | 0);
            const t = 1 + ((Math.random() * ty) | 0);
            return [from, to, t] as const;
        });

    const g = new Graph();
    const idMap: Record<number, number> = {};
    for (let i = 0; i <= n; i++) {
        const id = g.addNode(i);
        idMap[i] = id;
    }
    for (const [f, to, t] of edges) {
        // @ts-ignore
        g.addEdge(idMap[f], idMap[to], t);
    }

    const st = +new Date();
    for (const [f, to, t] of edges) {
        // @ts-ignore
        g.removeEdge(idMap[f], idMap[to], t);
    }

    const ed = +new Date();
    console.log(type, [...g.getAllEdges()], g.nodes.size, ed - st)
};
async function main() {
    for (let i = 0; i < 10; i++) {
        await test(V1.Graph, "v1");
        await test(V2.Graph, "v2");
    }
}

main();
