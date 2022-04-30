export interface IGraph<N = number> {
  addNode: (node: N) => number;
  hasNode: (nodeId: number) => boolean;
  getNode: (id: number) => N | null;
  nodes: Map<number, N>;
  getAllEdges: () => Generator<{
    from: number;
    to: number;
    type: number;
  }>;
  addEdge: (from: number, to: number, type?: number) => boolean;
  removeEdge: (from: number, to: number, type?: number) => boolean;
  serialize: () => { nodes: Uint32Array; edges: Uint32Array };
  getNodeIdsConnectedTo: (nodeId: number, type?: number) => number[];
  getNodeIdsConnectedFrom: (nodeId: number, type?: number) => number[];
  hasEdge: (from: number, to: number, type?: number) => boolean;
  resizeEdges: (n: number) => boolean;

  traverse<Context>(
    visit: (node?: N, c?: Context) => void,
    startNodeId: number,
    type?: number
  ): void;

  replaceNodeIdsConnectedTo(
    fromNodeId: number,
    toNodeIds: number[],
    replaceFilter?: (nodeId: number) => boolean,
    type?: number
  ): void;

  setRootNodeId: (nodeId: number) => void;
  isOrphanedNode: (nodeId: number) => boolean;
  removeNode: (nodeId: number) => boolean;
}
export type NodeId = number;
export type TraversalActions = {
  skipChildren: () => void;
  stop: () => void;
};

export type GraphVisitor<NodeId, TContext> = any;

export const NullEdgeType = 1;
export type NullEdgeType = 1;
export type AllEdgeTypes = -1;
export const AllEdgeTypes = -1;

export type AdjacencyListStats = {
  nodes: number;
  edges: number;
  deleted: number;
};
export interface IAdjacencyList {
  stats: AdjacencyListStats;
  addNode: () => number;
  addEdge: (from: number, to: number, type?: number) => boolean;
  removeEdge: (from: number, to: number, type?: number) => boolean;
  serialize: () => { nodes: Uint32Array; edges: Uint32Array };
  getNodeIdsConnectedTo: (nodeId: number, type?: number) => number[];
  getNodeIdsConnectedFrom: (nodeId: number, type?: number) => number[];
  getAllEdges: () => Generator<{
    from: number;
    to: number;
    type: number;
  }>;
  hasEdge: (from: number, to: number, type?: number) => boolean;
  resizeEdges: (n: number) => boolean;
  hasInboundEdges: (to: number) => boolean;
}
