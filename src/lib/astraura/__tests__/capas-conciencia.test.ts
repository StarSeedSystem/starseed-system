import { describe, expect, it } from "vitest";

import {
    NIVELADOR_DEFECTO,
    aCampos,
    destinoNivelador,
    estadoCapas,
    fuentesApagadas,
    leerPreferenciaCapas,
    resumenCapas,
    sesgoNivelador,
} from "../capas-conciencia";

describe("preferencias de capas", () => {
    it("sin nada guardado: todo encendido y nivelador 80", () => {
        for (const c of [undefined, null, {}]) {
            const p = leerPreferenciaCapas(c);
            expect(p.activo).toBe(true);
            expect(Object.values(p.capas).every(Boolean)).toBe(true);
            expect(p.nivelador).toBe(NIVELADOR_DEFECTO);
            expect(p.especifico).toBeNull();
        }
    });

    it("respeta lo apagado, acota el nivelador y valida el específico", () => {
        const p = leerPreferenciaCapas({ capa158Nube: false, nivelador158: 140, especifico158: { fuente: "" } });
        expect(p.capas.nube).toBe(false);
        expect(p.capas.local).toBe(true);
        expect(p.nivelador).toBe(100);
        expect(p.especifico).toBeNull();
        expect(leerPreferenciaCapas({ nivelador158: Number.NaN }).nivelador).toBe(80);
        expect(leerPreferenciaCapas({ nivelador158: -3.4 }).nivelador).toBe(0);
    });

    it("aCampos → leerPreferenciaCapas es ida y vuelta", () => {
        const p = leerPreferenciaCapas({ astraura158Activo: false, capa158Mesh: false, nivelador158: 42, especifico158: { fuente: "groq", modelo: "x" } });
        expect(leerPreferenciaCapas(aCampos(p))).toEqual(p);
    });
});

describe("fuentes apagadas y destino del nivelador", () => {
    it("las fuentes 1.58 salen según el maestro y cada capa", () => {
        expect(fuentesApagadas(leerPreferenciaCapas({}))).toEqual([]);
        expect(fuentesApagadas(leerPreferenciaCapas({ capa158Local: false }))).toEqual(["astraura-158-local"]);
        expect(fuentesApagadas(leerPreferenciaCapas({ capa158Nube: false }))).toEqual(["astraura-158-nube"]);
        expect(fuentesApagadas(leerPreferenciaCapas({ astraura158Activo: false }))).toEqual(["astraura-158-local", "astraura-158-nube"]);
    });

    it("destinoNivelador en los bordes", () => {
        expect([0, 33, 34, 66, 67, 100].map(destinoNivelador)).toEqual(["enrutador", "enrutador", "especifico", "especifico", "capas", "capas"]);
    });

    it("sesgo del nivelador para 1.58, específica y resto", () => {
        const con = (n: number) => leerPreferenciaCapas({ nivelador158: n, especifico158: { fuente: "groq", modelo: "m" } });
        // Relativo a la posición por defecto (80): sin tocar el nivelador, sesgo 0.
        expect([0, 50, 80, 100].map((n) => sesgoNivelador(con(n), "astraura-158-local"))).toEqual([-19, -7, 0, 5]);
        expect([0, 50, 100].map((n) => sesgoNivelador(con(n), "groq", "m"))).toEqual([0, 14, 0]);
        expect([0, 50, 80, 100].map((n) => sesgoNivelador(con(n), "openrouter"))).toEqual([10, 4, 0, -2]);
        // En lo difícil no se empuja a 1.58 (pero sí se le puede restar).
        expect(sesgoNivelador(con(100), "astraura-158-nube", undefined, { dificil: true })).toBe(0);
        expect(sesgoNivelador(con(0), "astraura-158-nube", undefined, { dificil: true })).toBe(-19);
        expect(sesgoNivelador(leerPreferenciaCapas({ astraura158Activo: false }), "astraura-158-local")).toBe(0);
    });
});

describe("estado y resumen", () => {
    const p = leerPreferenciaCapas({});
    it("cada capa pasa por apagada, sin señal, activa y sincronizada", () => {
        expect(estadoCapas(leerPreferenciaCapas({ capa158Local: false }), { local: true }).local).toBe("apagada");
        expect(estadoCapas(p, {}).local).toBe("sin-senal");
        expect(estadoCapas(p, { local: false }).local).toBe("sin-senal");
        expect(estadoCapas(p, { local: true }).local).toBe("activa");
        expect(estadoCapas(p, { local: true, chatUsa158: true }).local).toBe("sincronizada");
        expect(estadoCapas(p, { nube: true, chatUsa158: true }).nube).toBe("sincronizada");
        expect(estadoCapas(p, { vecinosMesh: 0 }).mesh).toBe("activa");
        expect(estadoCapas(p, { vecinosMesh: 3 }).mesh).toBe("sincronizada");
        expect(estadoCapas(p, { colectivaConectada: true }).colectiva).toBe("sincronizada");
        expect(estadoCapas(p, { colectivaConectada: false }).colectiva).toBe("sin-senal");
    });

    it("resumen con y sin maestro", () => {
        expect(resumenCapas(p, {}).etiqueta).toBe("1.58 · 4/4 capas");
        expect(resumenCapas(leerPreferenciaCapas({ capa158Mesh: false }), { local: true, chatUsa158: true }))
            .toMatchObject({ modo: "capas", encendidas: 3, sincronizadas: 1 });
        expect(resumenCapas(leerPreferenciaCapas({ astraura158Activo: false }), {}))
            .toEqual({ modo: "enrutador", encendidas: 0, sincronizadas: 0, etiqueta: "Enrutador libre" });
    });
});
