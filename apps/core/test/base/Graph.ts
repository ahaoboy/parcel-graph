import { IAdjacencyList, IGraph } from "@parcel-graph/type";
import { it, assert, describe } from "vitest";
import { toNodeId } from "../../src/share";

export function test(Graph: new <T>() => IGraph<T>) {
  describe("Graph", () => {
    it("constructor should initialize an empty graph", () => {
      let graph = new Graph();
      assert.deepEqual(graph.nodes, new Map());
      assert.deepEqual([...graph.getAllEdges()], []);
    });

    it("addNode should add a node to the graph", () => {
      let graph = new Graph<{}>();
      let node = {};
      let id = graph.addNode(node);
      assert.equal(graph.nodes.get(id), node);
    });

    // it("errors when traversing a graph with no root", () => {
    //   let graph = new Graph();

    //   assert.throws(() => {
    //     graph.traverse(() => {}, -1);
    //   }, /A start node is required to traverse/);
    // });

    it("errors when traversing a graph with a startNode that doesn't belong", () => {
      let graph = new Graph();

      assert.throws(() => {
        graph.traverse(() => {}, toNodeId(-1));
      }, /Does not have node/);
    });

    it("errors if replaceNodeIdsConnectedTo is called with a node that doesn't belong", () => {
      let graph = new Graph();
      assert.throws(() => {
        graph.replaceNodeIdsConnectedTo(toNodeId(-1), []);
      }, /Does not have node/);
    });

    it("errors when adding an edge to a node that doesn't exist", () => {
      let graph = new Graph();
      let node = graph.addNode({});
      assert.throws(() => {
        graph.addEdge(node, toNodeId(-1));
      }, /"to" node '-1' not found/);
    });

    it("errors when adding an edge from a node that doesn't exist", () => {
      let graph = new Graph();
      let node = graph.addNode({});
      assert.throws(() => {
        graph.addEdge(toNodeId(-1), node);
      }, /"from" node '-1' not found/);
    });

    it("hasNode should return a boolean based on whether the node exists in the graph", () => {
      let graph = new Graph();
      let node = graph.addNode({});
      assert(graph.hasNode(node));
      assert(!graph.hasNode(toNodeId(-1)));
    });
    it("addEdge should add an edge to the graph", () => {
      let graph = new Graph();
      let nodeA = graph.addNode("a");
      let nodeB = graph.addNode("b");
      graph.addEdge(nodeA, nodeB);
      assert(graph.hasEdge(nodeA, nodeB));
    });

    it("isOrphanedNode should return true or false if the node is orphaned or not", () => {
      let graph = new Graph();
      let rootNode = graph.addNode("root");
      graph.setRootNodeId(rootNode);

      let nodeA = graph.addNode("a");
      let nodeB = graph.addNode("b");
      let nodeC = graph.addNode("c");
      graph.addEdge(rootNode, nodeB);
      graph.addEdge(nodeB, nodeC, 1);

      assert(graph.isOrphanedNode(nodeA));
      assert(!graph.isOrphanedNode(nodeB));
      assert(!graph.isOrphanedNode(nodeC));
    });

    // it("removeEdge should prune the graph at that edge", () => {
    //   //         a
    //   //        / \
    //   //       b - d
    //   //      /
    //   //     c
    //   let graph = new Graph();
    //   let nodeA = graph.addNode("a");
    //   graph.setRootNodeId(nodeA);
    //   let nodeB = graph.addNode("b");
    //   let nodeC = graph.addNode("c");
    //   let nodeD = graph.addNode("d");
    //   graph.addEdge(nodeA, nodeB);
    //   graph.addEdge(nodeA, nodeD);
    //   graph.addEdge(nodeB, nodeC);
    //   graph.addEdge(nodeB, nodeD);

    //   graph.removeEdge(nodeA, nodeB);
    //   assert(graph.nodes.has(nodeA));
    //   assert(graph.nodes.has(nodeD));
    //   assert(!graph.nodes.has(nodeB));
    //   assert(!graph.nodes.has(nodeC));
    //   assert.deepEqual(
    //     [...graph.getAllEdges()],
    //     [{ from: nodeA, to: nodeD, type: 1 }]
    //   );
    // });
  });
}
