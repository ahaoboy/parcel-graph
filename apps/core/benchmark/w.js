const { parentPort } = require("worker_threads");
const { V2, V1 } = require("../dist");
parentPort.once("message", ({ type, data }) => {
  let g;
  if (type === "v1") {
    g = V1.Graph.deserialize(data);
  }
  if (type === "v2") {
    g = V2.Graph.deserialize(data);
  }
  parentPort.postMessage(g.serialize());
});
