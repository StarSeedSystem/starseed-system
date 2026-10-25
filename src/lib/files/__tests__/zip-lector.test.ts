import { describe, expect, it } from "vitest";

import { buildZipBlob, listZipEntries, ZipEntryInput } from "../simple-zip";

describe("lector de ZIP (simple-zip)", () => {
  it("lee un ZIP con método STORE: nombres y tamaños sin comprimir del directorio central", async () => {
    const entries: ZipEntryInput[] = [
      { path: "hello.txt", data: "Hello, World!" },
      { path: "data.bin", data: new Uint8Array([1, 2, 3]) },
    ];
    const zip = buildZipBlob(entries);
    const arrayBuffer = await zip.arrayBuffer();
    const result = listZipEntries(arrayBuffer);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("hello.txt");
    expect(result[0].size).toBe(13); // "Hello, World!" en UTF-8
    expect(result[0].isDirectory).toBe(false);
    expect(result[1].name).toBe("data.bin");
    expect(result[1].size).toBe(3);
    expect(result[1].isDirectory).toBe(false);
  });

  it("respeta el límite de entradas (maxEntries trunca el listado)", () => {
    const entries: ZipEntryInput[] = [
      { path: "a.txt", data: "a" },
      { path: "b.txt", data: "b" },
      { path: "c.txt", data: "c" },
    ];
    const zip = buildZipBlob(entries);
    return zip.arrayBuffer().then((ab) => {
      expect(listZipEntries(ab, 2)).toHaveLength(2);
    });
  });
});
