const { parentPort } = require("worker_threads");
parentPort.once("message", ({ type, data }) => {
  let size = 0;
  if (type === "map") {
    size = data.size;
  }
  if (type === "buffer") size = data.length;
  parentPort.postMessage({ size });
});
