import { describe, it, expect } from "vitest";
import {
    ESCENARIO_ORBE,
    ESTADOS_ORBE,
    escalaEscenario,
    transicionOrbe,
    type EstadoOrbe,
} from "../transitions";

const ESTADOS: EstadoOrbe[] = ["idle", "activo", "error"];

describe("escenario fijo del orbe binario", () => {
    it("es 16:9 y no se recoloca: 1920×1080 de unidades de diseño", () => {
        expect(ESCENARIO_ORBE.ancho).toBe(1920);
        expect(ESCENARIO_ORBE.alto).toBe(1080);
        expect(ESCENARIO_ORBE.ancho / ESCENARIO_ORBE.alto).toBeCloseTo(16 / 9, 5);
        expect(ESCENARIO_ORBE.aspecto).toBe("16:9");
    });

    it("escala el lienzo entero al visor y cabe con bandas (sin reflujo)", () => {
        expect(escalaEscenario({ ancho: 1920, alto: 1080 })).toBe(1);
        expect(escalaEscenario({ ancho: 3840, alto: 2160 })).toBe(2);
        expect(escalaEscenario({ ancho: 960, alto: 540 })).toBe(0.5);
        // Móvil vertical: manda el ancho, así que queda con bandas arriba y abajo.
        const movil = escalaEscenario({ ancho: 390, alto: 844 });
        expect(movil).toBeCloseTo(390 / 1920, 6);
        expect(movil * ESCENARIO_ORBE.alto).toBeLessThan(844);
    });

    it("nunca devuelve NaN ni un factor negativo con un visor degenerado", () => {
        expect(escalaEscenario({ ancho: 0, alto: 0 })).toBe(0);
        expect(escalaEscenario({ ancho: -1, alto: 844 })).toBe(0);
        expect(escalaEscenario({ ancho: Number.NaN, alto: 844 })).toBe(0);
    });
});

describe("estados del orbe binario", () => {
    it("idle → activo → error cambian opacidad y escala dentro de 0-1 y > 0", () => {
        for (const estado of ESTADOS) {
            const objetivo = ESTADOS_ORBE[estado];
            expect(objetivo.opacidad).toBeGreaterThan(0);
            expect(objetivo.opacidad).toBeLessThanOrEqual(1);
            expect(objetivo.escala).toBeGreaterThan(0);
        }
    });

    it("activo es el más opaco y error se encoge respecto a idle", () => {
        expect(ESTADOS_ORBE.activo.opacidad).toBe(1);
        expect(ESTADOS_ORBE.activo.escala).toBeGreaterThan(ESTADOS_ORBE.idle.escala);
        expect(ESTADOS_ORBE.error.escala).toBeLessThan(ESTADOS_ORBE.idle.escala);
        expect(ESTADOS_ORBE.error.opacidad).toBeLessThan(ESTADOS_ORBE.activo.opacidad);
    });

    it("cada estado usa tokens de movimiento ya existentes", () => {
        for (const estado of ESTADOS) {
            expect(ESTADOS_ORBE[estado].tokenDuracion).toMatch(/^--dur-(fast|base|slow)$/);
            expect(ESTADOS_ORBE[estado].tokenEasing).toMatch(/^--ease-(organic|glide|soft)$/);
            expect(ESTADOS_ORBE[estado].duracionSeg).toBeGreaterThan(0);
        }
    });
});

describe("transición de estado del orbe binario", () => {
    it("idle → activo solo anima opacidad y transform, jamás layout", () => {
        const plan = transicionOrbe("idle", "activo");
        expect(plan.desde).toBe("idle");
        expect(plan.hacia).toBe("activo");
        expect(plan.opacidad).toBe(ESTADOS_ORBE.activo.opacidad);
        expect(plan.escala).toBe(ESTADOS_ORBE.activo.escala);
        expect(plan.soloFundido).toBe(false);
        expect(plan.propiedades).toEqual(["opacity", "transform"]);
        for (const prohibida of ["width", "height", "top", "left", "margin", "padding"]) {
            expect(plan.propiedades as readonly string[]).not.toContain(prohibida);
        }
    });

    it("toma duración, curva y token del estado de destino", () => {
        expect(transicionOrbe("idle", "activo").tokenDuracion).toBe(ESTADOS_ORBE.activo.tokenDuracion);
        expect(transicionOrbe("idle", "activo").tokenEasing).toBe(ESTADOS_ORBE.activo.tokenEasing);
        expect(transicionOrbe("activo", "error").tokenDuracion).toBe(ESTADOS_ORBE.error.tokenDuracion);
        expect(transicionOrbe("error", "idle").duracionSeg).toBe(ESTADOS_ORBE.idle.duracionSeg);
    });

    it("identifica cada par de estados sin colisiones", () => {
        const ids = new Set<string>();
        for (const desde of ESTADOS) {
            for (const hacia of ESTADOS) {
                if (desde === hacia) continue;
                ids.add(transicionOrbe(desde, hacia).id);
            }
        }
        expect(ids.size).toBe(6);
    });

    it("con reducir-movimiento cae a solo fundido: sin escala y con un solo canal", () => {
        for (const desde of ESTADOS) {
            for (const hacia of ESTADOS) {
                const plan = transicionOrbe(desde, hacia, { reducirMovimiento: true });
                expect(plan.soloFundido).toBe(true);
                expect(plan.escala).toBe(1);
                expect(plan.propiedades).toEqual(["opacity"]);
                expect(plan.opacidad).toBe(ESTADOS_ORBE[hacia].opacidad);
                expect(plan.duracionSeg).toBeGreaterThan(0);
            }
        }
    });

    it("un cambio al mismo estado no anima", () => {
        const plan = transicionOrbe("activo", "activo");
        expect(plan.duracionSeg).toBe(0);
        expect(plan.soloFundido).toBe(false);
    });
});
