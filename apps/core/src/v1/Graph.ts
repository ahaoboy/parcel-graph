import type { IGraph, NodeId, TraversalActions } from "@parcel-graph/type";
import { AdjacencyList } from "./AdjacencyList";
import { nullthrows } from "../share";
import { NullEdgeType, AllEdgeTypes } from "@parcel-graph/type";
type TContext = any;
type GraphVisitor<N, C> = any;

export class Graph<N> implements IGraph<N> {
  private _nodeToId = new Map<N, number>();
  private _idToNode = new Map<number, N>();
  private _rootNodeId: number = -1;
  private _adjacencyList = new AdjacencyList();
  constructor(opt?: any) {
    if (opt) {
      const { nodes, edges } = opt;
      for (const n of nodes) {
        this.addNode(n);
      }
      for (const { from, to, type } of edges) {
        this.addEdge(from, to, type);
      }
    }
  }
  setRootNodeId(nodeId: number) {
    this._rootNodeId = nodeId;
  }
  addEdge(from: number, to: number, type?: number | undefined) {
    if (Number(type) === 0) {
      throw new Error(`Edge type "${type}" not allowed`);
    }

    if (!this.getNode(from)) {
      throw new Error(`"from" node '${from}' not found`);
    }

    if (!this.getNode(to)) {
      throw new Error(`"to" node '${to}' not found`);
    }
    return this._adjacencyList.addEdge(from, to, type);
  }
  removeEdge(
    from: number,
    to: number,
    type?: number | undefined,
    removeNode = true
  ) {
    this._adjacencyList.removeEdge(from, to, type);
    if (removeNode && this.isOrphanedNode(to)) {
      this.removeNode(to);
    }
    return true;
  }
  getInboundEdgesByType() {}
  getOutboundEdgesByType() {}

  serialize() {
    return {
      ...this._adjacencyList.serialize(),
      nodeToId: this._nodeToId,
      idToNode: this._idToNode,
    };
  }
  getNodeIdsConnectedTo(
    nodeId: number,
    type: number | undefined | number[] = NullEdgeType
  ) {
    return this._adjacencyList.getNodeIdsConnectedTo(nodeId, type);
  }
  getNodeIdsConnectedFrom(nodeId: number, type?: number | undefined) {
    return this._adjacencyList.getNodeIdsConnectedFrom(nodeId, type);
  }

  hasEdge(from: number, to: number, type?: number | undefined) {
    return this._adjacencyList.hasEdge(from, to, type);
  }
  resizeEdges(n: number) {
    return true;
  }
  get nodes() {
    return this._idToNode;
  }

  addNode(node: N) {
    let id = this._nodeToId.get(node);
    if (id !== undefined) {
      return id;
    }
    id = this._adjacencyList.addNode();
    this._nodeToId.set(node, id);
    this._idToNode.set(id, node);
    return id;
  }

  hasNode(nodeId: number): boolean {
    return this._idToNode.has(nodeId);
  }

  removeNode(nodeId: number): boolean {
    const node = this._idToNode.get(nodeId);
    if (node) {
      for (const { type, from } of this._adjacencyList.getInboundEdgesByType(
        nodeId
      )) {
        this.removeEdge(from, nodeId, type, false);
      }
      for (const { type, to } of this._adjacencyList.getOutboundEdgesByType(
        nodeId
      )) {
        this.removeEdge(nodeId, to, type, true);
      }
      this._nodeToId.delete(node);
    }
    this._idToNode.delete(nodeId);
    return true;
  }

  getNode(id: number): N | null {
    return this._idToNode.get(id) ?? null;
  }

  getRootNode(): N | null {
    return this._rootNodeId ? this.getNode(this._rootNodeId) : null;
  }
  getAllEdges() {
    return this._adjacencyList.getAllEdges();
  }
  traverse(visit: any, startNodeId: number, type = NullEdgeType) {
    return this.dfs({
      visit,
      startNodeId,
      getChildren: (nodeId: number) =>
        this.getNodeIdsConnectedFrom(nodeId, type),
    });
  }
  _assertHasNodeId(nodeId: number) {
    if (!this.hasNode(nodeId)) {
      throw new Error("Does not have node " + nodeId);
    }
  }
  dfs<TContext>({
    visit,
    startNodeId,
    getChildren,
  }: {
    visit: any;
    startNodeId: number;
    getChildren: Function;
  }) {
    let traversalStartNode = nullthrows(
      startNodeId ?? this._rootNodeId,
      "A start node is required to traverse"
    );
    this._assertHasNodeId(traversalStartNode);

    let visited = new Set<NodeId>();
    let stopped = false;
    let skipped = false;
    let actions: TraversalActions = {
      skipChildren() {
        skipped = true;
      },
      stop() {
        stopped = true;
      },
    };

    const walk = (nodeId: number, context?: TContext): TContext | undefined => {
      if (!this.hasNode(nodeId)) return;
      visited.add(nodeId);

      skipped = false;
      let enter = typeof visit === "function" ? visit : visit.enter;
      if (enter) {
        let newContext = enter(nodeId, context, actions);
        if (typeof newContext !== "undefined") {
          // $FlowFixMe[reassign-const]
          context = newContext;
        }
      }

      if (skipped) {
        return;
      }

      if (stopped) {
        return context;
      }

      for (let child of getChildren(nodeId)) {
        if (visited.has(child)) {
          continue;
        }

        visited.add(child);
        let result = walk(child, context);
        if (stopped) {
          return result;
        }
      }

      if (
        typeof visit !== "function" &&
        visit.exit &&
        // Make sure the graph still has the node: it may have been removed between enter and exit
        this.hasNode(nodeId)
      ) {
        let newContext = visit.exit(nodeId, context, actions);
        if (typeof newContext !== "undefined") {
          // $FlowFixMe[reassign-const]
          context = newContext;
        }
      }

      if (skipped) {
        return;
      }

      if (stopped) {
        return context;
      }
    };

    return walk(traversalStartNode);
  }

  replaceNodeIdsConnectedTo(
    fromNodeId: number,
    toNodeIds: number[],
    replaceFilter?: (nodeId: number) => boolean,
    type = NullEdgeType
  ): void {
    this._assertHasNodeId(fromNodeId);
    let outboundEdges = this.getNodeIdsConnectedFrom(fromNodeId, type);
    let childrenToRemove = new Set(
      replaceFilter
        ? outboundEdges.filter((toNodeId) => replaceFilter(toNodeId))
        : outboundEdges
    );
    for (let toNodeId of toNodeIds) {
      childrenToRemove.delete(toNodeId);

      if (!this.hasEdge(fromNodeId, toNodeId, type)) {
        this.addEdge(fromNodeId, toNodeId, type);
      }
    }

    for (let child of childrenToRemove) {
      this.removeEdge(fromNodeId, child, type);
    }
  }

  setRootNode(nodeId: number) {
    this._rootNodeId = nodeId;
  }
  isOrphanedNode(nodeId: NodeId): boolean {
    if (!this.hasNode(nodeId)) {
      return false;
    }

    if (this._rootNodeId === null) {
      // If the graph does not have a root, and there are inbound edges,
      // this node should not be considered orphaned.
      return !this._adjacencyList.hasInboundEdges(nodeId);
    }

    // Otherwise, attempt to traverse backwards to the root. If there is a path,
    // then this is not an orphaned node.
    let hasPathToRoot = false;
    // go back to traverseAncestors
    this.traverseAncestors(
      nodeId,
      (ancestorId: number, _: any, actions: any) => {
        if (ancestorId === this._rootNodeId) {
          hasPathToRoot = true;
          actions.stop();
        }
      },
      AllEdgeTypes
    );

    if (hasPathToRoot) {
      return false;
    }

    return true;
  }

  traverseAncestors<TContext>(
    startNodeId: NodeId,
    visit: GraphVisitor<NodeId, TContext>,
    type = NullEdgeType
  ): TContext | undefined {
    return this.dfs<TContext>({
      visit,
      startNodeId,
      getChildren: (nodeId: number) => this.getNodeIdsConnectedTo(nodeId, type),
    });
  }
  static deserialize(opt?: any) {
    return new Graph(opt);
  }
}
