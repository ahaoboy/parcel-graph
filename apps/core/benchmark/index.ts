// @ts-nocheck
import Benchmark from "benchmark";
import type { IGraph } from "@parcel-graph/type";
import { V1, V2 } from "../src";
import * as V0 from "@parcel/graph";
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
const test = (Graph: new () => IGraph) => {
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
};

const suite = new Benchmark.Suite();
const f0 = () => {
  test(V0.Graph);
};
const f1 = () => {
  test(V1.Graph);
};
const f2 = () => {
  test(V2.Graph);
};
suite
  .add("v0", f0)
  .add("v1", f1)
  .add("v2", f2)
  .on("cycle", function (event) {
    console.log(String(event.target));
  })
  .on("complete", function () {
    console.log("Fastest is ", this.filter("fastest").map("name"));
    console.log("name is ", this.map("name"));
    console.log(
      "mean is ",
      this.map("stats").map((x) => x.mean)
    );
  })
  .run({ async: true });
