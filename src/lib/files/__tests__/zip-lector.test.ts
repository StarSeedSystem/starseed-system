import { describe, it, expect } from "vitest";
import { buildZipBlob, listZipEntries, type ZipEntryInput } from "../simple-zip";

describe("listZipEntries (lector mínimo y seguro del zip)", () => {
  it("lee un zip STORE: nombre, tamaño sin comprimir y no-directorio", async () => {
    const entradas: ZipEntryInput[] = [
      { path: "hola.txt", data: "Hola, mundo!" },
      { path: "datos.bin", data: new Uint8Array([1, 2, 3]) },
    ];
    const ab = await buildZipBlob(entradas).arrayBuffer();
    const r = listZipEntries(ab);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe("hola.txt");
    expect(r[0].size).toBe(12);
    expect(r[0].isDirectory).toBe(false);
    expect(r[1].name).toBe("datos.bin");
    expect(r[1].size).toBe(3);
    expect(r[1].isDirectory).toBe(false);
  });

  it("lee un zip con método DEFLATE (8): nombre y tamaño del directorio central", () => {
    // Zip mínimo construido a mano, método 8 (deflate) con un bloque "stored"
    // del payload: el lector no descomprime, solo lee el directorio central.
    const nombre = "mundo.txt";
    const ab = new ArrayBuffer(30 + nombre.length + 10 + 46 + nombre.length + 22);
    const v = new DataView(ab);
    const le16 = (o: number, x: number) => v.setUint16(o, x, true);
    const le32 = (o: number, x: number) => v.setUint32(o, x >>> 0, true);
    le32(0, 0x04034b50); le16(4, 20); le16(6, 0); le16(8, 8); le16(10, 0); le16(12, 0x21);
    le32(14, 0); le32(18, 10); le32(22, 5); le16(26, nombre.length); le16(28, 0);
    new Uint8Array(ab).set(new TextEncoder().encode(nombre), 30);
    // Bloque DEFLATE almacenado: 0x01, LEN, NLEN, payload crudo "mundo" (10 bytes).
    const cuerpo = [5, 0, 0xfa, 0xff, 0x6d, 0x75, 0x6e, 0x64, 0x6f];
    new Uint8Array(ab).set(new Uint8Array([0x01, ...cuerpo]), 30 + nombre.length);
    const centro = 30 + nombre.length + 10;
    le32(centro + 0, 0x02014b50); le16(centro + 4, 20); le16(centro + 6, 20);
    le16(centro + 8, 0); le16(centro + 10, 8); le16(centro + 12, 0); le16(centro + 14, 0x21);
    le32(centro + 16, 0); le32(centro + 20, 10); le32(centro + 24, 5);
    le16(centro + 28, nombre.length); le16(centro + 30, 0); le16(centro + 32, 0);
    le16(centro + 34, 0); le16(centro + 36, 0); le32(centro + 38, 0); le32(centro + 42, 0);
    new Uint8Array(ab).set(new TextEncoder().encode(nombre), centro + 46);
    const eocd = centro + 46 + nombre.length;
    le32(eocd + 0, 0x06054b50); le16(eocd + 4, 0); le16(eocd + 6, 0);
    le16(eocd + 8, 1); le16(eocd + 10, 1); le32(eocd + 12, 46 + nombre.length);
    le32(eocd + 16, centro); le16(eocd + 20, 0);
    const r = listZipEntries(ab);
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe("mundo.txt");
    expect(r[0].size).toBe(5);
    expect(r[0].isDirectory).toBe(false);
  });

  it("respeta los límites: maxEntries pedido y tope por defecto de 500", async () => {
    const muchas: ZipEntryInput[] = [];
    for (let i = 0; i < 501; i++) muchas.push({ path: `e-${i}.txt`, data: "x" });
    const ab = await buildZipBlob(muchas).arrayBuffer();
    expect(listZipEntries(ab, 2)).toHaveLength(2);
    expect(listZipEntries(ab)).toHaveLength(500);
  });
});
