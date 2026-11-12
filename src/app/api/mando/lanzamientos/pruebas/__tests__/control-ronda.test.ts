// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// RON1112C · la ronda de aparatos por la ruta del panel. Siempre contra una carpeta temporal.
vi.mock("@/lib/mando/guardian", () => ({ guardianMando: async () => null }));
vi.mock("@/lib/seguridad/misma-maquina", () => ({ esPeticionDeEstaMaquina: () => true }));

import { POST } from "../control/route";
import { GET as VIVO } from "../vivo/route";

let dir = "";
const antes = process.env.STARSEED_PRODUCCION_DIR;

const post = (cuerpo: unknown) =>
    POST(new Request("http://localhost:9002/api/mando/lanzamientos/pruebas/control", { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" }, body: JSON.stringify(cuerpo) }));
const director = (extra: Record<string, unknown> = {}) =>
    writeFile(path.join(dir, "pruebas-director-estado.json"), JSON.stringify({ formato: 1, t: new Date().toISOString(), cada_s: 60, pid_ok: true, en_curso: null, esperando: null, ultimas: [], peticiones: [], avisos: [], ...extra }));
const escritas = async () => (await readdir(path.join(dir, "pruebas-peticiones")).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
const leer = async (n: string) => JSON.parse(await readFile(path.join(dir, "pruebas-peticiones", n), "utf8"));

beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ron1112c-"));
    process.env.STARSEED_PRODUCCION_DIR = dir;
});
afterEach(async () => {
    if (antes === undefined) delete process.env.STARSEED_PRODUCCION_DIR;
    else process.env.STARSEED_PRODUCCION_DIR = antes;
    await rm(dir, { recursive: true, force: true });
});

describe("POST /pruebas/control · ronda de aparatos", () => {
    it("empezar escribe UNA petición con el motivo en `nota` y los minutos", async () => {
        await director();
        const r = await post({ accion: "ronda-iniciar", nota: "llamadas de prueba con la tableta", minutos: 45 });
        expect(r.status).toBe(200);
        const [archivo] = await escritas();
        expect(await leer(archivo)).toMatchObject({ formato: 1, accion: "ronda-iniciar", quien: "alex", nota: "llamadas de prueba con la tableta", minutos: 45, sha: null, numero: null });
    });
    it("sin motivo o con minutos fuera de rango: 400 y nada escrito", async () => {
        await director();
        expect((await post({ accion: "ronda-iniciar" })).status).toBe(400);
        expect((await post({ accion: "ronda-iniciar", nota: "x", minutos: 120 })).status).toBe(400);
        expect(await escritas()).toEqual([]);
    });
    it("terminar es una sola petición sin más campos", async () => {
        await director();
        expect((await post({ accion: "ronda-terminar" })).status).toBe(200);
        const [archivo] = await escritas();
        const c = await leer(archivo);
        expect(c.accion).toBe("ronda-terminar");
        expect(c.nota).toBeNull();
        expect("minutos" in c).toBe(false);
    });
    it("con el director EN PAUSA se aceptan las de la ronda y no las demás", async () => {
        await director({ pausado: true, pausa_motivo: "mantenimiento" });
        expect((await post({ accion: "compilar" })).status).toBe(409);
        expect((await post({ accion: "ronda-iniciar", nota: "llamadas" })).status).toBe(200);
        expect((await post({ accion: "ronda-terminar" })).status).toBe(200);
        expect(await escritas()).toHaveLength(2);
    });
    it("con el director parado, sin archivo o ilegible: 409 con el motivo y nada escrito", async () => {
        expect((await post({ accion: "ronda-terminar" })).status).toBe(409);
        await director({ t: "2026-01-01T00:00:00Z" });
        expect((await post({ accion: "ronda-terminar" })).status).toBe(409);
        await writeFile(path.join(dir, "pruebas-director-estado.json"), "{no es json");
        expect((await post({ accion: "ronda-iniciar", nota: "x" })).status).toBe(409);
        expect(await escritas()).toEqual([]);
    });
    it("dos pulsaciones seguidas de terminar no escriben dos peticiones", async () => {
        await director();
        expect((await post({ accion: "ronda-terminar" })).status).toBe(200);
        expect((await post({ accion: "ronda-terminar" })).status).toBe(409);
        expect(await escritas()).toHaveLength(1);
    });
});

describe("GET /pruebas/vivo · la ronda", () => {
    const pedir = () => VIVO(new Request("http://localhost:9002/api/mando/lanzamientos/pruebas/vivo", { headers: { "sec-fetch-site": "same-origin" } }));
    it("sin archivo: null; ilegible: «ilegible»; con ronda: la lectura sin rutas", async () => {
        const sin = await (await pedir()).json();
        expect(sin.ronda).toBeNull();
        await writeFile(path.join(dir, "ronda-aparatos.json"), "{roto");
        expect((await (await pedir()).json()).ronda).toBe("ilegible");
        const t = Date.now();
        const iso = (ms: number) => new Date(ms).toISOString();
        await writeFile(
            path.join(dir, "ronda-aparatos.json"),
            JSON.stringify({ formato: 1, t: iso(t), cada_s: 60, ronda: { quien: "alex", motivo: "llamadas", desde: iso(t), hasta: iso(t + 30 * 60_000), renovaciones: 0 }, silencio: { t: iso(t), tranquila: true, linea: "la Mac está tranquila", carga1: 1.2, pesados: [] } }),
        );
        const con = await (await pedir()).json();
        expect(con.ronda.ronda).toMatchObject({ quien: "alex", motivo: "llamadas", desdeMs: Date.parse(iso(t)) });
        expect(con.enMarcha.ronda).toMatchObject({ quien: "alex", motivo: "llamadas" });
        expect(JSON.stringify(con.ronda)).not.toContain(dir);
    });
});
