import { IGraph } from "@parcel-graph/type";
export const toNodeId = <T>(n: T) => n;
export const fromNodeId = <T>(n: T) => n;
export const nullthrows = <T>(
  n: T | null | undefined,
  info?: string
): NonNullable<T> => {
  return n as any;
};

export function assertHasNode<T>(graph: IGraph<T>, nodeId: number) {
  if (!graph.hasNode(nodeId)) {
    throw new Error("Does not have node " + nodeId);
  }
}
