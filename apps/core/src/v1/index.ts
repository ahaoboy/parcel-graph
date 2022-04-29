export * from "./Graph";
export * from "./AdjacencyList";

function* g() {
  for (let i = 0; i < 10; i++) yield i;
}

const a = Array.from(g());
