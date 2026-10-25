/**
 * /api/mando/medidores?clave=imaginacion (Ola 1024I · IMG1024B): lee sus dos archivos sin esperar la reunión
 * compartida, filtra por `?ambito=` (MetaGenesis por defecto) y, si no puede leer, dice «sin datos»: nunca
 * una cifra inventada. Sobre carpetas temporales (raíz del proyecto y casa), sin red.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/utils/supabase/server", () => ({
    createClient: vi.fn(async () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) } })),
}));

import { GET } from "../route";
import type { DetalleMedidor } from "@/lib/mando/medidores";

const URL_RUTA = "http://localhost:9002/api/mando/medidores?clave=imaginacion";
let raiz = "";
let casa = "";
const antes = { root: process.env.STARSEED_ROOT, home: process.env.HOME };
const archivo = () => path.join(raiz, "starseed_memory_root", "imaginacion", "propuestas.json");
const prop = (id: string, aparte: Record<string, unknown> = {}) => ({
    id, fuente: "agentes", titulo: id, cuerpo: "libre", archivos: [], utilidad: 0.8,
    importancia: "media", estado: "esperando-aprobacion", motivo: "", t: new Date().toISOString(), ...aparte,
});
const detalle = async (consulta = "") => {
    const r = await GET(new Request(`${URL_RUTA}${consulta}`));
    return { status: r.status, cuerpo: (await r.json()) as { detalle?: DetalleMedidor; error?: string } };
};

beforeAll(() => {
    raiz = mkdtempSync(path.join(os.tmpdir(), "medidor-imaginacion-raiz-"));
    casa = mkdtempSync(path.join(os.tmpdir(), "medidor-imaginacion-casa-"));
    process.env.STARSEED_ROOT = raiz;
    process.env.HOME = casa;
});
afterAll(() => {
    if (antes.root === undefined) delete process.env.STARSEED_ROOT;
    else process.env.STARSEED_ROOT = antes.root;
    process.env.HOME = antes.home;
    rmSync(raiz, { recursive: true, force: true });
    rmSync(casa, { recursive: true, force: true });
});
beforeEach(() => {
    mkdirSync(path.dirname(archivo()), { recursive: true });
    writeFileSync(
        archivo(),
        JSON.stringify([
            prop("m1"),
            prop("m2", { importancia: "critica", estado: "pregunta" }),
            prop("g1", { ambito: "grupo:g" }),
            prop("g2", { ambito: "grupo:g", estado: "reimaginando" }),
        ]),
    );
});

describe("medidor «Imaginación» en /api/mando/medidores", () => {
    it("sin ámbito es el de MetaGenesis: pastilla, filas y lo que espera fuera", async () => {
        const { status, cuerpo } = await detalle();
        expect(status).toBe(200);
        const d = cuerpo.detalle!;
        expect(d.resumen).toBe("2 por decidir · 0 reimaginando · 0 integradas hoy");
        // «critica» sin acento cuenta como crítica: la pastilla avisa.
        expect(d.imaginacion).toMatchObject({ ambito: "metagenesis", valor: "2 por decidir", tono: "aviso", hayDatos: true });
        expect(d.imaginacion?.otrosAmbitos).toEqual([{ ambito: "grupo:g", decidibles: 1 }]);
        expect(d.filas.map((f) => f.id)).toEqual(["m2", "m1"]);
        expect(JSON.stringify(cuerpo)).not.toContain(raiz);
    });

    it("filtra por `?ambito=` y rechaza uno que no es del contrato", async () => {
        const { cuerpo } = await detalle("&ambito=grupo%3Ag");
        expect(cuerpo.detalle?.imaginacion).toMatchObject({ ambito: "grupo:g", valor: "1 por decidir", detalle: "1 reimaginando · 0 integradas hoy" });
        expect((await detalle("&ambito=pagina%3Avacia")).cuerpo.detalle?.resumen).toBe("sin propuestas");
        expect((await detalle("&ambito=..%2Fx")).status).toBe(400);
    });

    it("si no puede leer las propuestas, «sin datos» y un aviso; nunca una cifra", async () => {
        writeFileSync(archivo(), "{ esto no es json");
        const { status, cuerpo } = await detalle();
        expect(status).toBe(200);
        expect(cuerpo.detalle).toMatchObject({ resumen: "sin datos", filas: [] });
        expect(cuerpo.detalle?.imaginacion).toMatchObject({ valor: "sin datos", hayDatos: false });
        expect(cuerpo.detalle?.aviso).toContain("No se pudieron leer");
    });
});
