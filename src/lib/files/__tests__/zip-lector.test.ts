import { describe, it, expect } from "vitest";
import { buildZipBlob, leerZip } from "../simple-zip";

describe("leerZip", () => {
  it('should read a ZIP with STORE method', async () => {
    const entries = [
      { path: 'hello.txt', data: 'Hello, World!' },
      { path: 'data.bin', data: new Uint8Array([1, 2, 3]) },
    ];
    const zipBlob = await buildZipBlob(entries);
    const arrayBuffer = await zipBlob.arrayBuffer();
    const result = await leerZip(arrayBuffer);
    expect(result).toHaveLength(2);
    expect(result[0].nombre).toBe('hello.txt');
    expect(new TextDecoder().decode(result[0].datos)).toBe('Hello, World!');
    expect(result[1].nombre).toBe('data.bin');
    expect(result[1].datos).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should read a ZIP with DEFLATE method', async () => {
    // TODO
  });

  it('should enforce limits', async () => {
    // TODO
  });

  it('should reject encrypted ZIPs', async () => {
    // TODO
  });

  it('should reject dangerous paths', async () => {
    // TODO
  });
});