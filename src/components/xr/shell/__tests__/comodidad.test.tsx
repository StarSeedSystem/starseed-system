/** StarSeed XR · pruebas de COMODIDAD (XR1010AF · contrato §3 j). Lienzo simulado: fiber y hooks de
 *  preferencias simulados; toda la lógica real va por funciones puras exportadas de `comodidad.tsx`. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFORT_DEFECTO, aplicarMovimientoReducido, opacidadVineta, type PreferenciasConfort } from "@/lib/xr/confort";
import { velocidadCabeza } from "../comodidad";
import { locomocionEfectiva } from "../comodidad";
import { girarEnRejilla } from "../comodidad";
import { subtituloVisible } from "../comodidad";
import { disposicionComodidad } from "../comodidad";

const h = vi.hoisted(() => ({ confort: null as unknown as PreferenciasConfort }));
vi.mock("@react-three/fiber", () => ({
    useFrame: () => undefined,
    useThree: (sel?: (s: unknown) => unknown) => (sel ? sel({ camera: { position: [0, 1.6, 0] } }) : { camera: { position: [0, 1.6, 0] } }),
}));
vi.mock("../use-prefs-xr", () => ({ usePrefsXR: () => ({ confort: h.confort, vinculos: {} }) }));
vi.mock("../panel-cristal", () => ({ Texto3D: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> }));

import { Comodidad } from "../comodidad";
import { Vineta } from "../vineta";

beforeEach(() => { h.confort = { ...CONFORT_DEFECTO }; });
afterEach(cleanup);

describe("Confort XR (pur)", () => {
    it("la velocidad de la cabeza se mide en grados/s y m/s", () => {
        const r = velocidadCabeza({ yaw: 0, x: 0, y: 1.6, z: 0 }, { yaw: Math.PI / 6, x: 0, y: 1.6, z: 0 }, 0.5);
        expect(r.angularGradosS).toBeCloseTo(60, 0);
        expect(r.lineal).toBe(0);
    });

    it("la viñeta sube con la velocidad y nunca pasa de 0,85", () => {
        const lento = opacidadVineta(CONFORT_DEFECTO, { lineal: 0.2, angularGradosS: 5 });
        const rapido = opacidadVineta(CONFORT_DEFECTO, { lineal: 3, angularGradosS: 200 });
        expect(lento).toBe(0);
        expect(rapido).toBeGreaterThan(lento);
        expect(opacidadVineta(CONFORT_DEFECTO, { lineal: 99, angularGradosS: 9_999 })).toBeLessThanOrEqual(0.85);
    });

    it("con la viñeta en «nunca» es 0, salvo movimiento reducido", () => {
        const nunca = { ...CONFORT_DEFECTO, vineta: "nunca", movimientoReducido: false } as PreferenciasConfort;
        expect(opacidadVineta(nunca, { lineal: 3, angularGradosS: 200 })).toBe(0);
        expect(opacidadVineta({ ...nunca, movimientoReducido: true }, { lineal: 3, angularGradosS: 200 })).toBeGreaterThan(0);
    });

    it("ocho saltos de 45° dan la vuelta completa", () => {
        let yaw = 0;
        for (let i = 0; i < 8; i++) yaw = girarEnRejilla(yaw, 1, 45);
        expect(Math.atan2(Math.sin(yaw), Math.cos(yaw))).toBeCloseTo(0, 6);
        expect(girarEnRejilla(0, 1, 45)).toBeCloseTo(Math.PI / 4, 6);
        expect(girarEnRejilla(0, -1, 45)).toBeCloseTo(-Math.PI / 4, 6);
    });

    it("giro continuo pedido con movimiento reducido queda en saltos y teletransporte, avisado una vez", () => {
        const pedido = { ...CONFORT_DEFECTO, locomocion: "continua", movimientoReducido: true } as PreferenciasConfort;
        const r = locomocionEfectiva(pedido);
        expect(aplicarMovimientoReducido(pedido).giro).toBe("saltos");
        expect(r.locomocion).toBe("teletransporte");
        expect(r.aviso ?? "").toContain("movimiento reducido");
        expect(locomocionEfectiva(CONFORT_DEFECTO).aviso).toBeNull();
    });

    it("los subtítulos se muestran y se ocultan con la preferencia", () => {
        const s = { texto: "¿Qué mundo quieres crear?", origen: "astraura" as const, momento: 1_000 };
        expect(subtituloVisible(CONFORT_DEFECTO, s, 2_000)?.texto).toContain("mundo");
        expect(subtituloVisible({ ...CONFORT_DEFECTO, subtitulos: false }, s, 2_000)).toBeNull();
        expect(subtituloVisible(CONFORT_DEFECTO, s, 1_000 + 7_000)).toBeNull();
    });

    it("la postura de una mano agrupa Horizon y Logic en pestañas y cambia la disposición", () => {
        const dePie = disposicionComodidad({ ...CONFORT_DEFECTO, postura: "de-pie" }, 1.6);
        const unaMano = disposicionComodidad({ ...CONFORT_DEFECTO, postura: "una-mano" }, 1.6);
        expect(unaMano.nodos.logic.agrupadoCon).toBe("horizon");
        expect(unaMano.nodos.logic.visible).toBe(false);
        expect(unaMano.nodos.horizon.distancia).toBeLessThan(dePie.nodos.horizon.distancia);
    });
});

describe("Comodidad (componente)", () => {
    it("muestra lo que dice Astraura como subtítulo", () => {
        render(<Comodidad ultimaFrase="¿Qué mundo quieres crear?" />);
        expect(screen.getByText(/Astraura: ¿Qué mundo quieres crear\?/)).toBeTruthy();
    });

    it("con los subtítulos apagados la frase no aparece", () => {
        h.confort = { ...CONFORT_DEFECTO, subtitulos: false };
        render(<Comodidad ultimaFrase="¿Qué mundo quieres crear?" />);
        expect(screen.queryByText(/¿Qué mundo quieres crear\?/)).toBeNull();
    });
});

describe("Vineta (cascarón)", () => {
    it("pinta el anillo negro pegado a la cámara con la opacidad que le llega", () => {
        const parcial = render(<Vineta opacidad={0.85} />);
        const anillo = parcial.container.querySelector("mesh");
        expect(anillo).not.toBeNull();
        expect(anillo?.getAttribute("renderorder")).toBe("9999");
        const material = parcial.container.querySelector("meshbasicmaterial");
        expect(material).not.toBeNull();
        expect(material?.getAttribute("opacity")).toBe("0.85");
        expect(material?.getAttribute("color")).toBe("#000000");
        parcial.unmount();
        const sinOscurecer = render(<Vineta opacidad={0} />);
        expect(sinOscurecer.container.querySelector("meshbasicmaterial")?.getAttribute("opacity")).toBe("0");
    });
});
