import { Graph, deserialize } from "../src/v1";
import { testGraph } from "./base/serialize";

testGraph(Graph, deserialize);
