import { describe, it, expect } from "vitest";
import { buildZipBlob, listZipEntries, type ZipEntryInput } from "../simple-zip";

/**
 * Rescate de la rama nube 39207722594 (RTVST1018I). Los casos de la rama probaban
 * un lector `leerZip` con descompresión (STORE/deflate); main decidió a propósito
 * otro contrato: `buildZipBlob` (STORE, sin dependencias) + `listZipEntries`
 * (solo el directorio central, sin descomprimir). Se rescata lo que aplica a la
 * API de hoy; lo demás (deflate, límites, cifrado, rutas peligrosas) no existe
 * en main y no se inventa aquí.
 */
describe("zip desde main y lectura del directorio central (id y vuelta)", () => {
  it("STORE: dos entradas vuelven con nombre, tamaño exacto y no directorio", async () => {
    const dataBin = new Uint8Array([1, 2, 3]);
    const entradas: ZipEntryInput[] = [
      { path: "hello.txt", data: "Hello, World!" },
      { path: "data.bin", data: dataBin },
    ];
    const blob = buildZipBlob(entradas);
    const ab = await blob.arrayBuffer();
    const leidas = listZipEntries(ab);
    expect(leidas).toHaveLength(2);
    expect(leidas[0].name).toBe("hello.txt");
    expect(leidas[0].size).toBe(new TextEncoder().encode("Hello, World!").length);
    expect(leidas[0].isDirectory).toBe(false);
    expect(leidas[1].name).toBe("data.bin");
    expect(leidas[1].size).toBe(3);
    expect(leidas[1].isDirectory).toBe(false);
  });

  it("carpeta y buffer ajeno: directorio detectado y [] honesto", async () => {
    const ab = await buildZipBlob([
      { path: "/carpeta/", data: "" },
      { path: "carpeta/nota.txt", data: "hola" },
    ]).arrayBuffer();
    const leidas = listZipEntries(ab);
    expect(leidas.map((e) => e.name)).toEqual(["carpeta/", "carpeta/nota.txt"]);
    expect(leidas[0].isDirectory).toBe(true);
    expect(leidas[1].size).toBe(4);
    // Lo que no parece un zip se devuelve vacío, sin lanzar.
    expect(listZipEntries(new ArrayBuffer(64))).toEqual([]);
  });
});
