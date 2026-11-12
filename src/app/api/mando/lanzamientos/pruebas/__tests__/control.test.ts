// @vitest-environment node
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// PRB1111V · las rutas se prueban SIEMPRE contra una carpeta temporal: jamás se escribe en ~/.starseed/produccion.
let local = true;
vi.mock("@/lib/mando/guardian", () => ({ guardianMando: async () => null }));
vi.mock("@/lib/seguridad/misma-maquina", () => ({ esPeticionDeEstaMaquina: () => local }));

import { POST } from "../control/route";
import { GET as VIVO } from "../vivo/route";

let dir = "";
const antes = process.env.STARSEED_PRODUCCION_DIR;

function post(cuerpo: unknown, cabeceras: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
    return POST(new Request("http://localhost:9002/api/mando/lanzamientos/pruebas/control", { method: "POST", headers: { "content-type": "application/json", ...cabeceras }, body: JSON.stringify(cuerpo) }));
}
async function directorVivo(extra: Record<string, unknown> = {}) {
    await writeFile(path.join(dir, "pruebas-director-estado.json"), JSON.stringify({ formato: 1, t: new Date().toISOString(), cada_s: 60, pid_ok: true, en_curso: null, esperando: null, ultimas: [], peticiones: [], avisos: [], ...extra }));
}
const escritas = async () => (await readdir(path.join(dir, "pruebas-peticiones")).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));

beforeEach(async () => {
    local = true;
    dir = await mkdtemp(path.join(os.tmpdir(), "prb1111v-"));
    process.env.STARSEED_PRODUCCION_DIR = dir;
});
afterEach(async () => {
    if (antes === undefined) delete process.env.STARSEED_PRODUCCION_DIR;
    else process.env.STARSEED_PRODUCCION_DIR = antes;
    await rm(dir, { recursive: true, force: true });
});

describe("POST /pruebas/control", () => {
    it("rechaza lo que no viene de la propia página (403) y no escribe", async () => {
        await directorVivo();
        expect((await post({ accion: "compilar" }, {})).status).toBe(403);
        local = false;
        expect((await post({ accion: "compilar" })).status).toBe(403);
        expect(await escritas()).toEqual([]);
    });
    it("cuerpo no válido: 400", async () => {
        await directorVivo();
        expect((await post({ accion: "formatear" })).status).toBe(400);
        expect((await post({ accion: "compilar", sha: "zzz" })).status).toBe(400);
        expect(await escritas()).toEqual([]);
    });
    it("sin director, parado o en pausa: 409 con el motivo y nada escrito", async () => {
        const sin = await post({ accion: "compilar" });
        expect(sin.status).toBe(409);
        await directorVivo({ t: "2026-01-01T00:00:00Z" });
        expect((await post({ accion: "compilar" })).status).toBe(409);
        await directorVivo({ pausado: true, pausa_motivo: "mantenimiento" });
        const p = await post({ accion: "compilar" });
        expect(p.status).toBe(409);
        expect((await p.json()).error).toMatch(/pausa/i);
        expect(await escritas()).toEqual([]);
    });
    it("con el director vivo escribe UNA petición con el formato acordado", async () => {
        await directorVivo();
        const r = await post({ accion: "cancelar", numero: 39 });
        expect(r.status).toBe(200);
        const cuerpo = await r.json();
        expect(cuerpo.ok).toBe(true);
        const archivos = await escritas();
        expect(archivos).toEqual([`${cuerpo.id}.json`]);
        const escrito = JSON.parse(await readFile(path.join(dir, "pruebas-peticiones", archivos[0]), "utf8"));
        expect(escrito).toMatchObject({ formato: 1, accion: "cancelar", numero: 39, quien: "alex" });
        expect(escrito.id).toMatch(/^pet-\d+-[0-9a-f]{4}$/);
    });
    it("dos pulsaciones seguidas de lo mismo no escriben dos peticiones", async () => {
        await directorVivo();
        expect((await post({ accion: "compilar" })).status).toBe(200);
        expect((await post({ accion: "compilar" })).status).toBe(409);
        expect(await escritas()).toHaveLength(1);
    });
    it("pedir arreglo de una comprobación que no existe: 404", async () => {
        await directorVivo();
        const r = await post({ accion: "pedir-arreglo", prueba: 39, comprobacion: "c7" });
        expect(r.status).toBe(404);
        expect(await escritas()).toEqual([]);
    });
});

describe("GET /pruebas/vivo con carpeta vacía", () => {
    it("responde con el director y el banco en null, sin lanzar", async () => {
        await mkdir(dir, { recursive: true });
        const r = await VIVO(new Request("http://localhost:9002/api/mando/lanzamientos/pruebas/vivo"));
        expect(r.status).toBe(200);
        const c = await r.json();
        expect(c.director).toBeNull();
        expect(c.banco).toBeNull();
        expect(Array.isArray(c.versiones)).toBe(true);
        expect(JSON.stringify(c)).not.toContain(dir);
    }, 30_000);
    it("un archivo del director corrupto sale como ilegible, no como caída", async () => {
        await writeFile(path.join(dir, "pruebas-director-estado.json"), "{no es json");
        const r = await VIVO(new Request("http://localhost:9002/api/mando/lanzamientos/pruebas/vivo"));
        expect(r.status).toBe(200);
        expect((await r.json()).director).toBe("ilegible");
    }, 30_000);
});
