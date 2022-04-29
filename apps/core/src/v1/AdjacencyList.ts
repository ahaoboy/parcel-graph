import type { AdjacencyListStats, IAdjacencyList } from "@parcel-graph/type";
import assert from "assert";
import { NullEdgeType, AllEdgeTypes } from "@parcel-graph/type";
export class AdjacencyList implements IAdjacencyList {
  #inboundEdges: Map<number, Map<number, Set<number>>> = new Map<
    number,
    Map<number, Set<number>>
  >();
  #outboundEdges: Map<number, Map<number, Set<number>>> = new Map<
    number,
    Map<number, Set<number>>
  >();
  #nodesSet: Set<number> = new Set();
  #NEXT_NODE_ID = 0;
  #addEdgeTo(
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
    if (!(this.#nodesSet.has(from) && this.#nodesSet.has(to))) {
      throw new Error(`muse addNode before addEdge`);
    }
    if (this.hasEdge(from, to, type)) return false;
    this.#addEdgeTo(from, to, type, this.#outboundEdges);
    this.#addEdgeTo(to, from, type, this.#inboundEdges);
    return true;
  }
  removeEdge(from: number, to: number, type = NullEdgeType) {
    if (!this.hasEdge(from, to, type)) {
      return false;
    }
    this.#outboundEdges.get(from)?.get(type)?.delete(to);
    this.#inboundEdges.get(to)?.get(type)?.delete(from);
    return true;
  }
  info() {
    return {
      in: this.#inboundEdges,
      out: this.#outboundEdges,
      nodes: this.#nodesSet,
    };
  }
  serialize() {
    const nodes = Uint32Array.from(this.nodes);
    const edges = Uint32Array.from(
      [...this.getAllEdges()]
        .map(({ from, type, to }) => [from, type, to])
        .flat()
    );
    return {
      nodes,
      edges,
    };
  }
  getNodeIdsConnectedTo(to: number, type: number | number[] = NullEdgeType) {
    const typeSet = new Set<number>(Array.isArray(type) ? type : [type]);
    const typeMap = this.#inboundEdges.get(to);
    if (!typeMap?.size) return [];
    const keys = [...typeMap.keys()].filter(
      (i) => typeSet.has(AllEdgeTypes) || typeSet.has(i)
    );
    const nodes: number[] = [];
    for (const k of keys) {
      for (const id of typeMap.get(k) ?? []) {
        nodes.push(id);
      }
    }
    return nodes;
  }
  getNodeIdsConnectedFrom(from: number, type = NullEdgeType) {
    const typeSet = new Set<number>(Array.isArray(type) ? type : [type]);
    const typeMap = this.#outboundEdges.get(from);
    if (!typeMap?.size) return [];
    const keys = [...typeMap.keys()].filter(
      (i) => typeSet.has(AllEdgeTypes) || typeSet.has(i)
    );
    const nodes: number[] = [];
    for (const k of keys) {
      for (const id of typeMap.get(k) ?? []) {
        nodes.push(id);
      }
    }
    return nodes;
  }
  get nodes() {
    return [...this.#nodesSet];
  }
  *getAllEdges() {
    for (const [from, typeMap] of this.#outboundEdges) {
      for (const [type, toSet] of typeMap) {
        for (const to of toSet) {
          yield { from, to, type };
        }
      }
    }
  }
  hasEdge(from: number, to: number, type = NullEdgeType) {
    return !!this.#outboundEdges.get(from)?.get(type)?.has(to);
  }

  resizeEdges(n: number = 1) {
    return !!n;
  }
  addNode() {
    const id = this.#NEXT_NODE_ID++;
    this.#nodesSet.add(id);
    return id;
  }
  get stats() {
    return {
      nodes: this.#nodesSet.size,
      edges: [...this.getAllEdges()].length,
      deleted: this.#inboundEdges.size,
    };
  }
  hasInboundEdges(to: number): boolean {
    return !!this.#inboundEdges.get(to)?.keys.length;
  }
}

export default {};
