import { deflateRawSync } from "node:zlib";
import { describe, it, expect } from "vitest";
import { buildZipBlob, listZipEntries, ZipEntryInput } from "../simple-zip";

/**
 * RTVST1018I — casos de la rama nube/39207722594 (leer zips STORE/deflate), adaptados a la
 * API de hoy. En main no existe `leerZip` (el lector con DecompressionStream de la rama):
 * el mismo contrato se resolvió por otro camino en `simple-zip.ts`, que escribe zips STORE
 * (`buildZipBlob`) y lee SOLO el directorio central (`listZipEntries`), sin descomprimir.
 * Los casos de extracción de la rama se reescriben sobre esos dos funciones; los de
 * rechazar cifrado/rutas peligrosas no tienen equivalente (main nunca extrae).
 */

const codificador = new TextEncoder();

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/** Zip DEFLATE (método 8) de verdad, escrito con zlib: para leer su directorio central. */
async function crearZipDeflate(entradas: { path: string; data: Uint8Array }[]): Promise<ArrayBuffer> {
    const u16v = (v: DataView, o: number, x: number) => v.setUint16(o, x & 0xffff, true);
    const u32v = (v: DataView, o: number, x: number) => v.setUint32(o, x >>> 0, true);
    const partes: BlobPart[] = [];
    const centrales: BlobPart[] = [];
    let offset = 0;
    let centralSize = 0;
    for (const e of entradas) {
        const nombre = codificador.encode(e.path.replace(/^\/+/, ""));
        const comprimido = new Uint8Array(deflateRawSync(e.data, { level: 9 }));
        const local = new ArrayBuffer(30 + nombre.length + comprimido.length);
        const lv = new DataView(local);
        u32v(lv, 0, 0x04034b50);
        u16v(lv, 4, 20);
        u16v(lv, 8, 8); // método 8: deflate
        u32v(lv, 14, crc32(e.data));
        u32v(lv, 18, comprimido.length);
        u32v(lv, 22, e.data.length);
        u16v(lv, 26, nombre.length);
        new Uint8Array(local).set(nombre, 30);
        new Uint8Array(local).set(comprimido, 30 + nombre.length);
        const central = new ArrayBuffer(46 + nombre.length);
        const cv = new DataView(central);
        u32v(cv, 0, 0x02014b50);
        u16v(cv, 10, 8); // método 8 también en el directorio central
        u32v(cv, 16, crc32(e.data));
        u32v(cv, 20, comprimido.length);
        u32v(cv, 24, e.data.length);
        u16v(cv, 28, nombre.length);
        u32v(cv, 42, offset);
        new Uint8Array(central).set(nombre, 46);
        partes.push(local);
        centrales.push(central);
        centralSize += 46 + nombre.length;
        offset += local.byteLength;
    }
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    u32v(ev, 0, 0x06054b50);
    u16v(ev, 8, entradas.length);
    u16v(ev, 10, entradas.length);
    u32v(ev, 12, centralSize);
    u32v(ev, 16, offset);
    return new Blob([...partes, ...centrales, eocd]).arrayBuffer();
}

/** Marca el bit 0 de cifrado en las cabeceras locales y el directorio central. */
function ponerCifrado(buffer: ArrayBuffer): void {
    const v = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let cursor = 0;
    while (cursor + 4 <= bytes.length) {
        const firma = v.getUint32(cursor, true);
        if (firma === 0x06054b50) break;
        if (firma === 0x04034b50) {
            v.setUint16(cursor + 6, v.getUint16(cursor + 6, true) | 1, true);
            cursor += 30 + v.getUint16(cursor + 26, true) + v.getUint16(cursor + 28, true) + v.getUint32(cursor + 18, true);
        } else if (firma === 0x02014b50) {
            v.setUint16(cursor + 8, v.getUint16(cursor + 8, true) | 1, true);
            cursor += 46 + v.getUint16(cursor + 28, true) + v.getUint16(cursor + 30, true) + v.getUint16(cursor + 32, true);
        } else {
            cursor += 1;
        }
    }
}

describe("zip-lector · casos RTVST1018I sobre simple-zip (la API de hoy)", () => {
    it("lee un zip STORE (método 0): nombres, tamaños y carpetas del directorio central", async () => {
        const entradas: ZipEntryInput[] = [
            { path: "hello.txt", data: "Hello, World!" },
            { path: "data.bin", data: new Uint8Array([1, 2, 3]) },
            { path: "carpeta/", data: "" },
            { path: "/de-barra-inicial.txt", data: "x" },
        ];
        const ab = await buildZipBlob(entradas).arrayBuffer();
        expect(listZipEntries(ab)).toEqual([
            { name: "hello.txt", size: 13, isDirectory: false },
            { name: "data.bin", size: 3, isDirectory: false },
            { name: "carpeta/", size: 0, isDirectory: true },
            { name: "de-barra-inicial.txt", size: 1, isDirectory: false },
        ]);
    });

    it("un zip DEFLATE (método 8) se lista igual: tamaños SIN comprimir y nada descomprimido", async () => {
        const ab = await crearZipDeflate([
            { path: "hola.txt", data: codificador.encode("Hola, mundo!") },
            { path: "datos/grande.dat", data: new Uint8Array(1000) },
        ]);
        expect(listZipEntries(ab)).toEqual([
            { name: "hola.txt", size: 12, isDirectory: false },
            { name: "datos/grande.dat", size: 1000, isDirectory: false },
        ]);
    });

    it("se respeta el límite de entradas (maxEntries); lo que no es zip devuelve [] sin lanzar", async () => {
        const entradas: ZipEntryInput[] = ["e0", "e1", "e2", "e3", "e4"].map((n) => ({ path: `${n}.txt`, data: n }));
        const ab = await buildZipBlob(entradas).arrayBuffer();
        expect(listZipEntries(ab, 3).map((e) => e.name)).toEqual(["e0.txt", "e1.txt", "e2.txt"]);
        expect(listZipEntries(ab, 0)).toEqual([]);
        expect(listZipEntries(new ArrayBuffer(10))).toEqual([]);
        expect(listZipEntries(codificador.encode("x".repeat(64)).buffer as ArrayBuffer)).toEqual([]);
    });

    it("un zip cifrado se lista igual: los nombres no van cifrados y no hay extracción que rechazar", async () => {
        const ab = await buildZipBlob([{ path: "a.txt", data: "a" }, { path: "b.txt", data: "b" }]).arrayBuffer();
        ponerCifrado(ab);
        expect(listZipEntries(ab).map((e) => e.name)).toEqual(["a.txt", "b.txt"]);
        expect(listZipEntries(ab).map((e) => e.size)).toEqual([1, 1]);
    });
});
