import { describe, it, expect } from "vitest";
import { FUNDIDO_PLANO, transicionAnuncio, type TransicionAnuncio } from "../transitions";
import { type EstadoOrbe, type TransicionOrbe, transicionOrbe, transicionOrbeReducida } from "../transitions";
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

    describe("transicionOrbe", () => {
        it("define los tres estados del orbe binario", () => {
            const estados: EstadoOrbe[] = ["idle", "activo", "error"];
            for (const estado of estados) {
                const t = transicionOrbe(estado, false);
                expect(t.estado).toBe(estado);
                expect(t.duracion).toBeGreaterThan(0);
                expect(typeof t.opacidad).toBe("number");
                expect(typeof t.escala).toBe("number");
                expect(t.easing).toBeTruthy();
            }
        });

        it("idle: opacidad 1, escala 1, duracion 0.6s", () => {
            const t = transicionOrbe("idle", false);
            expect(t.opacidad).toBe(1);
            expect(t.escala).toBe(1);
            expect(t.duracion).toBe(0.6);
        });

        it("activo: opacidad 1, escala 1.08, duracion 0.5s", () => {
            const t = transicionOrbe("activo", false);
            expect(t.opacidad).toBe(1);
            expect(t.escala).toBe(1.08);
            expect(t.duracion).toBe(0.5);
        });

        it("error: opacidad 0.6, escala 0.92, duracion 0.4s", () => {
            const t = transicionOrbe("error", false);
            expect(t.opacidad).toBe(0.6);
            expect(t.escala).toBe(0.92);
            expect(t.duracion).toBe(0.4);
        });

        it("con reduced-motion: solo fade (escala 1), duracion 0.2s", () => {
            const t = transicionOrbe("activo", true);
            expect(t.escala).toBe(1);
            expect(t.duracion).toBe(0.2);
            expect(t.opacidad).toBeLessThanOrEqual(1);
            expect(t.opacidad).toBeGreaterThan(0);
        });
    });

    describe("transicionOrbeReducida", () => {
        it("siempre devuelve fade sin escala (prefers-reduced-motion)", () => {
            const t = transicionOrbeReducida("activo");
            expect(t.escala).toBe(1);
            expect(t.duracion).toBe(0.2);
            expect(t.opacidad).toBeLessThanOrEqual(1);
            expect(t.opacidad).toBeGreaterThan(0);
            expect(t.easing).toBe("cubic-bezier(0.2, 0.9, 0.25, 1)");
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
