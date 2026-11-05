// @vitest-environment node
/**
 * SUP0511D (05-11): las revisiones bloqueantes de «Publicar» no releen
 * `revisiones.md` (2,2 MB) si no cambió.
 *
 * `obtenerRevisionesBloqueantes()` hacía `readFile` del archivo entero en cada
 * `GET /api/mando/publicacion` (cada 30 s por cliente). Ahora una caché en el
 * módulo guarda `{ ruta, mtimeMs, size, cuenta }`; antes de leer, hace `stat`
 * de la ruta y, si coinciden `mtimeMs` y `size`, devuelve la cuenta guardada
 * sin leer. La cuenta pura está en `contarBloqueantes(texto)`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("node:fs/promises", async (original) => {
    const real = await original<typeof import("node:fs/promises")>();
    return { ...real, readFile: vi.fn(real.readFile), stat: vi.fn(real.stat) };
});

import { readFile, stat } from "node:fs/promises";
import { contarBloqueantes, leerPublicacion, obtenerRevisionesBloqueantes } from "@/lib/mando/publicacion";

let dir = "";
let raizAntes: string | undefined;

beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "sup0511d-"));
    raizAntes = process.env.STARSEED_ROOT;
    vi.mocked(readFile).mockClear();
    vi.mocked(stat).mockClear();
});

afterEach(() => {
    if (raizAntes === undefined) delete process.env.STARSEED_ROOT;
    else process.env.STARSEED_ROOT = raizAntes;
    rmSync(dir, { recursive: true, force: true });
});

describe("contarBloqueantes (función pura)", () => {
    it("devuelve 0 con texto vacío", () => {
        expect(contarBloqueantes("")).toBe(0);
    });

    it("cuenta líneas con «bloqueante» en minúsculas", () => {
        const texto = "línea 1\nbloqueante: algo\nlínea 3\nbloqueante otra vez\n";
        expect(contarBloqueantes(texto)).toBe(2);
    });

    it("cuenta líneas con «BLOQUEANTE» en mayúsculas", () => {
        const texto = "BLOQUEANTE\nno bloqueante\nBLOQUEANTE\n";
        expect(contarBloqueantes(texto)).toBe(3);
    });

    it("cuenta líneas con «Bloqueante» mixto", () => {
        const texto = "Bloqueante\nBLOQUEANTE\nbloqueante\n";
        expect(contarBloqueantes(texto)).toBe(3);
    });

    it("cuenta varias líneas con la palabra en diferentes posiciones", () => {
        const texto = "inicio bloqueante final\nbloqueante\nmedio bloqueante aquí\n";
        expect(contarBloqueantes(texto)).toBe(3);
    });

    it("no cuenta líneas sin la palabra", () => {
        const texto = "línea 1\nlínea 2\nlínea 3\n";
        expect(contarBloqueantes(texto)).toBe(0);
    });
});

describe("obtenerRevisionesBloqueantes · caché por mtime y size", () => {
    it("cuenta bien con un revisiones.md de prueba", async () => {
        process.env.STARSEED_ROOT = dir;
        const olas = path.join(dir, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const revisiones = path.join(olas, "revisiones.md");
        writeFileSync(revisiones, "línea 1\nbloqueante: revisión 1\nlínea 3\nBLOQUEANTE revisión 2\n", "utf8");

        const cuenta = await obtenerRevisionesBloqueantes();
        expect(cuenta).toBe(2);
    });

    it("en la segunda llamada sin cambios no llama a readFile para revisiones.md", async () => {
        process.env.STARSEED_ROOT = dir;
        const olas = path.join(dir, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const revisiones = path.join(olas, "revisiones.md");
        writeFileSync(revisiones, "bloqueante: uno\nno bloqueante\nBLOQUEANTE: dos\n", "utf8");

        await obtenerRevisionesBloqueantes();
        vi.mocked(readFile).mockClear();

        await obtenerRevisionesBloqueantes();

        const leidasRevisiones = vi.mocked(readFile).mock.calls.filter(([ruta]) => String(ruta).endsWith("revisiones.md"));
        expect(leidasRevisiones, "revisiones.md no se debe leer si no cambió").toHaveLength(0);
    });

    it("tras añadir una línea «bloqueante» y cambiar mtime, la cuenta sube", async () => {
        process.env.STARSEED_ROOT = dir;
        const olas = path.join(dir, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const revisiones = path.join(olas, "revisiones.md");
        writeFileSync(revisiones, "bloqueante: uno\n", "utf8");

        const primera = await obtenerRevisionesBloqueantes();
        expect(primera).toBe(1);

        // Añadir línea y cambiar mtime a otra hora
        appendFileSync(revisiones, "BLOQUEANTE: dos\n", "utf8");
        const ahora = Date.now();
        const haceUnaHora = new Date(ahora - 3600 * 1000);
        utimesSync(revisiones, haceUnaHora, haceUnaHora);

        const segunda = await obtenerRevisionesBloqueantes();
        expect(segunda).toBe(2);
    });

    it("si la primera ruta no existe, prueba la segunda", async () => {
        process.env.STARSEED_ROOT = dir;
        // No creamos starseed_memory_root/olas/revisiones.md
        const olas = path.join(dir, "olas");
        mkdirSync(olas, { recursive: true });
        const revisiones = path.join(olas, "revisiones.md");
        writeFileSync(revisiones, "bloqueante: uno\nBLOQUEANTE: dos\n", "utf8");

        const cuenta = await obtenerRevisionesBloqueantes();
        expect(cuenta).toBe(2);
    });

    it("sin ninguna ruta, devuelve 0", async () => {
        process.env.STARSEED_ROOT = dir;
        // No creamos ninguna de las dos rutas
        const cuenta = await obtenerRevisionesBloqueantes();
        expect(cuenta).toBe(0);
    });
});

describe("leerPublicacion · revisiones bloqueantes (SUP0511D)", () => {
    it("usa la caché de revisiones entre llamadas consecutivas", async () => {
        process.env.STARSEED_ROOT = dir;
        const olas = path.join(dir, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const revisiones = path.join(olas, "revisiones.md");
        writeFileSync(revisiones, "bloqueante: uno\n", "utf8");

        const primera = await leerPublicacion();
        expect(primera.comprobaciones.revisionesBloqueantes).toBe(1);
        vi.mocked(readFile).mockClear();

        const segunda = await leerPublicacion();
        expect(segunda.comprobaciones.revisionesBloqueantes).toBe(1);

        const leidasRevisiones = vi.mocked(readFile).mock.calls.filter(([ruta]) => String(ruta).endsWith("revisiones.md"));
        expect(leidasRevisiones, "revisiones.md no se debe releer si no cambió").toHaveLength(0);
    });
});