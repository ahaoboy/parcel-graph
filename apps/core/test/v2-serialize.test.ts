import { Graph, deserialize } from "../src/v2";
import { testGraph } from "./base/serialize";

testGraph(Graph, deserialize);
