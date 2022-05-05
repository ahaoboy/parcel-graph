import type { IAdjacencyList } from "@parcel-graph/type";
import { assert } from "../share";
import { NullEdgeType, AllEdgeTypes } from "@parcel-graph/type";
export class AdjacencyList implements IAdjacencyList {
  private _inboundEdges: Map<number, Map<number, Set<number>>> = new Map<
    number,
    Map<number, Set<number>>
  >();
  private _outboundEdges: Map<number, Map<number, Set<number>>> = new Map<
    number,
    Map<number, Set<number>>
  >();
  private _nodesSet: Set<number> = new Set();
  private _NEXT_NODE_ID = 0;
  constructor() {
  }
  private _addEdgeTo(
    from: number,
    to: number,
    type: number,
    map: Map<number, Map<number, Set<number>>>
  ) {
    let typeMap = map.get(from);
    if (!typeMap) {
      typeMap = new Map<number, Set<number>>();
      map.set(from, typeMap);
    }
    let toSet = typeMap.get(type);
    if (!toSet) {
      toSet = new Set<number>();
      typeMap.set(type, toSet);
    }
    toSet.add(to);
  }
  addEdge(from: number, to: number, type = NullEdgeType) {
    assert(type > 0, `Unsupported edge type ${0}`);
    if (!(this._nodesSet.has(from) && this._nodesSet.has(to))) {
      throw new Error(`muse addNode before addEdge`);
    }
    if (this.hasEdge(from, to, type)) return false;
    this._addEdgeTo(from, to, type, this._outboundEdges);
    this._addEdgeTo(to, from, type, this._inboundEdges);
    return true;
  }
  removeEdge(from: number, to: number, type = NullEdgeType) {
    if (!this.hasEdge(from, to, type)) {
      return false;
    }
    this._outboundEdges.get(from)?.get(type)?.delete(to);
    this._inboundEdges.get(to)?.get(type)?.delete(from);
    return true;
  }
  info() {
    return {
      in: this._inboundEdges,
      out: this._outboundEdges,
      nodes: this._nodesSet,
    };
  }
  serialize() {
    // const nodes = Uint32Array.from(this.nodes);
    // const edges = Uint32Array.from(
    //   [...this.getAllEdges()]
    //     .map(({ from, type, to }) => [from, type, to])
    //     .flat()
    // );
    return {
      nodes: this.nodes,
      edges: [...this.getAllEdges()],
    };
  }
  getNodeIdsConnectedTo(to: number, type: number | number[] = NullEdgeType) {
    const typeSet = new Set<number>(Array.isArray(type) ? type : [type]);
    const typeMap = this._inboundEdges.get(to);
    if (!typeMap?.size) return [];
    const keys = [...typeMap.keys()].filter(
      (i) => typeSet.has(AllEdgeTypes) || typeSet.has(i)
    );
    const nodes = new Set<number>();
    for (const k of keys) {
      for (const id of typeMap.get(k) ?? []) {
        nodes.add(id);
      }
    }
    return nodes;
  }
  getNodeIdsConnectedFrom(from: number, type = NullEdgeType) {
    const typeSet = new Set<number>(Array.isArray(type) ? type : [type]);
    const typeMap = this._outboundEdges.get(from);
    if (!typeMap?.size) return [];
    const keys = [...typeMap.keys()].filter(
      (i) => typeSet.has(AllEdgeTypes) || typeSet.has(i)
    );
    const nodes = new Set<number>();

    for (const k of keys) {
      for (const id of typeMap.get(k) ?? []) {
        nodes.add(id);
      }
    }
    return nodes;
  }
  get nodes() {
    return [...this._nodesSet];
  }
  *getAllEdges() {
    for (const [from, typeMap] of this._outboundEdges) {
      for (const [type, toSet] of typeMap) {
        for (const to of toSet) {
          yield { from, to, type };
        }
      }
    }
  }
  hasEdge(from: number, to: number, type = NullEdgeType) {
    return !!this._outboundEdges.get(from)?.get(type)?.has(to);
  }

  resizeEdges(n: number = 1) {
    return !!n;
  }
  addNode() {
    const id = this._NEXT_NODE_ID++;
    this._nodesSet.add(id);
    return id;
  }
  get stats() {
    return {
      nodes: this._nodesSet.size,
      edges: [...this.getAllEdges()].length,
      deleted: this._inboundEdges.size,
    };
  }
  hasInboundEdges(to: number): boolean {
    return !!this._inboundEdges.get(to)?.keys.length;
  }
  removeNode(nodeId: number) {
    this._inboundEdges.delete(nodeId);
    this._outboundEdges.delete(nodeId);
  }
  getInboundEdges(from: number, type: number): Set<number> {
    return this._inboundEdges?.get(from)?.get(type) ?? new Set<number>();
  }
  getOutboundEdges(from: number, type: number): Set<number> {
    return this._outboundEdges?.get(from)?.get(type) ?? new Set<number>();
  }
  getOutboundEdgesByType(from: number): { type: number; to: number }[] {
    const edges: { type: number; to: number }[] = [];
    const map = this._outboundEdges.get(from);
    if (map) {
      for (const [type, toSet] of map)
        for (const to of toSet) {
          edges.push({ type, to });
        }
    }
    return edges;
  }
  getInboundEdgesByType(to: number): { type: number; from: number }[] {
    const edges: { type: number; from: number }[] = [];
    const map = this._inboundEdges.get(to);
    if (map) {
      {
        for (const [type, fromSet] of map)
          for (const from of fromSet) {
            edges.push({ type, from });
          }
      }
    }
    return edges;
  }
}
