/**
 * (Ola 265 · Forja fase 3 — efectos y tomas · 2026-09-07)
 *
 * Contrato de la cadena de efectos de voz (`src/lib/voces/efectos.ts`):
 * la lista de filtros ffmpeg por preset debe ser válida y estar EN ORDEN,
 * porque el orden define el sonido y la clave de caché; y `normalizarEfectos`
 * es la frontera tolerante que acota o descarta lo que mande el cliente.
 */
import { describe, expect, it } from "vitest";
import {
    PRESETS_EFECTOS,
    efectosVacios,
    filtrosFfmpeg,
    normalizarEfectos,
    type EfectosVoz,
} from "../voces/efectos";

const SR = 24000;

describe("filtrosFfmpeg · presets", () => {
    it("narracion: cálida → reverb → compresor → deesser, en ese orden", () => {
        const f = filtrosFfmpeg(PRESETS_EFECTOS.narracion, SR);
        expect(f).toEqual([
            "equalizer=f=200:t=q:w=1:g=2",
            "equalizer=f=4000:t=q:w=1:g=-1.5",
            "aecho=0.8:0.7:30:0.238",
            "acompressor=threshold=-20dB:ratio=3:attack=10:release=120",
            "deesser",
        ]);
    });

    it("chat: clara y seca (sin reverb)", () => {
        const f = filtrosFfmpeg(PRESETS_EFECTOS.chat, SR);
        expect(f).toEqual([
            "equalizer=f=3000:t=q:w=1:g=2.5",
            "highpass=f=90",
            "acompressor=threshold=-20dB:ratio=3:attack=10:release=120",
            "deesser",
        ]);
    });

    it("aviso: radio con su propio compresor fuerte y ganancia al final", () => {
        const f = filtrosFfmpeg(PRESETS_EFECTOS.aviso, SR);
        expect(f).toEqual([
            "highpass=f=300",
            "lowpass=f=3400",
            "acompressor=threshold=-18dB:ratio=4",
            "acompressor=threshold=-20dB:ratio=3:attack=10:release=120",
            "volume=2dB",
        ]);
    });

    it("intimo: cálida con reverb suave y ganancia negativa", () => {
        const f = filtrosFfmpeg(PRESETS_EFECTOS.intimo, SR);
        expect(f).toEqual([
            "equalizer=f=200:t=q:w=1:g=2",
            "equalizer=f=4000:t=q:w=1:g=-1.5",
            "aecho=0.8:0.7:26:0.202",
            "acompressor=threshold=-20dB:ratio=3:attack=10:release=120",
            "deesser",
            "volume=-1dB",
        ]);
    });

    it("neutro: cadena vacía", () => {
        expect(filtrosFfmpeg(PRESETS_EFECTOS.neutro, SR)).toEqual([]);
        expect(efectosVacios(PRESETS_EFECTOS.neutro)).toBe(true);
    });

    it("todos los presets producen cadenas válidas (nombre=opciones)", () => {
        for (const preset of Object.values(PRESETS_EFECTOS)) {
            for (const filtro of filtrosFfmpeg(preset, SR)) {
                // Cada filtro es «nombre» o «nombre=clave:valor…», sin comas ni espacios.
                expect(filtro).toMatch(/^[a-z0-9]+(=[^, ]+)?$/i);
            }
        }
    });
});

describe("filtrosFfmpeg · unidades sueltas", () => {
    it("reverb acotada del lado del filtro: retardo y decaimiento máximos", () => {
        expect(filtrosFfmpeg({ reverb: 1 }, SR)).toEqual(["aecho=0.8:0.7:60:0.5"]);
    });

    it("reverb 0 no emite filtro", () => {
        expect(filtrosFfmpeg({ reverb: 0 }, SR)).toEqual([]);
    });

    it("ganancia 0 no emite filtro; negativa se formatea con signo", () => {
        expect(filtrosFfmpeg({ ganancia: 0 }, SR)).toEqual([]);
        expect(filtrosFfmpeg({ ganancia: -3 }, SR)).toEqual(["volume=-3dB"]);
    });

    it("eq «ninguna» no emite nada", () => {
        expect(filtrosFfmpeg({ eq: "ninguna" }, SR)).toEqual([]);
    });
});

describe("normalizarEfectos", () => {
    it("acota/descarta: {reverb: 5, ganancia: 40, eq: \"rara\"}", () => {
        const n = normalizarEfectos({ reverb: 5, ganancia: 40, eq: "rara" });
        expect(n).toEqual({ reverb: 1, ganancia: 6 });
        expect(n.eq).toBeUndefined();
    });

    it("ignora claves desconocidas y nunca lanza con basura", () => {
        expect(normalizarEfectos({ brillo: 9, eq: "clara" })).toEqual({ eq: "clara" });
        expect(normalizarEfectos(null)).toEqual({});
        expect(normalizarEfectos("cadena")).toEqual({});
        expect(normalizarEfectos(42)).toEqual({});
        expect(normalizarEfectos(undefined)).toEqual({});
    });

    it("booleanos solo si son exactamente true; números raros fuera", () => {
        const n = normalizarEfectos({
            compresor: "sí" as unknown as boolean,
            deesser: true,
            reverb: Number.NaN,
            ganancia: -40,
        });
        expect(n.compresor).toBeUndefined();
        expect(n.deesser).toBe(true);
        expect(n.reverb).toBeUndefined();
        expect(n.ganancia).toBe(-6);
    });
});

describe("efectos vacíos", () => {
    it("objeto vacío normaliza a cadena vacía", () => {
        const vacio: EfectosVoz = normalizarEfectos({});
        expect(filtrosFfmpeg(vacio, SR)).toEqual([]);
        expect(efectosVacios(vacio)).toBe(true);
    });
});
