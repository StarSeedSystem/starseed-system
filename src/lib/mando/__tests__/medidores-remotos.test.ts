/**
 * Medidores remotos por la puerta (IND1029F): el paquete que el líder copia (`estado.medidores` +
 * arriendo `direccion.lider`), la decisión local/puerta y la marca. Funciones puras y `fetch`
 * simulado; sin claves ni URLs de verdad en cadena ni código.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CACHE_MS, MAS_VIEJA_MS, VIDA_FOTO_MS, elegirFuente, faltaLocal, leerPuerta, leerRespuestas, parsearArriendo, parsearFoto, reiniciarPuerta, resumenDePuerta } from "../medidores-remotos";

const AHORA = 1_700_000_000_000; const T_FOTO = new Date(AHORA - 120_000).toISOString();
const PUERTA = "https://datos.prueba.example";
const FICHA = ["pd", "_", "x".repeat(43)].join("");

const FOTO = { generado_en: T_FOTO, enjambre_vivo: true, enjambre_pausado: false, agentes: 3, fila: 12, estados: { en_curso: 4, hecha: 9 } };
const ARRIENDO = { dueno: "mac-abc123", caduca: (AHORA + 120_000) / 1000, version: 2, tomado: AHORA / 1000 };

describe("la foto del líder y el arriendo", () => {
    it("foto válida: lista blanca de campos y estados de nombre corto", () => {
        const f = parsearFoto({ ...FOTO, secreto: "pd_xxx", ruta: "/Users/alex/x" });
        expect(f).toEqual({ generadoEn: T_FOTO, obsoleto: false, enjambreVivo: true, enjambrePausado: false, agentes: 3, fila: 12, estados: { en_curso: 4, hecha: 9 } });
    });
    it("basura no es foto", () => {
        expect(parsearFoto(null)).toBeNull();
        expect(parsearFoto({ generado_en: "no es una fecha" })).toBeNull();
        expect(parsearFoto({ generado_en: T_FOTO, agentes: -7 })).toEqual({ generadoEn: T_FOTO, obsoleto: false, enjambreVivo: false, enjambrePausado: false, agentes: 0, fila: 0, estados: {} });
    });
    it("el arriendo dice de qué neurona si no está caducado", () => {
        expect(parsearArriendo(ARRIENDO, AHORA)).toBe("mac-abc123");
        expect(parsearArriendo({ dueno: "mac-abc123", caduca: (AHORA - 1_000) / 1000 }, AHORA)).toBeNull();
        expect(parsearArriendo({ dueno: "con espacio raro", caduca: (AHORA + 9e9) / 1000 }, AHORA)).toBeNull();
    });
});
describe("la decisión de fuente", () => {
    it("lo local con datos manda si la reunión es fresca", () => {
        expect(faltaLocal({ progreso: { X: { estado: "hecho" } } })).toBe(false);
        expect(faltaLocal({ progreso: {}, latidos: [], fila: [] })).toBe(true);
        expect(faltaLocal(null)).toBe(true);
    });
    it("lo local vacío y con foto viva: puerta", () => {
        expect(elegirFuente({ faltaLocal: true, localMs: AHORA, fotoMs: T_FOTO ? Date.parse(T_FOTO) : 0, ahora: AHORA })).toBe("puerta");
    });
    it("sin foto o foto muerta: local, aunque falte lo local", () => {
        expect(elegirFuente({ faltaLocal: true, localMs: AHORA, fotoMs: 0, ahora: AHORA })).toBe("local");
        expect(elegirFuente({ faltaLocal: true, localMs: AHORA, fotoMs: AHORA - VIDA_FOTO_MS - 1, ahora: AHORA })).toBe("local");
    });
    it("lo local viejo y la foto más nueva: puerta; si lo local es igual o más nuevo, local", () => {
        const localMs = AHORA - MAS_VIEJA_MS - 1;
        expect(elegirFuente({ faltaLocal: false, localMs, fotoMs: AHORA - 60_000, ahora: AHORA })).toBe("puerta");
        expect(elegirFuente({ faltaLocal: false, localMs: AHORA - 60_000, fotoMs: AHORA - 120_000, ahora: AHORA })).toBe("local");
    });
});
describe("la marca de la respuesta", () => {
    const lectura = { foto: parsearFoto(FOTO), desde: "mac-abc123", tFoto: AHORA - 120_000 };
    it("con foto: desde quién y hace cuántos minutos", () => {
        const r = resumenDePuerta(lectura, true, AHORA);
        expect(r.hayFoto).toBe(true); expect(r.usada).toBe(true); expect(r.desde).toBe("mac-abc123");
        expect(r.haceMin).toBe(2); expect(r.foto?.agentes).toBe(3);
        expect(JSON.stringify(r.foto)).not.toContain("generadoEn");
    });
    it("sin foto se dice: hayFoto false y nada inventado", () => {
        expect(resumenDePuerta(null, false, AHORA)).toEqual({ hayFoto: false, usada: false, desde: null, haceMin: null, generadoEn: null, foto: null });
    });
});
describe("la lectura de la puerta en sí", () => {
    const director = { latidos: [{ id: "direccion.lider", t: T_FOTO, datos: ARRIENDO }] };
    const metagenesis = { latidos: [{ id: "estado.medidores", t: T_FOTO, datos: FOTO }] };
    it("junta la foto y el dueño del arriendo", () => {
        const l = leerRespuestas(director, metagenesis, AHORA);
        expect(l.foto?.fila).toBe(12); expect(l.desde).toBe("mac-abc123"); expect(l.tFoto).toBe(Date.parse(T_FOTO));
    });
    it("t fuera de largo, datos ajenos: nada, pero sin lanzar", () => {
        const l = leerRespuestas({ latidos: [] }, { latidos: [8, null, "x"] }, AHORA);
        expect(l).toEqual({ foto: null, desde: null, tFoto: 0 });
    });
});
describe("leerPuerta contra la puerta simulada", () => {
    beforeEach(() => {
        reiniciarPuerta();
        process.env.PUERTA_DATOS_URL = PUERTA;
        process.env.PUERTA_DATOS_FICHA_ENJAMBRE = FICHA;
    });
    afterEach(() => {
        process.env.PUERTA_DATOS_URL = undefined;
        process.env.PUERTA_DATOS_FICHA_ENJAMBRE = undefined;
        process.env.PUERTA_DATOS_FICHA = undefined;
        vi.unstubAllGlobals();
        reiniciarPuerta();
    });
    type Cuerpo = { latidos?: { id: string; t: string; datos: unknown }[] } | null;
    function puerta(foto: Cuerpo, arr: Cuerpo) {
        const llamadas: string[] = [];
        const f = vi.fn(async (url: string | URL | Request) => {
            const u = String(url);
            llamadas.push(u);
            const c = u.includes("clase=director") ? arr : u.includes("clase=metagenesis") ? foto : null;
            return new Response(JSON.stringify(c), { status: c ? 200 : 404 });
        });
        return { f, llamadas };
    }
    it("trae la foto y el dueño; la ficha va como Bearer y nunca en la cadena", async () => {
        const { f, llamadas } = puerta({ latidos: [{ id: "estado.medidores", t: T_FOTO, datos: FOTO }] }, { latidos: [{ id: "direccion.lider", t: T_FOTO, datos: ARRIENDO }] });
        const l = await leerPuerta(f, AHORA);
        expect(l?.foto?.agentes).toBe(3); expect(l?.desde).toBe("mac-abc123");
        expect(llamadas).toHaveLength(2);
        expect(llamadas.every((u) => !u.includes(FICHA))).toBe(true);
    });
    it("caché 60 s: la segunda llamada no vuelve a la puerta", async () => {
        const { f, llamadas } = puerta({ latidos: [{ id: "estado.medidores", t: T_FOTO, datos: FOTO }] }, null);
        await leerPuerta(f, AHORA);
        await leerPuerta(f, AHORA + CACHE_MS - 1);
        expect(llamadas).toHaveLength(2);
    });
    it("sin URL o sin ficha, ni se pregunta; si la puerta falla o no hay foto, null", async () => {
        delete process.env.PUERTA_DATOS_URL;
        expect(await leerPuerta(vi.fn(), AHORA)).toBeNull();
        process.env.PUERTA_DATOS_URL = PUERTA;
        const { f, llamadas } = puerta(null, null);
        expect(await leerPuerta(f, AHORA)).toBeNull();
        expect(llamadas).toHaveLength(2);
    });
});