import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CONFORT_DEFECTO, type PreferenciasConfort } from "../../../../lib/xr/confort";

type Ctx = { girar: (dir: -1 | 1) => void };
const h = vi.hoisted(() => ({ confort: null as unknown as PreferenciasConfort, ctx: null as unknown as Ctx }));

vi.mock("@react-three/fiber", () => ({
    useFrame: () => undefined,
    useThree: (sel: (s: { camera: Record<string, never> }) => unknown) => sel({ camera: {} }),
}));
vi.mock("../vineta", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../vineta")>();
    return { ...actual, Vineta: ({ opacidad }: { opacidad: number }) => <div data-testid="vineta" data-opacidad={opacidad} /> };
});
vi.mock("../panel-cristal", () => ({
    Texto3D: ({ children }: { children?: ReactNode }) => <span data-testid="texto-3d">{children}</span>,
}));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort }) }));
vi.mock("../use-entrada-xr", () => ({
    useEntradaXR: (ctx: Ctx) => { h.ctx = ctx; return { disparar: vi.fn(), frase: vi.fn() }; },
}));

import {
    AVISO_REDUCIDO, Comodidad, avisoMovimientoReducido, confortEfectivo, disposicionDeConfort,
    giroDeAccion, opacidadDeFotograma, subtituloDe, velocidadDeCabeza, type PosaCabeza,
} from "../comodidad";
import { acotarOpacidadVineta, radioInteriorVineta } from "../vineta";

const QUIETO: PosaCabeza = { posicion: [0, 0, 0], yaw: 0 };
const RAPIDO: PosaCabeza = { posicion: [2, 0, 0], yaw: Math.PI / 4 };
const base = { modo: "vr-inmersivo" as const, alturaOjos: 1.6, yawActual: () => 0 };

beforeEach(() => { h.confort = { ...CONFORT_DEFECTO }; h.ctx = null as unknown as Ctx; });
afterEach(cleanup);

describe("viñeta de confort", () => {
    it("sube con la velocidad y nunca pasa de 0,85", () => {
        const lenta = opacidadDeFotograma(CONFORT_DEFECTO, QUIETO, { posicion: [0.01, 0, 0], yaw: 0.01 }, 1 / 60);
        const rapida = opacidadDeFotograma(CONFORT_DEFECTO, QUIETO, RAPIDO, 1 / 60);
        expect(rapida).toBeGreaterThan(lenta);
        expect(rapida).toBeGreaterThan(0);
        const extrema = opacidadDeFotograma({ ...CONFORT_DEFECTO, vineta: "siempre", fuerzaVineta: 1 }, QUIETO, RAPIDO, 0.016);
        expect(extrema).toBeLessThanOrEqual(0.85);
        expect(acotarOpacidadVineta(5)).toBe(0.85);
    });

    it("con «nunca» es 0 salvo movimiento reducido, que la enciende", () => {
        const nunca = { ...CONFORT_DEFECTO, vineta: "nunca" as const };
        expect(opacidadDeFotograma(nunca, QUIETO, RAPIDO, 1 / 60)).toBe(0);
        const reducido = { ...nunca, movimientoReducido: true };
        expect(opacidadDeFotograma(reducido, QUIETO, RAPIDO, 1 / 60)).toBeGreaterThan(0);
    });

    it("el anillo cierra el hueco central al subir la opacidad y un valor roto no oscurece", () => {
        expect(radioInteriorVineta(0.85)).toBeLessThan(radioInteriorVineta(0));
        expect(acotarOpacidadVineta(Number.NaN)).toBe(0);
    });
});

describe("movimiento, giro y postura", () => {
    it("mide la velocidad lineal y angular entre dos poses", () => {
        const v = velocidadDeCabeza(QUIETO, RAPIDO, 0.5);
        expect(v.lineal).toBeCloseTo(4, 6);
        expect(v.angularGradosS).toBeCloseTo(90, 6);
        expect(velocidadDeCabeza(QUIETO, RAPIDO, 0)).toEqual({ lineal: 0, angularGradosS: 0 });
    });
    it("ocho saltos de 45° dan la vuelta completa", () => {
        const c = { ...CONFORT_DEFECTO, anguloSalto: 45 as const };
        let yaw = 0;
        for (let i = 0; i < 8; i += 1) yaw = giroDeAccion(yaw, 1, c);
        expect(yaw).toBeCloseTo(Math.PI * 2, 6);
    });
    it("una-mano agrupa Logic con Horizon y acerca la Trinity", () => {
        const d = disposicionDeConfort({ ...CONFORT_DEFECTO, postura: "una-mano" }, { modo: "vr-inmersivo", alturaOjos: 1.6 });
        expect(d.nodos.logic.visible).toBe(false);
        expect(d.nodos.logic.agrupadoCon).toBe("horizon");
        expect(d.nodos.zenith.distancia).toBe(1.2);
        expect(disposicionDeConfort(CONFORT_DEFECTO, { modo: "vr-inmersivo", alturaOjos: 1.6 }).nodos.logic.visible).toBe(true);
    });
    it("el movimiento reducido fuerza saltos y teletransporte y lo avisa", () => {
        const c = { ...CONFORT_DEFECTO, locomocion: "continua" as const, giro: "continuo" as const, movimientoReducido: true };
        const e = confortEfectivo(c);
        expect(e.giro).toBe("saltos");
        expect(e.locomocion).toBe("teletransporte");
        expect(e.vineta).toBe("siempre");
        expect(avisoMovimientoReducido(c)).toBe(AVISO_REDUCIDO);
        expect(avisoMovimientoReducido(CONFORT_DEFECTO)).toBeNull();
    });
});

describe("subtítulos y componente", () => {
    it("una línea junta Astraura y transmisión; se apaga con la preferencia", () => {
        expect(subtituloDe(CONFORT_DEFECTO, { astraura: "Hola", transmision: "Ana: ey" })).toBe("Hola · Ana: ey");
        expect(subtituloDe({ ...CONFORT_DEFECTO, subtitulos: false }, { astraura: "Hola" })).toBeNull();
        expect(subtituloDe(CONFORT_DEFECTO, { astraura: "  ", transmision: null })).toBeNull();
    });
    it("el componente pinta el subtítulo con la preferencia encendida y lo oculta apagada", () => {
        const vista = render(<Comodidad {...base} alGirar={vi.fn()} astraura="Te escucho" transmision="Ana: hola" />);
        expect(screen.getByTestId("texto-3d")).toHaveTextContent("Te escucho · Ana: hola");
        vista.unmount();
        h.confort = { ...CONFORT_DEFECTO, subtitulos: false };
        render(<Comodidad {...base} alGirar={vi.fn()} astraura="Te escucho" />);
        expect(screen.queryByTestId("texto-3d")).toBeNull();
    });
    it("las acciones de giro mueven el rig con el ángulo configurado", () => {
        const alGirar = vi.fn();
        h.confort = { ...CONFORT_DEFECTO, anguloSalto: 45 };
        render(<Comodidad {...base} alGirar={alGirar} />);
        act(() => { h.ctx.girar(1); });
        expect(alGirar).toHaveBeenLastCalledWith(Math.PI / 4);
        act(() => { h.ctx.girar(-1); });
        expect(alGirar).toHaveBeenLastCalledWith(0);
    });
});
