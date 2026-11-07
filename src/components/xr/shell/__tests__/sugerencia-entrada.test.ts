import { describe, expect, it } from "vitest";
import {
    DIAS_HASTA_VOLVER,
    SIEMPRE,
    descartarSugerencia,
    leerDescarte,
    porQueNoHayXR,
    sugerirEntradaXR,
} from "../sugerencia-entrada";

const AHORA = 1_800_000_000_000;
const DIA = 86_400_000;
const sug = (soporte: { tieneXR: boolean; vr: boolean | null; ar: boolean | null }, descartadaHasta: number | typeof SIEMPRE | null = null) =>
    sugerirEntradaXR({ soporte, descartadaHasta, ahora: AHORA });

describe("sugerirEntradaXR · soporte", () => {
    it("sondeando (vr y ar en null) no se muestra: sin parpadeo", () => {
        expect(sug({ tieneXR: false, vr: null, ar: null })).toMatchObject({ mostrar: false, motivo: "sondeando" });
        expect(sug({ tieneXR: true, vr: true, ar: null })).toMatchObject({ mostrar: false, motivo: "sondeando" });
    });
    it("sin WebXR nunca se muestra", () => {
        expect(sug({ tieneXR: false, vr: false, ar: false })).toMatchObject({ mostrar: false, motivo: "sin-webxr" });
        // Aunque algún dato dijera true, sin navigator.xr no se sugiere.
        expect(sug({ tieneXR: false, vr: true, ar: true }).mostrar).toBe(false);
    });
    it("si isSessionSupported dice que no a todo, no se muestra", () => {
        expect(sug({ tieneXR: true, vr: false, ar: false })).toMatchObject({ mostrar: false, motivo: "sin-soporte" });
    });
    it("cada modo solo si está soportado", () => {
        expect(sug({ tieneXR: true, vr: false, ar: true })).toMatchObject({ mostrar: true, vr: false, ar: true });
        expect(sug({ tieneXR: true, vr: true, ar: false })).toMatchObject({ mostrar: true, vr: true, ar: false });
        expect(sug({ tieneXR: true, vr: true, ar: true })).toMatchObject({ mostrar: true, vr: true, ar: true, motivo: "ofrecer" });
    });
});

describe("sugerirEntradaXR · cierre de la sugerencia", () => {
    const todo = { tieneXR: true, vr: true, ar: true };
    it("cerrada hasta una fecha futura no se muestra; en la fecha o después vuelve", () => {
        expect(sug(todo, AHORA + 1)).toMatchObject({ mostrar: false, motivo: "cerrada" });
        expect(sug(todo, AHORA).mostrar).toBe(true);
        expect(sug(todo, AHORA - DIA).mostrar).toBe(true);
    });
    it("«No volver a sugerir» no vuelve nunca", () => {
        expect(sugerirEntradaXR({ soporte: todo, descartadaHasta: SIEMPRE, ahora: AHORA + 1000 * DIA }).mostrar).toBe(false);
    });
});

describe("memoria del cierre", () => {
    it("cerrar con la x vuelve a sugerirse a los 14 días justos", () => {
        const hasta = leerDescarte(descartarSugerencia(AHORA, false));
        expect(hasta).toBe(AHORA + DIAS_HASTA_VOLVER * DIA);
        const todo = { tieneXR: true, vr: true, ar: true };
        expect(sugerirEntradaXR({ soporte: todo, descartadaHasta: hasta, ahora: AHORA + 13 * DIA }).mostrar).toBe(false);
        expect(sugerirEntradaXR({ soporte: todo, descartadaHasta: hasta, ahora: AHORA + 14 * DIA }).mostrar).toBe(true);
    });
    it("«No volver a sugerir» se guarda como siempre", () => {
        expect(leerDescarte(descartarSugerencia(AHORA, true))).toBe(SIEMPRE);
    });
    it("datos vacíos, corruptos o de otra versión equivalen a nunca cerrada", () => {
        expect(leerDescarte(null)).toBeNull();
        expect(leerDescarte("{no es json")).toBeNull();
        expect(leerDescarte(JSON.stringify({ v: 1, hasta: 5 }))).toBeNull();
        expect(leerDescarte(JSON.stringify({ v: 2, hasta: "mañana" }))).toBeNull();
        expect(leerDescarte(JSON.stringify({ v: 2, hasta: Number.NaN }))).toBeNull();
    });
    it("la clave antigua «1» se respeta como siempre; otra cosa no", () => {
        expect(leerDescarte(null, "1")).toBe(SIEMPRE);
        expect(leerDescarte(null, "0")).toBeNull();
        expect(leerDescarte(descartarSugerencia(AHORA, false), "1")).toBe(AHORA + 14 * DIA);
    });
});

describe("porQueNoHayXR", () => {
    const base = { seguro: true, sondeando: false };
    it("explica cada causa", () => {
        expect(porQueNoHayXR({ ...base, sondeando: true, soporte: { tieneXR: false, vr: null, ar: null } })).toMatch(/Comprobando/);
        expect(porQueNoHayXR({ ...base, seguro: false, soporte: { tieneXR: false, vr: false, ar: false } })).toMatch(/https/);
        expect(porQueNoHayXR({ ...base, soporte: { tieneXR: false, vr: false, ar: false } })).toMatch(/no tiene WebXR/);
        expect(porQueNoHayXR({ ...base, soporte: { tieneXR: true, vr: false, ar: false } })).toMatch(/ni virtual/);
        expect(porQueNoHayXR({ ...base, soporte: { tieneXR: true, vr: true, ar: false } })).toMatch(/solo virtual/);
        expect(porQueNoHayXR({ ...base, soporte: { tieneXR: true, vr: false, ar: true } })).toMatch(/solo aumentada/);
    });
});
