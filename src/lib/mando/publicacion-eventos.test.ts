// @vitest-environment node
/**
 * SUP0511A (05-11): las comprobaciones de «Publicar» no leen `eventos.jsonl` entero.
 *
 * `leerComprobaciones` hacía `readFile` del registro entero (31,5 MB y creciendo) en cada
 * `GET /api/mando/publicacion` (cada 30 s por cliente): era lo que llenaba el montón de
 * Genesis hasta «Reached heap limit». Ahora un lector incremental lee solo lo añadido y
 * solo parsea las líneas con «verifica»; el resultado tiene que ser el mismo que el de
 * interpretar el archivo entero.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("node:fs/promises", async (original) => {
    const real = await original<typeof import("node:fs/promises")>();
    return { ...real, readFile: vi.fn(real.readFile) };
});

import { readFile } from "node:fs/promises";
import {
    crearLectorVerificaciones,
    interpretarComprobaciones,
    leerPublicacion,
    lineasConVerificacion,
} from "@/lib/mando/publicacion";

const ev = (tipo: string, texto: string) => JSON.stringify({ tipo, texto, t: "2026-11-05T12:00:00" });
const relleno = (n: number) =>
    Array.from({ length: n }, (_, i) => JSON.stringify({ tipo: "commit", texto: `tarea ${i} · ñandú «ok»`, n: i }));

let dir = "";
let raizAntes: string | undefined;

beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "sup0511a-"));
    raizAntes = process.env.STARSEED_ROOT;
    vi.mocked(readFile).mockClear();
});

afterEach(() => {
    if (raizAntes === undefined) delete process.env.STARSEED_ROOT;
    else process.env.STARSEED_ROOT = raizAntes;
    rmSync(dir, { recursive: true, force: true });
});

describe("leerPublicacion · comprobaciones (SUP0511A)", () => {
    it("no lee eventos.jsonl entero y ve lo que se añade después", async () => {
        process.env.STARSEED_ROOT = dir;
        const olas = path.join(dir, "starseed_memory_root", "olas");
        mkdirSync(olas, { recursive: true });
        const eventos = path.join(olas, "eventos.jsonl");
        writeFileSync(eventos, [ev("verificado", "tsc en verde"), ...relleno(500), ev("verificado", "vitest 23/23")].join("\n") + "\n");

        const primera = await leerPublicacion();
        expect(primera.comprobaciones).toMatchObject({ tsc: "ok", vitest: "ok" });

        appendFileSync(eventos, [...relleno(50), ev("verificacion_fallida", "tsc con 2 errores")].join("\n") + "\n");
        const segunda = await leerPublicacion();
        expect(segunda.comprobaciones).toMatchObject({ tsc: "falla", vitest: "ok" });

        const leidasEnteras = vi.mocked(readFile).mock.calls.filter(([ruta]) => String(ruta).endsWith("eventos.jsonl"));
        expect(leidasEnteras, "eventos.jsonl se leyó entero con readFile").toHaveLength(0);
    });
});

describe("crearLectorVerificaciones", () => {
    it("da lo mismo que interpretar el archivo entero, con líneas partidas entre trozos", async () => {
        const lineas = [
            ...relleno(37),
            ev("verificado", "tsc en verde"),
            ...relleno(11),
            ev("verificacion_fallida", "vitest 3 fallan"),
            ...relleno(29),
            ev("verificado", "tsc en verde otra vez"),
            "esto no es json pero dice verificado",
            ...relleno(5),
        ];
        const ruta = path.join(dir, "eventos.jsonl");
        writeFileSync(ruta, lineas.join("\n") + "\n");
        for (const trozo of [16, 37, 64, 1000, 1024 * 1024]) {
            const leer = crearLectorVerificaciones({ trozo });
            expect(await leer(ruta), `trozo ${trozo}`).toEqual(interpretarComprobaciones(lineas));
        }
    });

    it("solo lee lo añadido y espera a que se complete la línea a medias", async () => {
        const ruta = path.join(dir, "eventos.jsonl");
        writeFileSync(ruta, [...relleno(20), ev("verificado", "tsc ok")].join("\n") + "\n");
        const leer = crearLectorVerificaciones({ trozo: 64 });
        expect(await leer(ruta)).toEqual({ tsc: "ok", vitest: null });

        const linea = ev("verificacion_fallida", "vitest falla");
        appendFileSync(ruta, linea.slice(0, 20));
        expect(await leer(ruta)).toEqual({ tsc: "ok", vitest: null });
        appendFileSync(ruta, linea.slice(20) + "\n");
        expect(await leer(ruta)).toEqual({ tsc: "ok", vitest: "falla" });
        expect(await leer(ruta)).toEqual({ tsc: "ok", vitest: "falla" });
    });

    it("vuelve a empezar si el archivo encoge o lo cambian por otro", async () => {
        const ruta = path.join(dir, "eventos.jsonl");
        writeFileSync(ruta, [...relleno(30), ev("verificacion_fallida", "tsc 9 errores")].join("\n") + "\n");
        const leer = crearLectorVerificaciones({ trozo: 128 });
        expect(await leer(ruta)).toEqual({ tsc: "falla", vitest: null });

        writeFileSync(ruta, ev("verificado", "tsc ok") + "\n");
        expect(await leer(ruta)).toEqual({ tsc: "ok", vitest: null });

        // Reescrito más largo en el mismo archivo (mismo inodo): la cabeza cambia y se relee.
        writeFileSync(ruta, [ev("verificado", "vitest 4/4"), ...relleno(60)].join("\n") + "\n");
        expect(await leer(ruta)).toEqual({ tsc: null, vitest: "ok" });
    });

    it("las llamadas a la vez dan lo mismo y un archivo que falta lanza", async () => {
        const ruta = path.join(dir, "eventos.jsonl");
        writeFileSync(ruta, [...relleno(200), ev("verificado", "vitest 10/10")].join("\n") + "\n");
        const leer = crearLectorVerificaciones({ trozo: 256 });
        const [a, b, c] = await Promise.all([leer(ruta), leer(ruta), leer(ruta)]);
        expect(a).toEqual({ tsc: null, vitest: "ok" });
        expect(b).toEqual(a);
        expect(c).toEqual(a);
        await expect(leer(path.join(dir, "no-existe.jsonl"))).rejects.toThrow();
    });
});

describe("lineasConVerificacion", () => {
    it("devuelve solo las líneas con «verifica», enteras y con acentos", () => {
        const bloque = Buffer.from(
            [ev("commit", "nada"), ev("verificado", "tsc · ñ"), ev("commit", "x"), ev("verificacion_fallida", "vitest")].join("\n"),
            "utf8",
        );
        const lineas = lineasConVerificacion(bloque);
        expect(lineas).toHaveLength(2);
        expect(JSON.parse(lineas[0]).texto).toBe("tsc · ñ");
        expect(JSON.parse(lineas[1]).tipo).toBe("verificacion_fallida");
        expect(lineasConVerificacion(Buffer.alloc(0))).toEqual([]);
    });
});
