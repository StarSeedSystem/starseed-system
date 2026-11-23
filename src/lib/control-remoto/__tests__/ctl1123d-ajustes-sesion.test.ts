import { describe, expect, it } from "vitest";
import {
    AJUSTES_DEFECTO,
    deserializarAjustes,
    normalizarCalidadJpeg,
    normalizarFps,
    normalizarLadoMaximo,
    normalizarModoTeclado,
    normalizarPerfilMultiantena,
    serializarAjustes,
    sonIguales,
    validarAjustes,
    type AjustesSesion,
    type CalidadJpeg,
    type FpsObjetivo,
    type LadoMaximo,
    type ModoTeclado,
    type PerfilMultiantena,
} from "../ajustes-sesion";

describe("CTL1123D · ajustes avanzados de sesión remota", () => {
    describe("normalizarFps", () => {
        it.each<[unknown, FpsObjetivo]>([
            [15, 15],
            [24, 24],
            [30, 30],
            [60, 60],
            [10, 30],
            [45, 30],
            ["30", 30],
            [null, 30],
            [undefined, 30],
            [{}, 30],
        ])("devuelve %p para entrada %p", (entrada, esperado) => {
            expect(normalizarFps(entrada)).toBe(esperado);
        });
    });

    describe("normalizarLadoMaximo", () => {
        it.each<[unknown, LadoMaximo]>([
            [720, 720],
            [1080, 1080],
            [1280, 1280],
            [1920, 1920],
            [800, 1280],
            [2000, 1280],
            ["1080", 1280],
            [null, 1280],
        ])("devuelve %p para entrada %p", (entrada, esperado) => {
            expect(normalizarLadoMaximo(entrada)).toBe(esperado);
        });
    });

    describe("normalizarCalidadJpeg", () => {
        it.each<[unknown, CalidadJpeg]>([
            [40, 40],
            [50, 50],
            [75, 75],
            [90, 90],
            [30, 40],
            [95, 90],
            [75.6, 76],
            [75.4, 75],
            ["75", 75],
            [null, 75],
            [undefined, 75],
        ])("devuelve %p para entrada %p", (entrada, esperado) => {
            expect(normalizarCalidadJpeg(entrada)).toBe(esperado);
        });
    });

    describe("normalizarPerfilMultiantena", () => {
        it.each<[unknown, PerfilMultiantena]>([
            ["auto-simultaneo", "auto-simultaneo"],
            ["baja-latencia", "baja-latencia"],
            ["ahorro", "ahorro"],
            ["otro", "auto-simultaneo"],
            [123, "auto-simultaneo"],
            [null, "auto-simultaneo"],
        ])("devuelve %p para entrada %p", (entrada, esperado) => {
            expect(normalizarPerfilMultiantena(entrada)).toBe(esperado);
        });
    });

    describe("normalizarModoTeclado", () => {
        it.each<[unknown, ModoTeclado]>([
            ["mensaje", "mensaje"],
            ["tiempo-real", "tiempo-real"],
            ["ambos", "ambos"],
            ["otro", "ambos"],
            [123, "ambos"],
            [null, "ambos"],
        ])("devuelve %p para entrada %p", (entrada, esperado) => {
            expect(normalizarModoTeclado(entrada)).toBe(esperado);
        });
    });

    describe("validarAjustes", () => {
        it("objeto vacío devuelve los ajustes por defecto", () => {
            expect(validarAjustes({})).toEqual(AJUSTES_DEFECTO);
        });

        it("valores válidos se conservan", () => {
            const entrada: Partial<AjustesSesion> = {
                fpsObjetivo: 60,
                ladoMaximo: 1920,
                calidadJpeg: 85 as CalidadJpeg,
                perfilMultiantena: "baja-latencia",
                modoTeclado: "tiempo-real",
            };
            expect(validarAjustes(entrada)).toEqual({
                fpsObjetivo: 60,
                ladoMaximo: 1920,
                calidadJpeg: 85 as CalidadJpeg,
                perfilMultiantena: "baja-latencia",
                modoTeclado: "tiempo-real",
            });
        });

        it("valores inválidos se normalizan (fps, lado, perfil, modo a defecto; calidad se clampa)", () => {
            const entrada: Partial<AjustesSesion> = {
                fpsObjetivo: 999 as FpsObjetivo,
                ladoMaximo: 500 as LadoMaximo,
                calidadJpeg: 200 as CalidadJpeg,
                perfilMultiantena: "invalido" as PerfilMultiantena,
                modoTeclado: "raro" as ModoTeclado,
            };
            const r = validarAjustes(entrada);
            expect(r.fpsObjetivo).toBe(AJUSTES_DEFECTO.fpsObjetivo);
            expect(r.ladoMaximo).toBe(AJUSTES_DEFECTO.ladoMaximo);
            expect(r.calidadJpeg).toBe(90 as CalidadJpeg);
            expect(r.perfilMultiantena).toBe(AJUSTES_DEFECTO.perfilMultiantena);
            expect(r.modoTeclado).toBe(AJUSTES_DEFECTO.modoTeclado);
        });

        it("parcial: solo fpsObjetivo válido, resto por defecto", () => {
            const r = validarAjustes({ fpsObjetivo: 24 });
            expect(r.fpsObjetivo).toBe(24);
            expect(r.ladoMaximo).toBe(AJUSTES_DEFECTO.ladoMaximo);
            expect(r.calidadJpeg).toBe(AJUSTES_DEFECTO.calidadJpeg);
            expect(r.perfilMultiantena).toBe(AJUSTES_DEFECTO.perfilMultiantena);
            expect(r.modoTeclado).toBe(AJUSTES_DEFECTO.modoTeclado);
        });
    });

    describe("serializarAjustes / deserializarAjustes", () => {
        it("round-trip conserva todos los campos", () => {
            const original: AjustesSesion = {
                fpsObjetivo: 60,
                ladoMaximo: 1920,
                calidadJpeg: 90 as CalidadJpeg,
                perfilMultiantena: "ahorro",
                modoTeclado: "mensaje",
            };
            const serializado = serializarAjustes(original);
            const recuperado = deserializarAjustes(serializado);
            expect(recuperado).toEqual(original);
        });

        it("serializado es JSON compacto con claves cortas", () => {
            const s = serializarAjustes(AJUSTES_DEFECTO);
            expect(s).toContain('"f":30');
            expect(s).toContain('"l":1280');
            expect(s).toContain('"q":75');
            expect(s).toContain('"p":"auto-simultaneo"');
            expect(s).toContain('"t":"ambos"');
        });

        it("JSON inválido devuelve ajustes por defecto", () => {
            expect(deserializarAjustes("no-es-json")).toEqual(AJUSTES_DEFECTO);
            expect(deserializarAjustes("")).toEqual(AJUSTES_DEFECTO);
            expect(deserializarAjustes("{}")).toEqual(AJUSTES_DEFECTO);
        });

        it("JSON con campos extra los ignora", () => {
            const s = JSON.stringify({ f: 15, l: 720, q: 50, p: "baja-latencia", t: "tiempo-real", extra: "ignorado" });
            const r = deserializarAjustes(s);
            expect(r.fpsObjetivo).toBe(15);
            expect(r.ladoMaximo).toBe(720);
            expect(r.calidadJpeg).toBe(50);
            expect(r.perfilMultiantena).toBe("baja-latencia");
            expect(r.modoTeclado).toBe("tiempo-real");
        });

        it("valores inválidos en JSON se normalizan (fps, lado, perfil, modo a defecto; calidad se clampa)", () => {
            const s = JSON.stringify({ f: 999, l: 500, q: 200, p: "x", t: "y" });
            const r = deserializarAjustes(s);
            expect(r.fpsObjetivo).toBe(AJUSTES_DEFECTO.fpsObjetivo);
            expect(r.ladoMaximo).toBe(AJUSTES_DEFECTO.ladoMaximo);
            expect(r.calidadJpeg).toBe(90 as CalidadJpeg);
            expect(r.perfilMultiantena).toBe(AJUSTES_DEFECTO.perfilMultiantena);
            expect(r.modoTeclado).toBe(AJUSTES_DEFECTO.modoTeclado);
        });
    });

    describe("sonIguales", () => {
        it("true para ajustes idénticos", () => {
            const a: AjustesSesion = { ...AJUSTES_DEFECTO };
            const b: AjustesSesion = { ...AJUSTES_DEFECTO };
            expect(sonIguales(a, b)).toBe(true);
        });

        it("false si cambia cualquier campo", () => {
            const base: AjustesSesion = { ...AJUSTES_DEFECTO };
            expect(sonIguales(base, { ...base, fpsObjetivo: 60 })).toBe(false);
            expect(sonIguales(base, { ...base, ladoMaximo: 1920 })).toBe(false);
            expect(sonIguales(base, { ...base, calidadJpeg: 50 as CalidadJpeg })).toBe(false);
            expect(sonIguales(base, { ...base, perfilMultiantena: "ahorro" })).toBe(false);
            expect(sonIguales(base, { ...base, modoTeclado: "mensaje" })).toBe(false);
        });
    });
});