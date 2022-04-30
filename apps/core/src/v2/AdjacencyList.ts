import type { AdjacencyListStats, IAdjacencyList } from "@parcel-graph/type";
import assert from "assert";
import { AllEdgeTypes } from "@parcel-graph/type";
import { SharedBuffer } from "../SharedBuffer";
import { hash32shift } from "../share";
import { nullthrows } from "../share";

/** The upper bound above which capacity should be increased. */
const LOAD_FACTOR = 0.7;
/** The lower bound below which capacity should be decreased. */
const UNLOAD_FACTOR = 0.3;
/** The max amount by which to grow the capacity. */
const MAX_GROW_FACTOR = 8;
/** The min amount by which to grow the capacity. */
const MIN_GROW_FACTOR = 2;
/** The amount by which to shrink the capacity. */
const SHRINK_FACTOR = 0.5;

function interpolate(x: number, y: number, t: number): number {
  return x + (y - x) * Math.min(1, Math.max(0, t));
}

function increaseNodeCapacity(nodeCapacity: number): number {
  let { MIN_CAPACITY, MAX_CAPACITY } = NodeTypeMap;
  let newCapacity = Math.round(nodeCapacity * MIN_GROW_FACTOR);
  assert(newCapacity <= MAX_CAPACITY, "Node capacity overflow!");
  return Math.max(MIN_CAPACITY, newCapacity);
}

function getNextEdgeCapacity(
  capacity: number,
  count: number,
  load: number
): number {
  let { MIN_CAPACITY, MAX_CAPACITY, PEAK_CAPACITY } = EdgeTypeMap;
  let newCapacity = capacity;
  if (load > LOAD_FACTOR) {
    // This is intended to strike a balance between growing the edge capacity
    // in too small increments, which causes a lot of resizing, and growing
    // the edge capacity in too large increments, which results in a lot of
    // wasted memory.
    let pct = capacity / PEAK_CAPACITY;
    let growFactor = interpolate(MAX_GROW_FACTOR, MIN_GROW_FACTOR, pct);
    newCapacity = Math.round(capacity * growFactor);
  } else if (load < UNLOAD_FACTOR) {
    // In some cases, it may be possible to shrink the edge capacity,
    // but this is only likely to occur when a lot of edges have been removed.
    newCapacity = Math.round(capacity * SHRINK_FACTOR);
  }
  assert(newCapacity <= MAX_CAPACITY, "Edge capacity overflow!");
  return Math.max(MIN_CAPACITY, newCapacity);
}

export type SerializedAdjacencyList<T> = {
  nodes: Uint32Array;
  edges: Uint32Array;
  edgeCapacity?: never;
  nodeCapacity?: never;
};

// eslint-disable-next-line no-unused-vars
export type AdjacencyListOptions<T> = {
  nodes?: never;
  edges?: never;
  edgeCapacity?: number;
  nodeCapacity?: number;
};

export class AdjacencyList implements IAdjacencyList {
  #nodes: NodeTypeMap /*: NodeTypeMap<number | number> */;
  #edges: EdgeTypeMap /*: EdgeTypeMap<number | number> */;
  constructor(
    opts?: SerializedAdjacencyList<number> | AdjacencyListOptions<number>
  ) {
    let nodes;
    let edges;

    if (opts?.nodes) {
      ({ nodes, edges } = opts);
      this.#nodes = new NodeTypeMap(nodes);
      this.#edges = new EdgeTypeMap(edges);
    } else {
      let {
        nodeCapacity = NodeTypeMap.MIN_CAPACITY,
        edgeCapacity = EdgeTypeMap.MIN_CAPACITY,
      } = opts ?? {};
      assert(
        nodeCapacity <= NodeTypeMap.MAX_CAPACITY,
        "Node capacity overflow!"
      );
      assert(
        edgeCapacity <= EdgeTypeMap.MAX_CAPACITY,
        "Edge capacity overflow!"
      );
      this.#nodes = new NodeTypeMap(nodeCapacity);
      this.#edges = new EdgeTypeMap(edgeCapacity);
    }
  }
  getInboundEdges(from: number, type: number): Set<number> {
    return new Set();
  }
  get stats(): AdjacencyListStats {
    return {
      nodes: this.#nodes.count,
      edges: [...this.getAllEdges()].length,
      deleted: this.#edges.DELETES,
    };
  }
  getInboundEdge(from: number, type: number): Set<number> {
    return new Set();
  }
  getOutboundEdges(from: number, type: number): Set<number> {
    return new Set();
  }

  /**
   * Create a new `AdjacencyList` from the given options.
   */
  static deserialize(opts: SerializedAdjacencyList<number>): AdjacencyList {
    return new AdjacencyList(opts);
  }

  /**
   * Returns a serializable object of the nodes and edges in the graph.
   */
  serialize(): SerializedAdjacencyList<number> {
    return {
      nodes: this.#nodes.data,
      edges: this.#edges.data,
    };
  }

  /**
   * Resize the internal nodes array.
   *
   * This is used in `addNode` when the `numNodes` meets or exceeds
   * the allocated size of the `nodes` array.
   */
  resizeNodes(size: number) {
    const nodes = this.#nodes;
    // Allocate the required space for a `nodes` map of the given `size`.
    this.#nodes = new NodeTypeMap(size);
    // Copy the existing nodes into the new array.
    this.#nodes.set(nodes.data);
  }

  /**
   * Resize the internal edges array.
   *
   * This is used in `addEdge` when the `numEdges` meets or exceeds
   * the allocated size of the `edges` array.
   */
  resizeEdges(size: number) {
    // Allocate the required space for new `nodes` and `edges` maps.
    let copy = new AdjacencyList({
      nodeCapacity: this.#nodes.capacity,
      edgeCapacity: size,
    });

    // Copy the existing edges into the new array.
    copy.#nodes.nextId = this.#nodes.nextId;
    this.#edges.forEach(
      (edge) =>
        void copy.addEdge(
          this.#edges.from(edge),
          this.#edges.to(edge),
          this.#edges.typeOf(edge)
        )
    );

    // We expect to preserve the same number of edges.
    assert(
      this.#edges.count === copy.#edges.count,
      `Edge mismatch! ${this.#edges.count} does not match ${copy.#edges.count}.`
    );

    // Finally, copy the new data arrays over to this graph.
    this.#nodes = copy.#nodes;
    this.#edges = copy.#edges;
    return true;
  }

  /**
   * Adds a node to the graph.
   *
   * Returns the id of the added node.
   */
  addNode(): number {
    let id = this.#nodes.getId();
    // If we're in danger of overflowing the `nodes` array, resize it.
    if (this.#nodes.load > LOAD_FACTOR) {
      this.resizeNodes(increaseNodeCapacity(this.#nodes.capacity));
    }
    return id;
  }

  /**
   * Adds an edge to the graph.
   *
   * Returns `true` if the edge was added,
   * or `false` if the edge already exists.
   */
  addEdge(from: number, to: number, type: number | number = 1): boolean {
    assert(type > 0, `Unsupported edge type ${0}`);

    let hash = this.#edges.hash(from, to, type);
    let edge = this.#edges.addressOf(hash, from, to, type);

    // The edge is already in the graph; do nothing.
    if (edge !== null) return false;

    let capacity = this.#edges.capacity;
    // We add 1 to account for the edge we are adding.
    let count = this.#edges.count + 1;
    // Since the space occupied by deleted edges isn't reclaimed,
    // we include them in our count to avoid overflowing the `edges` array.
    let deletes = this.#edges.deletes;
    let total = count + deletes;
    // If we have enough space to keep adding edges, we can
    // put off reclaiming the deleted space until the next resize.
    if (this.#edges.getLoad(total) > LOAD_FACTOR) {
      if (this.#edges.getLoad(deletes) > UNLOAD_FACTOR) {
        // If we have a significant number of deletes, we compute our new
        // capacity based on the current count, even though we decided to
        // resize based on the sum total of count and deletes.
        // In this case, resizing is more like a compaction.
        this.resizeEdges(
          getNextEdgeCapacity(capacity, count, this.#edges.getLoad(count))
        );
      } else {
        this.resizeEdges(
          getNextEdgeCapacity(capacity, total, this.#edges.getLoad(total))
        );
      }
      // We must rehash because the capacity has changed.
      hash = this.#edges.hash(from, to, type);
    }

    let toNode = this.#nodes.addressOf(to, type);
    let fromNode = this.#nodes.addressOf(from, type);
    if (toNode === null || fromNode === null) {
      // If we're in danger of overflowing the `nodes` array, resize it.
      if (this.#nodes.load >= LOAD_FACTOR) {
        this.resizeNodes(increaseNodeCapacity(this.#nodes.capacity));
        // We need to update our indices since the `nodes` array has changed.
        toNode = this.#nodes.addressOf(to, type);
        fromNode = this.#nodes.addressOf(from, type);
      }
    }
    if (toNode === null) toNode = this.#nodes.add(to, type);
    if (fromNode === null) fromNode = this.#nodes.add(from, type);

    // Add our new edge to its hash bucket.
    edge = this.#edges.add(hash, from, to, type);

    // Link this edge to the node's list of incoming edges.
    let prevIn = this.#nodes.linkIn(toNode, edge);
    if (prevIn !== null) this.#edges.linkIn(prevIn, edge);

    // Link this edge to the node's list of outgoing edges.
    let prevOut = this.#nodes.linkOut(fromNode, edge);
    if (prevOut !== null) this.#edges.linkOut(prevOut, edge);

    return true;
  }

  *getAllEdges() {
    for (let edge of this.#edges) {
      yield {
        from: this.#edges.from(edge),
        to: this.#edges.to(edge),
        type: this.#edges.typeOf(edge),
      };
    }
  }

  /**
   * Check if the graph has an edge connecting the `from` and `to` nodes.
   */
  hasEdge(from: number, to: number, type: number | number = 1): boolean {
    const hash = this.#edges.hash(from, to, type);
    return this.#edges.addressOf(hash, from, to, type) !== null;
  }

  /**
   *
   */
  removeEdge(from: number, to: number, type = 1) {
    let hash = this.#edges.hash(from, to, type);
    let edge = this.#edges.addressOf(hash, from, to, type);

    // The edge is not in the graph; do nothing.
    if (edge === null) return false;

    let toNode = nullthrows(this.#nodes.addressOf(to, type));
    let fromNode = nullthrows(this.#nodes.addressOf(from, type));

    // Update the terminating node's first and last incoming edges.
    this.#nodes.unlinkIn(
      toNode,
      edge,
      this.#edges.prevIn(edge),
      this.#edges.nextIn(edge)
    );

    // Update the originating node's first and last outgoing edges.
    this.#nodes.unlinkOut(
      fromNode,
      edge,
      this.#edges.prevOut(edge),
      this.#edges.nextOut(edge)
    );

    // Splice the removed edge out of the linked list of edges in the bucket.
    this.#edges.unlink(hash, edge);
    // Splice the removed edge out of the linked list of incoming edges.
    this.#edges.unlinkIn(edge);
    // Splice the removed edge out of the linked list of outgoing edges.
    this.#edges.unlinkOut(edge);
    // Finally, delete the edge.
    this.#edges.delete(edge);
    return true;
  }

  hasInboundEdges(to: number): boolean {
    let node = this.#nodes.head(to);
    while (node !== null) {
      if (this.#nodes.firstIn(node) !== null) return true;
      node = this.#nodes.next(node);
    }
    return false;
  }

  getInboundEdgesByType(to: number): { type: number; from: number }[] {
    let edges = [];
    let node = this.#nodes.head(to);
    while (node !== null) {
      let type = this.#nodes.typeOf(node);
      let edge = this.#nodes.firstIn(node);
      while (edge !== null) {
        let from = this.#edges.from(edge);
        edges.push({ from, type });
        edge = this.#edges.nextIn(edge);
      }
      node = this.#nodes.next(node);
    }
    return edges;
  }

  getOutboundEdgesByType(from: number): { type: number; to: number }[] {
    const edges = [];
    let node = this.#nodes.head(from);
    while (node !== null) {
      let type = this.#nodes.typeOf(node);
      let edge = this.#nodes.firstOut(node);
      while (edge !== null) {
        let to = this.#edges.to(edge);
        edges.push({ to, type });
        edge = this.#edges.nextOut(edge);
      }
      node = this.#nodes.next(node);
    }
    return edges;
  }

  /**
   * Get the list of nodes connected from this node.
   */
  getNodeIdsConnectedFrom(from: number, type = 1): number[] {
    let matches = (node: number) =>
      type === AllEdgeTypes ||
      (Array.isArray(type)
        ? type.includes(this.#nodes.typeOf(node))
        : type === this.#nodes.typeOf(node));

    let nodes = [];
    let node = this.#nodes.head(from);
    while (node !== null) {
      if (matches(node)) {
        let edge = this.#nodes.firstOut(node);
        while (edge !== null) {
          nodes.push(this.#edges.to(edge));
          edge = this.#edges.nextOut(edge);
        }
      }
      node = this.#nodes.next(node);
    }
    return nodes;
  }

  /**
   * Get the list of nodes connected to this node.
   */
  getNodeIdsConnectedTo(to: number, type = 1): number[] {
    let matches = (node: number) =>
      type === AllEdgeTypes ||
      (Array.isArray(type)
        ? type.includes(this.#nodes.typeOf(node))
        : type === this.#nodes.typeOf(node));

    let nodes = [];
    let node = this.#nodes.head(to);
    while (node !== null) {
      if (matches(node)) {
        let edge = this.#nodes.firstIn(node);
        while (edge !== null) {
          nodes.push(this.#edges.from(edge));
          edge = this.#edges.nextIn(edge);
        }
      }
      node = this.#nodes.next(node);
    }
    return nodes;
  }

  inspect() {
    return {
      nodes: this.#nodes.inspect(),
      edges: this.#edges.inspect(),
    };
  }
}

export default {};

/**
 * `SharedTypeMap` is a hashmap of items,
 * where each item has its own 'type' field.
 *
 * The `SharedTypeMap` is backed by a shared array buffer of fixed length.
 * The buffer is partitioned into:
 * - a header, which stores the capacity and number of items in the map,
 * - a hash table, which is an array of pointers to linked lists of items
 *   with the same hash,
 * - an items array, which is where the linked items are stored.
 *
 *            hash table                 item
 *            (capacity)             (ITEM_SIZE)
 *         ┌──────┴──────┐             ┌──┴──┐
 *   ┌──┬──┬──┬───────┬──┬──┬──┬───────┬──┬──┐
 *   │  │  │  │  ...  │  │  │  │  ...  │  │  │
 *   └──┴──┴──┴───────┴──┴──┴──┴───────┴──┴──┘
 *   └──┬──┘             └─────────┬─────────┘
 *    header                     items
 * (HEADER_SIZE)    (capacity * ITEM_SIZE * BUCKET_SIZE)
 *
 *
 * An item is added with a hash key that fits within the range of the hash
 * table capacity. The item is stored at the next available address after the
 * hash table, and a pointer to the address is stored in the hash table at
 * the index matching the hash. If the hash is already pointing at an item,
 * the pointer is stored in the `next` field of the existing item instead.
 *
 *       hash table                          items
 * ┌─────────┴────────┐┌───────────────────────┴────────────────────────┐
 *    0    1    2        11       17        23       29      35
 * ┌───┐┌───┐┌───┐┌───┐┌───┬───┐┌───┬───┐┌───┬───┐┌───┬───┐┌───┬───┐┌───┐
 * │17 ││11 ││35 ││...││23 │ 1 ││29 │ 1 ││ 0 │ 2 ││ 0 │ 2 ││ 0 │ 1 ││...│
 * └───┘└───┘└───┘└───┘└───┴───┘└───┴───┘└───┴───┘└───┴───┘└───┴───┘└───┘
 *   │    │    │         ▲        ▲        ▲        ▲        ▲
 *   └────┼────┼─────────┼────────┴────────┼────────┘        │
 *        └────┼─────────┴─────────────────┘                 │
 *             └─────────────────────────────────────────────┘
 */
export class SharedTypeMap implements Iterable<number> {
  /**
   * The header for the `SharedTypeMap` comprises 2 4-byte chunks:
   *
   * struct SharedTypeMapHeader {
   *   int capacity;
   *   int count;
   * }
   *
   * ┌──────────┬───────┐
   * │ CAPACITY │ COUNT │
   * └──────────┴───────┘
   */
  static #HEADER_SIZE: number = 2;

  /** The offset from the header where the capacity is stored. */
  static #CAPACITY: 0 = 0;
  /** The offset from the header where the count is stored. */
  static #COUNT: 1 = 1;

  /**
   * Each item in `SharedTypeMap` comprises 2 4-byte chunks:
   *
   * struct Node {
   *   int next;
   *   int type;
   * }
   *
   * ┌──────┬──────┐
   * │ NEXT │ TYPE │
   * └──────┴──────┘
   */
  static #ITEM_SIZE: number = 2;
  /** The offset at which a link to the next item in the same bucket is stored. */
  static #NEXT: 0 = 0;
  /** The offset at which an item's type is stored. */
  static #TYPE: 1 = 1;

  /** The number of items to accommodate per hash bucket. */
  static BUCKET_SIZE: number = 2;
  data: Uint32Array;

  get BUCKET_SIZE() {
    return SharedTypeMap.BUCKET_SIZE;
  }
  get HEADER_SIZE() {
    return SharedTypeMap.#HEADER_SIZE;
  }
  get ITEM_SIZE() {
    return SharedTypeMap.#ITEM_SIZE;
  }
  get NEXT() {
    return SharedTypeMap.#NEXT;
  }

  get capacity(): number {
    return this.data[SharedTypeMap.#CAPACITY] ?? 0;
  }

  get count(): number {
    return this.data[SharedTypeMap.#COUNT] ?? 0;
  }

  get load(): number {
    return this.getLoad();
  }

  get length(): number {
    return this.getLength();
  }

  get addressableLimit(): number {
    return this.HEADER_SIZE + this.capacity;
  }

  get bufferSize(): string {
    return `${(this.data.byteLength / 1024 / 1024).toLocaleString(undefined, {
      minimumIntegerDigits: 2,
      maximumFractionDigits: 2,
    })} mb`;
  }

  constructor(capacityOrData: number | Uint32Array = 16) {
    if (typeof capacityOrData === "number") {
      let { BYTES_PER_ELEMENT } = Uint32Array;
      let CAPACITY = SharedTypeMap.#CAPACITY;
      this.data = new Uint32Array(
        new SharedBuffer(this.getLength(capacityOrData) * BYTES_PER_ELEMENT)
      );
      this.data[CAPACITY] = capacityOrData;
    } else {
      this.data = capacityOrData;
      assert(this.getLength() === this.data.length, "Data appears corrupt.");
    }
  }
  *[Symbol.iterator](): Iterator<number> {
    let max = this.count;
    let len = this.length;
    for (
      let i = this.addressableLimit, count = 0;
      i < len && count < max;
      i += this.ITEM_SIZE
    ) {
      if (this.data.subarray(i, i + this.ITEM_SIZE).some(Boolean)) {
        yield i;
        count++;
      }
    }
  }

  getLoad(count: number = this.count): number {
    return count / (this.capacity * this.BUCKET_SIZE);
  }

  getLength(capacity: number = this.capacity): number {
    return (
      capacity + this.HEADER_SIZE + this.ITEM_SIZE * this.BUCKET_SIZE * capacity
    );
  }
  /** Get the next available address in the map. */
  getNextAddress(): number {
    const { HEADER_SIZE, ITEM_SIZE } = this;
    return HEADER_SIZE + this.capacity + this.count * ITEM_SIZE;
  }

  /** Get the next available address in the map. */
  getNextNumber(): number {
    return this.HEADER_SIZE + this.capacity + this.count * this.ITEM_SIZE;
  }

  /** Get the address of the first item with the given hash. */
  head(hash: number): number | null {
    return this.data[this.HEADER_SIZE + hash] ?? null;
  }

  /** Get the address of the next item with the same hash as the given item. */
  next(item: number): number | null {
    return this.data[item + this.NEXT] ?? null;
  }

  typeOf(item: number): number {
    return this.data[item + SharedTypeMap.#TYPE] ?? 0;
  }

  inspect(): {
    header: Uint32Array;
    table: Uint32Array;
    data: Uint32Array;
  } {
    const { HEADER_SIZE, ITEM_SIZE, BUCKET_SIZE } = this;
    let min = HEADER_SIZE + this.capacity;
    let max = min + this.capacity * BUCKET_SIZE * ITEM_SIZE;
    return {
      header: this.data.subarray(0, HEADER_SIZE),
      table: this.data.subarray(HEADER_SIZE, min),
      data: this.data.subarray(min, max),
    };
  }

  forEach(cb: (item: number) => void): void {
    const max = this.count;
    const len = this.length;
    const { ITEM_SIZE } = this;
    for (
      let i = this.addressableLimit, count = 0;
      i < len && count < max;
      i += ITEM_SIZE
    ) {
      // Skip items that don't have a type.
      if (this.typeOf(i)) {
        cb(i);
        count++;
      }
    }
  }
  set(data: Uint32Array): void {
    const { HEADER_SIZE, ITEM_SIZE } = this;
    let NEXT = SharedTypeMap.#NEXT;
    let COUNT = SharedTypeMap.#COUNT;
    let CAPACITY = SharedTypeMap.#CAPACITY;

    let delta = this.capacity - data[CAPACITY]!;
    assert(delta >= 0, "Cannot copy to a map with smaller capacity.");

    // Copy the header.
    this.data.set(data.subarray(COUNT, HEADER_SIZE), COUNT);

    // Copy the hash table.
    let toTable = this.data.subarray(HEADER_SIZE, HEADER_SIZE + this.capacity);
    toTable.set(data.subarray(HEADER_SIZE, HEADER_SIZE + data[CAPACITY]!));
    // Offset first links to account for the change in table capacity.
    let max = toTable.length;
    for (let i = 0; i < max; i++) {
      if (toTable[i]) toTable[i] += delta;
    }

    // Copy the items.
    let toItems = this.data.subarray(HEADER_SIZE + this.capacity);
    toItems.set(data.subarray(HEADER_SIZE + data[CAPACITY]!));
    // Offset next links to account for the change in table capacity.
    max = toItems.length;
    for (let i = 0; i < max; i += ITEM_SIZE) {
      if (toItems[i + NEXT]) toItems[i + NEXT] += delta;
    }
  }
  link(hash: number, item: number, type: number): void {
    const COUNT = SharedTypeMap.#COUNT;
    const NEXT = SharedTypeMap.#NEXT;
    const TYPE = SharedTypeMap.#TYPE;
    const { HEADER_SIZE } = this;

    this.data[item + TYPE] = type;

    let prev = this.head(hash);
    if (prev !== null) {
      let next = this.next(prev);
      while (next !== null) {
        prev = next;
        next = this.next(next);
      }
      this.data[prev + NEXT] = item;
    } else {
      // This is the first item in the bucket!
      this.data[HEADER_SIZE + hash] = item;
    }
    this.data[COUNT]++;
  }

  unlink(hash: number, item: number): void {
    const COUNT = SharedTypeMap.#COUNT;
    const NEXT = SharedTypeMap.#NEXT;
    const TYPE = SharedTypeMap.#TYPE;
    const { HEADER_SIZE } = this;

    this.data[item + TYPE] = 0;

    let head = this.head(hash);
    // No bucket to unlink from.
    if (head === null) return;

    let next = this.next(item);
    let prev = null;
    let candidate: number | null = head;
    while (candidate !== null && candidate !== item) {
      prev = candidate;
      candidate = this.next(candidate);
    }
    if (prev !== null && next !== null) {
      this.data[prev + NEXT] = next;
    } else if (prev !== null) {
      this.data[prev + NEXT] = 0;
    } else if (next !== null) {
      this.data[HEADER_SIZE + hash] = next;
    } else {
      this.data[HEADER_SIZE + hash] = 0;
    }
    this.data[item + NEXT] = 0;
    this.data[COUNT]--;
  }
}

const s = new SharedTypeMap();

/**
 * Nodes are stored in a `SharedTypeMap`, keyed on node id plus an edge type.
 * This means that for any given unique node id, there may be `e` nodes in the
 * map, where `e` is the number of possible edge types in the graph.
 */
export class NodeTypeMap extends SharedTypeMap {
  /**
   * In addition to the header defined by `SharedTypeMap`, the header for
   * the node map includes a 4-byte `nextId` chunk:
   *
   * struct NodeTypeMapHeader {
   *   int capacity; // from `SharedTypeMap`
   *   int count; // from `SharedTypeMap`
   *   int nextId;
   * }
   *
   * ┌──────────┬───────┬─────────┐
   * │ CAPACITY │ COUNT │ NEXT_ID │
   * └──────────┴───────┴─────────┘
   */
  static #HEADER_SIZE: number = 3;
  /** The offset from the header where the next available node id is stored. */
  static #NEXT_ID = 2;

  /**
   * In addition to the item fields defined by `SharedTypeMap`,
   * each node includes another 4 4-byte chunks:
   *
   * struct Node {
   *   int next; // from `SharedTypeMap`
   *   int type; // from `SharedTypeMap`
   *   int firstIn;
   *   int firstOut;
   *   int lastIn;
   *   int lastOut;
   * }
   *
   * ┌──────┬──────┬──────────┬───────────┬─────────┬──────────┐
   * │ NEXT │ TYPE │ FIRST_IN │ FIRST_OUT │ LAST_IN │ LAST_OUT │
   * └──────┴──────┴──────────┴───────────┴─────────┴──────────┘
   */
  static #ITEM_SIZE: number = 6;
  /** The offset at which a node's first incoming edge of this type is stored. */
  static #FIRST_IN = 2;
  /** The offset at which a node's first outgoing edge of this type is stored. */
  static #FIRST_OUT = 3;
  /** The offset at which a node's last incoming edge of this type is stored. */
  static #LAST_IN = 4;
  /** The offset at which a node's last outgoing edge of this type is stored. */
  static #LAST_OUT = 5;

  /** The smallest functional node map capacity. */
  static MIN_CAPACITY: number = 2;
  /** The largest possible node map capacity. */
  static MAX_CAPACITY: number = Math.floor(
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length#what_went_wrong
    (2 ** 31 - 1 - NodeTypeMap.#HEADER_SIZE) /
      NodeTypeMap.#ITEM_SIZE /
      NodeTypeMap.BUCKET_SIZE
  );

  get HEADER_SIZE() {
    return NodeTypeMap.#HEADER_SIZE;
  }
  get NEXT_ID() {
    return NodeTypeMap.#NEXT_ID;
  }
  get ITEM_SIZE() {
    return NodeTypeMap.#ITEM_SIZE;
  }
  get FIRST_IN() {
    return NodeTypeMap.#FIRST_IN;
  }
  get FIRST_OUT() {
    return NodeTypeMap.#FIRST_OUT;
  }
  get LAST_IN() {
    return NodeTypeMap.#LAST_IN;
  }
  get LAST_OUT() {
    return NodeTypeMap.#LAST_OUT;
  }
  get MIN_CAPACITY() {
    return NodeTypeMap.MIN_CAPACITY;
  }
  get MAX_CAPACITY() {
    return NodeTypeMap.MAX_CAPACITY;
  }
  get nextId(): number {
    return this.data[NodeTypeMap.#NEXT_ID]!;
  }
  set nextId(nextId: number) {
    this.data[NodeTypeMap.#NEXT_ID] = nextId;
  }

  /** Get a unique node id. */
  getId(): number {
    return this.data[NodeTypeMap.#NEXT_ID]++;
  }

  getLoad(count: number = this.count): number {
    return Math.max(this.nextId / this.capacity, super.getLoad(count));
  }
  add(node: number, type: number): number {
    assert(
      node >= 0 && node < this.data[NodeTypeMap.#NEXT_ID]!,
      `Invalid node id ${String(node)} (${this.data[NodeTypeMap.#NEXT_ID]})`
    );
    let address = this.getNextAddress();
    this.link(node, address, type);
    return address;
  }

  addressOf(node: number, type: number): number | null {
    let address = this.head(node);
    while (address !== null) {
      if (this.typeOf(address) === type) {
        return address;
      }
      address = this.next(address);
    }
    return null;
  }

  firstIn(node: number): number | null {
    return this.data[node + NodeTypeMap.#FIRST_IN] || null;
  }

  firstOut(node: number): number | null {
    return this.data[node + NodeTypeMap.#FIRST_OUT] || null;
  }

  lastIn(node: number): number | null {
    return this.data[node + NodeTypeMap.#LAST_IN] || null;
  }

  lastOut(node: number): number | null {
    return this.data[node + NodeTypeMap.#LAST_OUT] || null;
  }

  linkIn(node: number, edge: number): number | null {
    const first = this.firstIn(node);
    const last = this.lastIn(node);
    if (first === null) this.data[node + NodeTypeMap.#FIRST_IN] = edge;
    this.data[node + NodeTypeMap.#LAST_IN] = edge;
    return last;
  }

  unlinkIn(
    node: number,
    edge: number,
    prev: number | null,
    next: number | null
  ): void {
    const first = this.firstIn(node);
    const last = this.lastIn(node);
    if (last === edge) {
      this.data[node + NodeTypeMap.#LAST_IN] = prev === null ? 0 : prev;
    }
    if (first === edge) {
      this.data[node + NodeTypeMap.#FIRST_IN] = next === null ? 0 : next;
    }
  }

  linkOut(node: number, edge: number): number | null {
    const first = this.firstOut(node);
    const last = this.lastOut(node);
    if (first === null) this.data[node + NodeTypeMap.#FIRST_OUT] = edge;
    this.data[node + NodeTypeMap.#LAST_OUT] = edge;
    return last;
  }

  unlinkOut(
    node: number,
    edge: number,
    prev: number | null,
    next: number | null
  ): void {
    const first = this.firstOut(node);
    const last = this.lastOut(node);
    if (last === edge) {
      this.data[node + NodeTypeMap.#LAST_OUT] = prev === null ? 0 : prev;
    }
    if (first === edge) {
      this.data[node + NodeTypeMap.#FIRST_OUT] = next === null ? 0 : next;
    }
  }
}

/**
 * Edges are stored in a `SharedTypeMap`,
 * keyed on the 'from' and 'to' node ids, and the edge type.
 */
export class EdgeTypeMap extends SharedTypeMap {
  /**
   * In addition to the header defined by `SharedTypeMap`, the header for
   * the edge map includes a 4-byte `deletes` chunk:
   *
   * struct EdgeTypeMapHeader {
   *   int capacity; // from `SharedTypeMap`
   *   int count; // from `SharedTypeMap`
   *   int deletes;
   * }
   *
   * ┌──────────┬───────┬─────────┐
   * │ CAPACITY │ COUNT │ DELETES │
   * └──────────┴───────┴─────────┘
   */
  static #HEADER_SIZE: number = 3;
  /** The offset from the header where the delete count is stored. */
  static #DELETES = 2;

  /**
   * In addition to the item fields defined by `SharedTypeMap`,
   * each edge includes another 6 4-byte chunks:
   *
   * struct Edge {
   *   int next; // from `SharedTypeMap`
   *   int type; // from `SharedTypeMap`
   *   int from;
   *   int to;
   *   int nextIn;
   *   int prevIn;
   *   int nextOut;
   *   int prevOut;
   * }
   *
   * ┌──────┬──────┬──────┬────┬─────────┬─────────┬──────────┬──────────┐
   * │ NEXT │ TYPE │ FROM │ TO │ NEXT_IN │ PREV_IN │ NEXT_OUT │ PREV_OUT │
   * └──────┴──────┴──────┴────┴─────────┴─────────┴──────────┴──────────┘
   */
  static #ITEM_SIZE: number = 8;
  /** The offset at which an edge's 'from' node id is stored. */
  static #FROM = 2;
  /** The offset at which an edge's 'to' node id is stored. */
  static #TO = 3;
  /** The offset at which the 'to' node's next incoming edge is stored.  */
  static #NEXT_IN = 4;
  /** The offset at which the 'to' node's previous incoming edge is stored.  */
  static #PREV_IN = 5;
  /** The offset at which the 'from' node's next outgoing edge is stored.  */
  static #NEXT_OUT = 6;
  /** The offset at which the 'from' node's previous outgoing edge is stored.  */
  static #PREV_OUT = 7;

  /** The smallest functional edge map capacity. */
  static MIN_CAPACITY: number = 2;
  /** The largest possible edge map capacity. */
  static MAX_CAPACITY: number = Math.floor(
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length#what_went_wrong
    (2 ** 31 - 1 - EdgeTypeMap.#HEADER_SIZE) /
      EdgeTypeMap.#ITEM_SIZE /
      EdgeTypeMap.BUCKET_SIZE
  );
  /** The size after which to grow the capacity by the minimum factor. */
  static PEAK_CAPACITY: number = 2 ** 18;

  get deletes(): number {
    return this.data[EdgeTypeMap.#DELETES]!;
  }

  get DELETES(): number {
    return EdgeTypeMap.#DELETES;
  }
  get ITEM_SIZE(): number {
    return EdgeTypeMap.#ITEM_SIZE;
  }
  get FROM(): number {
    return EdgeTypeMap.#FROM;
  }
  get TO(): number {
    return EdgeTypeMap.#TO;
  }
  get NEXT_IN(): number {
    return EdgeTypeMap.#NEXT_IN;
  }
  get PREV_IN(): number {
    return EdgeTypeMap.#PREV_IN;
  }
  get NEXT_OUT(): number {
    return EdgeTypeMap.#NEXT_OUT;
  }
  get PREV_OUT(): number {
    return EdgeTypeMap.#PREV_OUT;
  }
  get MIN_CAPACITY(): number {
    return EdgeTypeMap.MIN_CAPACITY;
  }
  get MAX_CAPACITY(): number {
    return EdgeTypeMap.MAX_CAPACITY;
  }
  getNextAddress(): number {
    const { ITEM_SIZE } = this;
    return this.addressableLimit + (this.count + this.deletes) * ITEM_SIZE;
  }

  add(hash: number, from: number, to: number, type: number): number {
    assert(
      hash >= 0 && hash < this.capacity,
      `Invalid edge hash ${String(hash)}`
    );
    // Use the next available edge address.
    const edge = this.getNextAddress();
    // Add our new edge to its hash bucket.
    this.link(hash, edge, type);
    this.data[edge + EdgeTypeMap.#FROM] = from;
    this.data[edge + EdgeTypeMap.#TO] = to;
    return edge;
  }

  delete(edge: number): void {
    this.data[edge + EdgeTypeMap.#FROM] = 0;
    this.data[edge + EdgeTypeMap.#TO] = 0;
    this.data[EdgeTypeMap.#DELETES]++;
  }

  addressOf(
    hash: number,
    from: number,
    to: number,
    type: number
  ): number | null {
    let address = this.head(hash);
    while (address !== null) {
      if (
        this.typeOf(address) === type &&
        this.from(address) === from &&
        this.to(address) === to
      ) {
        return address;
      }
      address = this.next(address);
    }
    return null;
  }

  from(edge: number): number {
    return this.data[edge + EdgeTypeMap.#FROM]!;
  }

  to(edge: number): number {
    return this.data[edge + EdgeTypeMap.#TO]!;
  }

  nextIn(edge: number): number | null {
    return this.data[edge + EdgeTypeMap.#NEXT_IN] || null;
  }

  prevIn(edge: number): number | null {
    return this.data[edge + EdgeTypeMap.#PREV_IN] || null;
  }

  linkIn(edge: number, next: number) {
    this.data[edge + EdgeTypeMap.#NEXT_IN] = next;
    this.data[next + EdgeTypeMap.#PREV_IN] = edge;
  }

  unlinkIn(edge: number) {
    const next = this.nextIn(edge);
    const prev = this.prevIn(edge);
    this.data[edge + EdgeTypeMap.#NEXT_IN] = 0;
    this.data[edge + EdgeTypeMap.#PREV_IN] = 0;
    if (next !== null && prev !== null) {
      this.data[prev + EdgeTypeMap.#NEXT_IN] = next;
      this.data[next + EdgeTypeMap.#PREV_IN] = prev;
    } else if (next !== null) {
      this.data[next + EdgeTypeMap.#PREV_IN] = 0;
    } else if (prev !== null) {
      this.data[prev + EdgeTypeMap.#NEXT_IN] = 0;
    }
  }

  nextOut(edge: number): number | null {
    return this.data[edge + EdgeTypeMap.#NEXT_OUT] || null;
  }

  prevOut(edge: number): number | null {
    return this.data[edge + EdgeTypeMap.#PREV_OUT] || null;
  }

  linkOut(edge: number, next: number) {
    this.data[edge + EdgeTypeMap.#NEXT_OUT] = next;
    this.data[next + EdgeTypeMap.#PREV_OUT] = edge;
  }

  unlinkOut(edge: number) {
    const next = this.nextOut(edge);
    const prev = this.prevOut(edge);
    this.data[edge + EdgeTypeMap.#NEXT_OUT] = 0;
    this.data[edge + EdgeTypeMap.#PREV_OUT] = 0;
    if (next !== null && prev !== null) {
      this.data[prev + EdgeTypeMap.#NEXT_OUT] = next;
      this.data[next + EdgeTypeMap.#PREV_OUT] = prev;
    } else if (next !== null) {
      this.data[next + EdgeTypeMap.#PREV_OUT] = 0;
    } else if (prev !== null) {
      this.data[prev + EdgeTypeMap.#NEXT_OUT] = 0;
    }
  }

  /** Create a hash of the edge connecting the `from` and `to` nodes.  */
  hash(from: number, to: number, type: number): number {
    // Each parameter is hashed by mixing its upper bits into its lower bits to
    // increase the likelihood that a change to any bit of the input will vary
    // the output widely. Then we do a series of prime multiplications and
    // additions to combine the hashes into one value.
    let hash = 17;
    hash = hash * 37 + hash32shift(from);
    hash = hash * 37 + hash32shift(to);
    hash = hash * 37 + hash32shift(type);
    // Finally, we map the hash to a value modulo the edge capacity.
    hash %= this.capacity;
    return hash;
  }
}