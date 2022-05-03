import { Worker } from "worker_threads";
import assert from "assert";
const test = (size: number, type: string) => {
  const worker = new Worker("./s.js");

  let data: any = {};
  if (type === "map") {
    data = new Map();
    for (let i = 0; i < size; i++) {
      data.set(i, i);
    }
  }
  if (type === "buffer") {
    data = new Uint32Array(
      new SharedArrayBuffer(size * 2 * Uint32Array.BYTES_PER_ELEMENT)
    );
    for (let i = 0; i < size; i++) {
      data[i] = data[size + i] = i;
    }
  }
  const st = +new Date();
  return new Promise((r) => {
    worker.addListener("message", (copy) => {
      const ed = +new Date();
      console.log(type, size, ed - st);
    //   assert.deepEqual(data, copy.data);
      worker.terminate();
      r(0);
    });

    worker.postMessage({ data, type });
  });
};
async function main() {
  for (let i = 0; i < 20; i++) {
    await test(10 << i, "map");
    await test(10 << i, "buffer");
  }
}

main();
