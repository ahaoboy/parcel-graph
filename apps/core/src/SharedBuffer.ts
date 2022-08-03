export const SharedBuffer:
  | ArrayBufferConstructor
  | SharedArrayBufferConstructor = typeof SharedArrayBuffer
  ? SharedArrayBuffer
  : ArrayBuffer;
