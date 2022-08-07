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
  // serialize: () => {
  //   nodes: Uint32Array;
  //   // edges: Uint32Array
  // };
  serialize: () => any;
  getNodeIdsConnectedTo: (nodeId: number, type?: number) => Array<number>;
  getNodeIdsConnectedFrom: (nodeId: number, type?: number) => Array<number>;
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
  // serialize: () => {
  //   nodes: TypedArray;
  //   edges: TypedArray
  // };

  serialize: () => any;

  getAllEdges: () => Generator<{
    from: number;
    to: number;
    type: number;
  }>;

  hasEdge: (from: number, to: number, type?: number) => boolean;
  resizeEdges: (n: number) => boolean;
  hasInboundEdges: (to: number) => boolean;
  getNodeIdsConnectedTo: (nodeId: number, type?: number) => Array<number>;
  getNodeIdsConnectedFrom: (nodeId: number, type?: number) => Array<number>;
  getInboundEdges: (from: number, type: number) => Array<number>;
  getOutboundEdges: (from: number, type: number) => Array<number>;
  getOutboundEdgesByType: (from: number) => { type: number; to: number }[];
  getInboundEdgesByType: (to: number) => { type: number; from: number }[];
  // getNodesConnectedFrom: (from: number, type?: number) => number[];
  // getNodesConnectedTo: (to: number, type?: number) => number[];
}

export type TypedArrayConstructor =
  | Uint32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor;
export type TypedArray = Uint32Array | Uint16Array | Uint8Array;
