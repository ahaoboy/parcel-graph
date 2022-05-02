import { Worker } from "worker_threads";
import type { IGraph } from "@parcel-graph/type";
import { V2, V1 } from "../src";
import assert from "assert";
const test = (Graph: new () => IGraph, type: string) => {
  const worker = new Worker("./w.js");
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
  const data = g.serialize();
  return new Promise((r) => {
    worker.addListener("message", (copy) => {
      const ed = +new Date();
      console.log(type, ed - st);
      assert.deepEqual(data, copy);
      worker.terminate();
      r(0);
    });

    worker.postMessage({ data, type });
  });
};
async function main() {
  for (let i = 0; i < 10; i++) {
    await test(V1.Graph, "v1");
    await test(V2.Graph, "v2");
  }
}

main();
