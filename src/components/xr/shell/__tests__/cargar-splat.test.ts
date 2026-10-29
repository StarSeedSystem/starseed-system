import { describe, expect, it } from "vitest";
import type { NivelCalidad } from "@/lib/xr/tipos";
import type { ObjetoMundo } from "@/lib/xr/mundo-tipos";
import {
    MAX_BYTES_SPLAT, MOTIVO_FALLO_SPLAT, MOTIVO_NIVEL_SPLAT, MOTIVO_TAMANO_SPLAT, MOTIVO_URL_SPLAT,
    cargarSplat, puedeUsarSplat, presupuestoSplat, revisarUrlSplat, urlSplatDeObjeto, urlSplatSegura,
    type ConstructorSplatMesh, type MallaSplat, type OpcionesSplatMesh,
} from "../cargar-splat";

const URL_OK = "https://cdn.starseed.app/mundos/cumbre.spz";
const BYTES = new Uint8Array([1, 2, 3, 4]);

interface Registro { opciones?: OpcionesSplatMesh; dispuesta?: boolean }

function creadorFalso(registro: Registro): ConstructorSplatMesh {
    return class implements MallaSplat {
        initialized: Promise<unknown> = Promise.resolve();
        constructor(opciones: OpcionesSplatMesh) { registro.opciones = opciones; }
        dispose(): void { registro.dispuesta = true; }
    };
}

const objeto = (fuente: ObjetoMundo["fuente"]): ObjetoMundo => ({
    id: "obj-1", nombre: "Cumbre", fuente, pos: [0, 0, 0], rot: [0, 0, 0], esc: [1, 1, 1],
    color: "#10B981", prioridad: 1,
});

describe("nivel · solo alta y máxima", () => {
    it.each([
        ["minima", false], ["baja", false], ["media", false], ["alta", true], ["maxima", true],
    ] as Array<[NivelCalidad, boolean]>)("%s → %s", (nivel, esperado) => {
        expect(puedeUsarSplat(nivel)).toBe(esperado);
    });
    it("presupuesto: 1,5 M en alta, 3 M en máxima y 0 en los demás", () => {
        expect(presupuestoSplat("alta")).toBe(1_500_000);
        expect(presupuestoSplat("maxima")).toBe(3_000_000);
        for (const nivel of ["minima", "baja", "media"] as NivelCalidad[]) expect(presupuestoSplat(nivel)).toBe(0);
    });
});

describe("urlSplatSegura · https sin credenciales", () => {
    it("acepta una URL https normal", () => {
        expect(urlSplatSegura(URL_OK)).toBe(true);
        expect(revisarUrlSplat(URL_OK)).toBeNull();
    });
    it.each([
        "http://cdn.starseed.app/a.spz",
        "https://ana:secreto@cdn.starseed.app/a.spz",
        "https://ana@cdn.starseed.app/a.spz",
        "",
        "no es una url",
    ])("rechaza %s", (url) => {
        expect(urlSplatSegura(url)).toBe(false);
        expect(revisarUrlSplat(url)).toBe(MOTIVO_URL_SPLAT);
    });
});

describe("urlSplatDeObjeto · solo Biblioteca con formato splat", () => {
    it("devuelve la URL y no la inventa", () => {
        expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL_OK, formato: "splat" }))).toBe(URL_OK);
        expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: URL_OK, formato: "glb" }))).toBeNull();
        expect(urlSplatDeObjeto(objeto({ tipo: "biblioteca", id: "ficha-123", formato: "splat" }))).toBeNull();
        expect(urlSplatDeObjeto(objeto({ tipo: "texto", contenido: "hola" }))).toBeNull();
    });
});

describe("cargarSplat · motivos en vez de excepciones", () => {
    it("un archivo mayor de 60 MB no se carga y dice el motivo", async () => {
        const grande = { byteLength: MAX_BYTES_SPLAT + 1 } as unknown as Uint8Array;
        const r = await cargarSplat(URL_OK, { obtenerBytes: async () => grande });
        expect(r).toEqual({ ok: false, motivo: expect.stringContaining(MOTIVO_TAMANO_SPLAT) });
        if (!r.ok) expect(r.motivo).toContain("60 MB");
    });
    it("un nivel que no admite splats ni descarga el archivo", async () => {
        let descargado = false;
        const r = await cargarSplat(URL_OK, { nivel: "media", obtenerBytes: async () => ((descargado = true), BYTES) });
        expect(r).toEqual({ ok: false, motivo: MOTIVO_NIVEL_SPLAT });
        expect(descargado).toBe(false);
    });
    it("un cargador falso que lanza devuelve { ok:false }", async () => {
        const lanza = function lanza(): MallaSplat { throw new Error("motor roto"); } as unknown as ConstructorSplatMesh;
        const r = await cargarSplat(URL_OK, { nivel: "alta", SplatMesh: lanza, obtenerBytes: async () => BYTES });
        expect(r).toEqual({ ok: false, motivo: MOTIVO_FALLO_SPLAT });
    });
    it("si el import perezoso de Spark falla, tampoco lanza", async () => {
        const r = await cargarSplat(URL_OK, {
            nivel: "maxima", obtenerBytes: async () => BYTES,
            importarSpark: async () => { throw new Error("sin motor"); },
        });
        expect(r).toEqual({ ok: false, motivo: MOTIVO_FALLO_SPLAT });
    });
    it("una URL insegura se rechaza antes de descargar", async () => {
        let descargado = false;
        const r = await cargarSplat("http://cdn.starseed.app/a.spz", {
            obtenerBytes: async () => ((descargado = true), BYTES),
        });
        expect(r).toEqual({ ok: false, motivo: MOTIVO_URL_SPLAT });
        expect(descargado).toBe(false);
    });
});

describe("cargarSplat · camino correcto con motor inyectado", () => {
    it("construye la malla con los bytes, el tope del nivel y sin credenciales", async () => {
        const registro: Registro = {};
        const r = await cargarSplat(URL_OK, {
            nivel: "alta", SplatMesh: creadorFalso(registro), obtenerBytes: async () => BYTES,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.bytes).toBe(BYTES.byteLength);
            expect(r.puntos).toBe(1_500_000);
            expect(typeof r.malla.dispose).toBe("function");
        }
        expect(registro.opciones).toMatchObject({
            url: URL_OK, fileBytes: BYTES, maxSplats: 1_500_000, withCredentials: false,
        });
    });
});
