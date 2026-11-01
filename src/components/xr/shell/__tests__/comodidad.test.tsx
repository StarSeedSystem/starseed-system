/**
 * XR1010AF · comodidad aplicada (contrato §3 j y l), jsdom con el lienzo 3D simulado: la viñeta sube
 * con la velocidad y jamás pasa de 0,85 («nunca» es 0 salvo movimiento reducido), ocho saltos de 45°
 * dan la vuelta, la locomoción reducida manda y se avisa una vez, los subtítulos aparecen y callan
 * con la preferencia, y la postura de una mano agrupa en pestañas. Prohibido `vi.mock` de `node:*`.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { aRadianes } from "@/lib/xr/tipos";
import { CONFORT_DEFECTO, altoMinimoTexto } from "@/lib/xr/confort";
import type { PreferenciasConfort } from "@/lib/xr/confort";

const h = vi.hoisted(() => ({
    confort: null as unknown as PreferenciasConfort,
    avisos: [] as string[],
    estado: { camera: null as unknown },
    contadores: [] as Array<(estado: { clock: { elapsedTime: number } }) => void>,
    limpiar: () => {
        h.contadores = [];
    },
}));

vi.mock("../use-prefs-xr", () => ({
    usePrefsXR: () => ({ confort: h.confort, avisos: h.avisos }),
}));

vi.mock("@react-three/fiber", () => ({
    useFrame: (cb: (estado: { clock: { elapsedTime: number } }) => void) => {
        h.contadores.push(cb);
    },
    useThree: (seleccion: (estado: { camera: unknown }) => unknown) => seleccion(h.estado),
}));

vi.mock("@react-three/drei", () => ({
    Text: ({ children }: { children: React.ReactNode }) => <span data-testid="texto-3d">{children}</span>,
}));

import {
    agrupaPestanas,
    aplicarGiro,
    avisoReducidoUnaVez,
    Comodidad,
    locomocionEfectiva,
    opacidadComodidad,
    velocidadCabeza,
    emitirGiro,
    altoSubtitulo,
    type MuestraCabeza,
} from "../comodidad";
import { poseVineta, geometriaVineta, opacidadAcotada } from "../vineta";

const m = (cambios: Partial<PreferenciasConfort> = {}): PreferenciasConfort => ({ ...CONFORT_DEFECTO, ...cambios });
const muestra = (x = 0, z = 0, yaw = 0): MuestraCabeza => ({ x, y: 1.6, z, yaw });

beforeEach(() => {
    h.confort = { ...CONFORT_DEFECTO };
    h.avisos = [];
    h.limpiar();
    h.estado = {
        camera: { position: { x: 0, y: 1.6, z: 0 }, rotation: { y: 0 } },
    };
});
afterEach(cleanup);

describe("velocidadCabeza", () => {
    it("Parado es 0 m/s y 0 °/s", () => {
        expect(velocidadCabeza(muestra(), muestra(), 0.1)).toEqual({ lineal: 0, angularGradosS: 0 });
        expect(velocidadCabeza(null, muestra(), 0.1)).toEqual({ lineal: 0, angularGradosS: 0 });
        expect(velocidadCabeza(muestra(), muestra(1), 0)).toEqual({ lineal: 0, angularGradosS: 0 });
    });

    it("Camina 0,6 m en 1 s y gira 90° en 1 s", () => {
        expect(velocidadCabeza(muestra(), muestra(0.6), 1).lineal).toBeCloseTo(0.6, 6);
        expect(velocidadCabeza(muestra(0, 0, 0), muestra(0, 0, aRadianes(90)), 1).angularGradosS).toBeCloseTo(90, 6);
    });

    it("Un yaw no leído aún (inválido) no desata angular, pero sí cuenta el desplazamiento", () => {
        const rota = velocidadCabeza(muestra(), { ...muestra(0.6), yaw: Number.NaN }, 1);
        expect(rota.lineal).toBeCloseTo(0.6, 6);
        expect(rota.angularGradosS).toBe(0);
    });
});

describe("opacidadComodidad", () => {
    it("Sube con la velocidad", () => {
        const seguro = m({ fuerzaVineta: 1 });
        const antes = opacidadComodidad(seguro, { lineal: 0, angularGradosS: 0 });
        const giroMedio = opacidadComodidad(seguro, { lineal: 0, angularGradosS: 60 });
        const giroFuerte = opacidadComodidad(seguro, { lineal: 0, angularGradosS: 300 });
        expect(giroMedio).toBeGreaterThan(antes);
        expect(giroFuerte).toBeGreaterThan(giroMedio);
        const camina = opacidadComodidad(seguro, { lineal: 3, angularGradosS: 0 });
        expect(camina).toBeGreaterThan(antes);
    });

    it("Al girar brutalmente llega al tope 0,85 y no lo pasa nunca (ni con opacidad rota)", () => {
        const seguro = m({ fuerzaVineta: 1 });
        expect(opacidadComodidad(seguro, { lineal: 10, angularGradosS: 500 })).toBe(0.85);
        expect(opacidadAcotada(1.2)).toBe(0.85);
        expect(opacidadAcotada(Number.NaN)).toBe(0);
    });

    it("Con «nunca» es 0; con «nunca» Y movimiento reducido tienen que subir (el reducido manda)", () => {
        const nunca = m({ vineta: "nunca" });
        expect(opacidadComodidad(nunca, { lineal: 5, angularGradosS: 300 })).toBe(0);
        const reducido = m({ vineta: "nunca", movimientoReducido: true });
        expect(opacidadComodidad(reducido, { lineal: 0, angularGradosS: 0 })).toBeGreaterThanOrEqual(0.25);
    });
});

describe("giro por saltos y locomoción", () => {
    it("Ocho saltos de 45° dan la vuelta completa (≡ 0 mod 2π) y cada paso mide 45°", () => {
        const c = m({ anguloSalto: 45 });
        let yaw = 0;
        for (let i = 0; i < 8; i += 1) {
            const sig = aplicarGiro(yaw, 1, c);
            expect(sig - yaw).toBeCloseTo(aRadianes(45), 6);
            yaw = sig;
        }
        expect(Math.atan2(Math.sin(yaw), Math.cos(yaw))).toBeCloseTo(0, 6);
    });

    it("La locomoción por defecto es teletransporte; continua + reducido manda el reducido", () => {
        expect(locomocionEfectiva(m())).toBe("teletransporte");
        expect(locomocionEfectiva(m({ locomocion: "continua" }))).toBe("continua");
        expect(locomocionEfectiva(m({ locomocion: "continua", movimientoReducido: true }))).toBe("teletransporte");
    });

    it("El giro por saltos se impone con movimiento reducido (nada de giros continuos)", () => {
        const c = m({ giro: "continuo", movimientoReducido: true });
        expect(c.giro).toBe("continuo");
        expect(locomocionEfectiva(c)).toBe("teletransporte");
        // esta es la regla que aplica el componente (aplicarMovimientoReducido):
        expect(aplicarGiro(0, 1, c)).toBeCloseTo(aRadianes(30), 6);
    });

    it("El aviso de locomoción reducida se dice UNA vez (o no se dice)", () => {
        const aviso = "El movimiento reducido está activo: el giro es por saltos y no se camina de forma continua.";
        expect(avisoReducidoUnaVez([])).toBeNull();
        expect(avisoReducidoUnaVez(["«giro» tenía un valor no válido y se corrigió."])).toBeNull();
        expect(avisoReducidoUnaVez([aviso, aviso, aviso])).toBe(aviso);
    });
});

describe("una mano y subtítulos", () => {
    it("La postura de una mano agrupa Horizon y Logic en pestañas; de pie y sentado no", () => {
        expect(agrupaPestanas(m({ postura: "una-mano" }))).toBe(true);
        expect(agrupaPestanas(m({ postura: "de-pie" }))).toBe(false);
        expect(agrupaPestanas(m({ postura: "sentado" }))).toBe(false);
    });

    it("La línea de subtítulo a 1,5 m queda nunca por debajo de 1° y crece con la preferencia", () => {
        expect(altoSubtitulo(m({ textoMinGrados: 0.8 }))).toBeCloseTo(altoMinimoTexto(1.5, 1), 9);
        expect(altoSubtitulo(m({ textoMinGrados: 2 }))).toBeGreaterThan(altoMinimoTexto(1.5, 1));
    });
});

describe("geometría y colocación de la viñeta", () => {
    it("A opacidad 0 el anillo es invisible y a 0,85 casi cierra al centro", () => {
        expect(geometriaVineta(0)).toEqual({ interior: 0.1, exterior: 0.1 });
        const cerrada = geometriaVineta(0.85);
        expect(cerrada.exterior).toBe(0.1);
        expect(cerrada.interior).toBeGreaterThan(0);
        expect(cerrada.interior).toBeLessThan(0.05);
        expect(opacidadAcotada(0.85)).toBe(0.85);
    });

    it("La malla va a 0,1 m delante de la mirada, girada con ella", () => {
        const miradaFija = poseVineta({ position: { x: 0, y: 1.6, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } });
        expect(miradaFija).toEqual([0, 1.6, -0.1]);
        const mediaVueltaAAla = poseVineta({
            position: { x: 0, y: 1.6, z: 0 },
            quaternion: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        });
        expect(mediaVueltaAAla[0]).toBeCloseTo(-0.1, 6);
        expect(Math.hypot(mediaVueltaAAla[2], mediaVueltaAAla[1] - 1.6)).toBeCloseTo(0, 6);
    });
});

describe("<Comodidad>", () => {
    it("Los subtítulos se muestran con Astraura y la transmisión, y se ocultan con la preferencia", () => {
        const { unmount } = render(<Comodidad fraseAstraura="Hola, ¿qué quieres crear?" transmision="Bienvenido a la sala" />);
        expect(screen.getByTestId("subtitulo-astraura").textContent).toContain("Hola, ¿qué quieres crear?");
        expect(screen.getByTestId("subtitulo-transmision").textContent).toContain("Bienvenido a la sala");
        unmount();
        h.confort = m({ subtitulos: false });
        render(<Comodidad fraseAstraura="Hola" />);
        expect(screen.queryByTestId("subtitulo-astraura")).toBeNull();
    });

    it("No pinta texto vacío: sin nada que decir no hay subtítulo", () => {
        render(<Comodidad />);
        expect(screen.queryByTestId("texto-3d")).toBeNull();
    });

    it("El evento de giro mueve el rig: ocho pulsaciones a 45° redon a la vuelta completa", () => {
        h.confort = m({ anguloSalto: 45 });
        const rig = { rotation: { y: 0 } };
        h.estado = { camera: { position: { x: 0, y: 1.6, z: 0 }, rotation: { y: 0 }, parent: rig } };
        render(<Comodidad />);
        for (let i = 0; i < 8; i += 1) act(() => emitirGiro(1));
        expect(rig.rotation.y).toBeCloseTo(Math.PI * 2, 5);
    });

    it("La viñeta se pinta en la escena y los fotogramas la alimentan sin romper nada", () => {
        render(<Comodidad fraseAstraura="Creo la sala" />);
        expect(screen.getByTestId("vineta")).toBeTruthy();
        expect(h.contadores).toHaveLength(2);
        act(() => h.contadores[0]({ clock: { elapsedTime: 0 } }));
        (h.estado.camera as { position: { x: number } }).position.x = 0.6;
        act(() => h.contadores[0]({ clock: { elapsedTime: 1 } }));
        expect(screen.getByTestId("vineta")).toBeTruthy();
    });
});
