import { describe, it, expect } from "vitest";
import { buildZipBlob, listZipEntries } from "@/lib/files/simple-zip";

// Rescate RTVST1018I: main hizo VST1018I por otro camino — `simple-zip.ts`
// crea ZIP en STORE y su lector (`listZipEntries`) lee SOLO el directorio
// central (nombres, tamaños, carpetas), sin descomprimir nada. Estas pruebas
// cubren ese contrato tal como está hoy.
describe("simple-zip · lector del directorio central", () => {
  it("lee un ZIP en STORE: nombres, tamaños y carpetas", async () => {
    const blob = buildZipBlob([
      { path: "hello.txt", data: "Hello, World!" },
      { path: "data.bin", data: new Uint8Array([1, 2, 3]) },
      { path: "carpeta/", data: "" },
    ]);
    const entradas = listZipEntries(await blob.arrayBuffer());
    expect(entradas.map((e) => e.name)).toEqual(["hello.txt", "data.bin", "carpeta/"]);
    expect(entradas[0].size).toBe(13);
    expect(entradas[1].size).toBe(3);
    expect(entradas[0].isDirectory).toBe(false);
    expect(entradas[2].isDirectory).toBe(true);
  });

  it("nunca deja entrar rutas absolutas: quita la barra inicial del nombre", async () => {
    // La constructora sanea al escribir (única defensa de rutas que hay hoy: quien
    // descomprime más arriba debe seguir protegiéndose contra "../").
    const blob = buildZipBlob([{ path: "/etc/passwd", data: "x" }]);
    const entradas = listZipEntries(await blob.arrayBuffer());
    expect(entradas.map((e) => e.name)).toEqual(["etc/passwd"]);
    expect(entradas[0].isDirectory).toBe(false);
  });

  it("respeta el límite de entradas listadas (maxEntries)", async () => {
    // 600 entradas: el listado honesto se corta en su tope (500 por defecto).
    const muchas = Array.from({ length: 600 }, (_, i) => ({ path: `f-${i}.txt`, data: "" }));
    const ab = (await buildZipBlob(muchas).arrayBuffer()) as ArrayBuffer;
    expect(listZipEntries(ab)).toHaveLength(500);
    expect(listZipEntries(ab, 2)).toHaveLength(2);
  });

  it("lo que no parece un zip devuelve [] y no lanza", () => {
    const vacio = new ArrayBuffer(64);
    expect(listZipEntries(vacio)).toEqual([]);
  });
});
