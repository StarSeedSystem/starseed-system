/**
 * XR1010AF · comodidad aplicada: viñeta, giro por saltos, subtítulos, una mano y movimiento reducido.
 * El lienzo (three/R3F/uikit) va simulado: se prueban las funciones puras y lo que se pinta.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CONFORT_DEFECTO, aplicarMovimientoReducido, opacidadVineta, type PreferenciasConfort } from "@/lib/xr/confort";
import { Comodidad, disposicionDe, locomocionEfectiva, saltoDe, subtituloVisible, textoSubtitulo, velocidadDe } from "../comodidad";
import { TOPE_VINETA, geometriaVineta, opacidadMalla } from "../vineta";
const h = vi.hoisted(() => ({ confort: null as unknown as PreferenciasConfort }));
vi.mock("@react-three/fiber", () => ({ useFrame: () => undefined }));
vi.mock("@react-three/uikit", () => ({
    Container: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
    Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../use-entrada-xr", () => ({ useEntradaXR: () => ({ disparar: () => undefined, frase: () => undefined }) }));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort }) }));
const confort = (cambios: Partial<PreferenciasConfort> = {}): PreferenciasConfort => ({ ...CONFORT_DEFECTO, ...cambios });
const muestra = (x: number, yaw: number, t: number) => ({ x, y: 1.6, z: 0, yaw, t });
beforeEach(() => { h.confort = confort(); });
afterEach(cleanup);
describe("velocidad de la cabeza", () => {
    it("sin muestra previa o con tiempo raro no inventa movimiento", () => {
        expect(velocidadDe(null, muestra(0, 0, 1000))).toEqual({ lineal: 0, angularGradosS: 0 });
        expect(velocidadDe(muestra(0, 0, 1000), muestra(9, 3, 1000))).toEqual({ lineal: 0, angularGradosS: 0 });
        expect(velocidadDe(muestra(0, 0, 2000), muestra(9, 3, 1000))).toEqual({ lineal: 0, angularGradosS: 0 });
    });
    it("mide metros por segundo y grados por segundo (1 m y 90° en 1 s)", () => {
        const v = velocidadDe(muestra(0, 0, 1000), muestra(1, Math.PI / 2, 2000));
        expect(v.lineal).toBeCloseTo(1, 6);
        expect(v.angularGradosS).toBeCloseTo(90, 6);
    });
});
describe("viñeta", () => {
    it("sube con la velocidad y nunca pasa del tope de 0,85", () => {
        const quieta = opacidadMalla(confort(), { lineal: 0, angularGradosS: 0 });
        const rapida = opacidadMalla(confort(), { lineal: 3, angularGradosS: 120 });
        const extrema = opacidadMalla(confort(), { lineal: 1e9, angularGradosS: 1e9 });
        expect(quieta).toBe(0);
        expect(rapida).toBeGreaterThan(quieta);
        expect(extrema).toBeLessThanOrEqual(TOPE_VINETA);
        expect(extrema).toBeGreaterThan(0);
    });
    it("con «nunca» es 0, salvo que el movimiento reducido la imponga", () => {
        const nunca = confort({ vineta: "nunca" });
        expect(opacidadMalla(nunca, { lineal: 4, angularGradosS: 200 })).toBe(0);
        const reducido = aplicarMovimientoReducido(confort({ vineta: "nunca", movimientoReducido: true }));
        expect(opacidadVineta(reducido, { lineal: 0, angularGradosS: 0 })).toBeGreaterThan(0);
    });
    it("el anillo nunca tapa del todo: a opacidad 1 deja un hueco (tope 0,85)", () => {
        const g = geometriaVineta(1);
        expect(g.opacidad).toBe(TOPE_VINETA);
        expect(g.interno).toBeGreaterThan(0);
        expect(g.interno).toBeLessThan(g.externo);
        expect(geometriaVineta(0).interno).toBe(geometriaVineta(0).externo);
        expect(geometriaVineta(Number.NaN).opacidad).toBe(0);
    });
});
describe("giro por saltos", () => {
    it("ocho saltos de 45° dan la vuelta completa", () => {
        const c = confort({ giro: "saltos", anguloSalto: 45 });
        let yaw = 0;
        for (let i = 0; i < 8; i += 1) yaw = saltoDe(yaw, 1, c);
        expect(yaw).toBeCloseTo(Math.PI * 2, 6);
        expect(saltoDe(0, -1, c)).toBeCloseTo(-Math.PI / 4, 6);
    });
    it("el movimiento reducido fuerza saltos y teletransporte aunque se pidiera continuo", () => {
        const crudo = confort({ giro: "continuo", locomocion: "continua", movimientoReducido: true });
        expect(locomocionEfectiva(crudo).modo).toBe("teletransporte");
        expect(locomocionEfectiva(crudo).aviso).toMatch(/movimiento reducido/i);
        const efectivo = aplicarMovimientoReducido(crudo);
        expect(efectivo.giro).toBe("saltos");
        expect(efectivo.locomocion).toBe("teletransporte");
        expect(locomocionEfectiva(confort({ locomocion: "continua" })).modo).toBe("continua");
    });
});
describe("subtítulos y postura", () => {
    it("solo se ven con la preferencia encendida y dicen quién habla", () => {
        const s = { texto: "  hola  ", quien: "astraura" as const };
        expect(subtituloVisible(confort(), s)).toBe(true);
        expect(subtituloVisible(confort({ subtitulos: false }), s)).toBe(false);
        expect(subtituloVisible(confort(), { texto: "   ", quien: "transmision" })).toBe(false);
        expect(textoSubtitulo(s)).toBe("Astraura: hola");
        expect(textoSubtitulo({ texto: "te oigo", quien: "transmision" })).toBe("En la transmisión: te oigo");
    });
    it("«una-mano» cambia la postura y agrupa Horizon y Logic en pestañas", () => {
        const pie = disposicionDe(confort(), 1.6);
        const mano = disposicionDe(confort({ postura: "una-mano" }), 1.6);
        expect(pie.nodos.zenith.distancia).toBe(1.8);
        expect(mano.nodos.zenith.distancia).toBe(1.2);
        expect(mano.nodos.logic.visible).toBe(false);
        expect(mano.nodos.logic.agrupadoCon).toBe("horizon");
    });
});
describe("Comodidad (jsdom con lienzo simulado)", () => {
    it("pinta el subtítulo de Astraura y lo oculta si la preferencia está apagada", () => {
        const s = { texto: "creo el mundo", quien: "astraura" as const };
        render(<Comodidad subtitulo={s} />);
        expect(screen.getByText("Astraura: creo el mundo")).toBeInTheDocument();
        cleanup();
        h.confort = confort({ subtitulos: false });
        render(<Comodidad subtitulo={s} />);
        expect(screen.queryByText("Astraura: creo el mundo")).toBeNull();
    });
    it("en una mano pinta pestañas reales y al tocar Logic cambia la activa", () => {
        h.confort = confort({ postura: "una-mano" });
        render(<Comodidad />);
        expect(screen.getByText("▶ Horizonte")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Logic"));
        expect(screen.getByText("▶ Logic")).toBeInTheDocument();
    });
    it("con movimiento reducido y locomoción continua lo dice una vez", () => {
        h.confort = confort({ movimientoReducido: true, locomocion: "continua" });
        render(<Comodidad />);
        expect(screen.getByText(/no se camina de forma continua/)).toBeInTheDocument();
    });
});
