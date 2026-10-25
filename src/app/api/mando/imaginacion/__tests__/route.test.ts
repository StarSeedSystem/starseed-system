/**
 * /api/mando/imaginacion (Ola 1024I · IMG1024A): GET con `?ambito=` y `resumen`; POST con integrar,
 * reimaginar, lote y lo de antes, sobre carpetas temporales (raíz del proyecto y casa) y sin red.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));

import { GET, POST } from "../route";

const URL_RUTA = "http://localhost:9002/api/mando/imaginacion";
let raiz = "";
let casa = "";
const antes = { root: process.env.STARSEED_ROOT, home: process.env.HOME };
const archivo = () => path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json");
const prop = (id: string, aparte: Record<string, unknown> = {}) => ({
    id, fuente: "agentes", agente: "referencias-diseno", titulo: id, cuerpo: "libre", archivos: [], utilidad: 0.8,
    importancia: "media", estado: "esperando-aprobacion", motivo: "", t: new Date().toISOString(), ...aparte,
});
const post = (cuerpo: unknown) =>
    POST(new Request(URL_RUTA, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
const enDisco = () => JSON.parse(readFileSync(archivo(), "utf-8")) as Record<string, unknown>[];

beforeAll(() => {
    raiz = mkdtempSync(path.join(os.tmpdir(), "imaginacion-ruta-raiz-"));
    casa = mkdtempSync(path.join(os.tmpdir(), "imaginacion-ruta-casa-"));
    process.env.STARSEED_ROOT = raiz;
    process.env.HOME = casa;
});
afterAll(() => {
    if (antes.root === undefined) delete process.env.STARSEED_ROOT; else process.env.STARSEED_ROOT = antes.root;
    process.env.HOME = antes.home;
    rmSync(raiz, { recursive: true, force: true });
    rmSync(casa, { recursive: true, force: true });
});
beforeEach(() => {
    mkdirSync(path.dirname(archivo()), { recursive: true });
    writeFileSync(archivo(), JSON.stringify([prop("m1"), prop("g1", { ambito: "grupo:g", importancia: "crítica" }), prop("g2", { ambito: "grupo:g", estado: "reimaginando" })]));
});

describe("/api/mando/imaginacion", () => {
    it("GET filtra por ámbito, trae el resumen y no enseña rutas del disco", async () => {
        const r = await GET(new Request(`${URL_RUTA}?ambito=grupo:g`));
        expect(r.status).toBe(200);
        expect(r.headers.get("cache-control")).toBe("no-store");
        const texto = await r.text();
        expect(texto).not.toContain(raiz);
        const j = JSON.parse(texto);
        expect(j.propuestas.map((p: { id: string }) => p.id)).toEqual(["g1", "g2"]);
        expect(j.resumen).toMatchObject({ texto: "1 por decidir · 1 reimaginando · 0 integradas hoy", tono: "aviso" });
        expect(j.ajustes.auto).toEqual({ aprobar: false, reimaginar: false, umbral: 0.75, max_reimaginaciones: 2 });
        expect((await (await GET(new Request(URL_RUTA))).json()).propuestas).toHaveLength(3);
        expect((await GET(new Request(`${URL_RUTA}?ambito=..%2Fx`))).status).toBe(400);
    });
    it("POST integrar (y su alias aprobar), reimaginar y errores", async () => {
        expect((await post({ accion: "integrar", id: "m1" })).status).toBe(200);
        expect(enDisco()[0].estado).toBe("aprobada");
        expect((await post({ accion: "aprobar", id: "m1" })).status).toBe(409); // ya decidida
        expect((await post({ accion: "reimaginar", id: "g1" })).status).toBe(400);
        const r = await post({ accion: "reimaginar", id: "g1", notas: "otra paleta", referencias: [{ titulo: "R", url: "https://r.org/" }, "http://no"] });
        expect(r.status).toBe(200);
        expect((await r.json()).propuesta).toMatchObject({ estado: "reimaginando", reimaginacion: { notas: "otra paleta", referencias: [{ titulo: "R", url: "https://r.org/" }], por: "alex" } });
        expect((await post({ accion: "nada" })).status).toBe(400);
    });
    it("POST lote devuelve el resultado de cada id; «pendientes» por ámbito", async () => {
        const r = await post({ accion: "lote", ids: ["m1", "g2", "zz"], hacer: "rechazar", motivo: "no" });
        expect(r.status).toBe(200);
        const j = await r.json();
        expect(j.ok).toBe(false);
        expect(j.resultados.map((x: { id: string; ok: boolean }) => [x.id, x.ok])).toEqual([["m1", true], ["g2", false], ["zz", false]]);
        const p = await (await post({ accion: "lote", ids: "pendientes", hacer: "integrar", ambito: "grupo:g" })).json();
        expect(p).toEqual({ ok: true, resultados: [{ id: "g1", ok: true }] });
        expect(enDisco().map((d) => d.estado)).toEqual(["rechazada", "aprobada", "reimaginando"]);
        expect((await post({ accion: "lote", ids: "pendientes", hacer: "reimaginar" })).status).toBe(400);
    });
    it("POST ajustes enciende el automático sin perder lo demás", async () => {
        const j = await (await post({ accion: "ajustes", ajustes: { auto: { aprobar: true } } })).json();
        expect(j).toMatchObject({ ok: true, ajustes: { auto: { aprobar: true, umbral: 0.75 }, automatico: true } });
    });
});
