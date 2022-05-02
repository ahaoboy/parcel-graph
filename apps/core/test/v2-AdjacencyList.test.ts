import { AdjacencyList } from "../src/v2";
import { test } from "./base/AdjacencyList";
import { it, assert, describe } from "vitest";
test(AdjacencyList);

describe("AdjacencyList", () => {
  it("addEdge should resize edges array when necessary", () => {
    let graph = new AdjacencyList();
    let size = graph.serialize().edges.byteLength;
    let a = graph.addNode();
    let b = graph.addNode();
    graph.addEdge(a, b, 1);
    graph.addEdge(a, b, 2);
    graph.addEdge(a, b, 3);
    console.log("size:", size, graph.serialize().edges.byteLength);
    assert(size < graph.serialize().edges.byteLength);
  });
});
