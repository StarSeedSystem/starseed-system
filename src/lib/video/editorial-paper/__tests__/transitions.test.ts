import { describe, it, expect } from "vitest";
import {
    ESCENARIO_ORBE,
    FUNDIDO_PLANO,
    escalarEscenario,
    transicionAnuncio,
    transicionOrbe,
    type EstadoOrbe,
    type TransicionAnuncio,
} from "../transitions";
import { anchor, gradienteAcento, horizonte, logica, neutro, zenith, type TokenColor } from "../tokens";

describe("transicionAnuncio", () => {
    it("con la bandera activa: duración 0,8 s y dos tintas", () => {
        const transicion: TransicionAnuncio = transicionAnuncio(true);
        expect(transicion.duracion).toBe(0.8);
        expect(transicion.tintas).toHaveLength(2);
        expect(transicion.tintas.map((t) => t.hex)).toEqual([zenith.valor, horizonte.valor]);
        // Grano de dos tintas, una por tinta impresa.
        expect(transicion.grano).toHaveLength(2);
        expect(transicion.grano.map((g) => g.hex)).toEqual([zenith.valor, horizonte.valor]);
    });

    it("el desplazamiento es off-register y no se anula en el centro", () => {
        const transicion = transicionAnuncio(true);
        const desplazamientos = transicion.tintas.map((t) => t.desplazamiento);
        for (const d of desplazamientos) {
            expect(d.x).not.toBe(0);
            expect(d.y).not.toBe(0);
            // El eje horizontal y el vertical no se anulan entre sí: la tinta no cruza el centro.
            expect(d.x + d.y).not.toBe(0);
        }
        // Registro desalineado: las dos tintas no comparten desplazamiento.
        expect(desplazamientos[0]).not.toEqual(desplazamientos[1]);
    });

    it("con la bandera inactiva devuelve la transición anterior sin cambios", () => {
        const anterior = transicionAnuncio(false);
        expect(anterior).toEqual(FUNDIDO_PLANO);
        expect(anterior.tintas).toHaveLength(1);
        expect(anterior.tintas[0].desplazamiento).toEqual({ x: 0, y: 0 });
        expect(anterior.grano).toHaveLength(0);
        expect(anterior.duracion).toBe(0.4);
        expect(anterior.id).not.toBe(transicionAnuncio(true).id);
    });
});

describe("orbe binario en escenario fijo 16:9", () => {
    it("el escenario es 16:9 y se escala uniforme al visor sin deformar", () => {
        expect(ESCENARIO_ORBE.aspecto).toBe("16:9");
        expect(ESCENARIO_ORBE.ancho / ESCENARIO_ORBE.alto).toBeCloseTo(16 / 9, 5);
        // Visor más alto que ancho: manda el ancho y sobran franjas arriba y abajo.
        const escala = escalarEscenario(640, 1000);
        expect(escala.ancho).toBeCloseTo(640, 5);
        expect(escala.alto).toBeCloseTo(360, 5);
        expect(escala.ancho / escala.alto).toBeCloseTo(16 / 9, 5);
        expect(escala.escala).toBeCloseTo(0.5, 5);
    });

    it("un visor sin tamaño o negativo no produce NaN ni escala fantasma", () => {
        for (const [ancho, alto] of [[0, 500], [500, 0], [-10, 20]]) {
            const escala = escalarEscenario(ancho, alto);
            expect(escala.escala).toBe(0);
            expect(escala.ancho).toBe(0);
            expect(escala.alto).toBe(0);
        }
    });

    it("idle → activo → error cambia opacidad y escala, nunca tamaño de layout", () => {
        const estados: EstadoOrbe[] = ["idle", "activo", "error"];
        const visuales = estados.map((estado) => transicionOrbe(estado, false));
        expect(visuales.map((v) => v.estado)).toEqual(estados);
        expect(new Set(visuales.map((v) => v.opacidad)).size).toBe(3);
        expect(new Set(visuales.map((v) => v.escala)).size).toBe(3);
        for (const visual of visuales) {
            expect(visual.soloFundido).toBe(false);
            expect(visual.opacidad).toBeGreaterThan(0);
            expect(visual.opacidad).toBeLessThanOrEqual(1);
            expect(visual.escala).toBeGreaterThan(0);
            expect(visual.duracionMs).toBe(FUNDIDO_PLANO.duracion * 1000);
            expect(visual.easing).toBe(FUNDIDO_PLANO.easing);
        }
    });

    it("con prefers-reduced-motion solo queda el fundido: escala 1 y sin rebote", () => {
        for (const estado of ["idle", "activo", "error"] as EstadoOrbe[]) {
            const normal = transicionOrbe(estado, false);
            const reducida = transicionOrbe(estado, true);
            expect(reducida.soloFundido).toBe(true);
            expect(reducida.escala).toBe(1);
            // El estado se sigue distinguiendo por opacidad, no por movimiento.
            expect(reducida.opacidad).toBe(normal.opacidad);
            expect(reducida.easing).toBe("linear");
            expect(reducida.duracionMs).toBeLessThan(normal.duracionMs);
        }
    });

    it("cada estado usa una tinta Trinity del sistema y su variable CSS", () => {
        expect(transicionOrbe("idle", false).tinta.hex).toBe(horizonte.valor);
        expect(transicionOrbe("activo", false).tinta.hex).toBe(zenith.valor);
        expect(transicionOrbe("error", false).tinta.hex).toBe(anchor.valor);
        expect(transicionOrbe("idle", false).tinta.variable).toBe("--trinity-emerald");
        expect(transicionOrbe("activo", false).tinta.variable).toBe("--trinity-azure");
        expect(transicionOrbe("error", false).tinta.variable).toBe("--trinity-crimson");
    });
});

describe("tokens editorial-papel", () => {
    it("traen los cuatro colores Trinity y el neutro con cobertura", () => {
        expect(zenith.valor).toBe("#007FFF");
        expect(horizonte.valor).toBe("#10B981");
        expect(logica.valor).toBe("#FFBF00");
        expect(anchor.valor).toBe("#DC143C");
        expect(neutro.valor).toBe("#FFFFFF");
        const trinity: TokenColor[] = [zenith, horizonte, logica, anchor, neutro];
        for (const token of trinity) {
            expect(token.cobertura).toBeGreaterThan(0);
            expect(token.cobertura).toBeLessThanOrEqual(1);
        }
    });

    it("declaran el gradiente radial de acento al 15 %", () => {
        expect(gradienteAcento.tipo).toBe("radial");
        expect(gradienteAcento.cobertura).toBe(0.15);
        expect(gradienteAcento.paradas[0].color).toBe(zenith.valor);
        expect(gradienteAcento.paradas[1].color).toBe(neutro.valor);
    });
});
