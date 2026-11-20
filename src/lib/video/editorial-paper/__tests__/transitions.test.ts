import { describe, it, expect } from "vitest";
import {
    ESCENARIO_ORBE,
    FUNDIDO_PLANO,
    escalaEscenario,
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

describe("orbe binario en escenario fijo", () => {
    it("el escenario reserva 16:9 y se escala al visor sin deformarse", () => {
        expect(ESCENARIO_ORBE.proporcion).toBe("16:9");
        expect(ESCENARIO_ORBE.ancho / ESCENARIO_ORBE.alto).toBeCloseTo(16 / 9, 6);
        // Encaja por el lado que sobra: nunca recorta ni estira.
        expect(escalaEscenario(1920, 1080)).toBe(120);
        expect(escalaEscenario(1280, 800)).toBe(80);
        expect(escalaEscenario(800, 1080)).toBe(50);
        // Un visor sin tamaño no inventa escala.
        expect(escalaEscenario(0, 1080)).toBe(0);
        expect(escalaEscenario(1920, -1)).toBe(0);
    });

    it("cada estado usa un token y solo cambia opacidad y escala", () => {
        const inactivo = transicionOrbe("inactivo", false);
        const activo = transicionOrbe("activo", false);
        const error = transicionOrbe("error", false);
        expect(inactivo.tinte).toBe(neutro.valor);
        expect(activo.tinte).toBe(zenith.valor);
        expect(error.tinte).toBe(anchor.valor);
        expect(activo.opacidad).toBe(1);
        expect(activo.escala).toBe(1);
        expect(inactivo.escala).toBeLessThan(1);
        expect(error.escala).toBeLessThan(1);
        for (const t of [inactivo, activo, error]) {
            expect(t.soloFundido).toBe(false);
            expect(t.duracion).toBeGreaterThan(0);
            expect(t.easing).toBeTruthy();
        }
        // Tres estados, tres identidades de transición distintas.
        expect(new Set([inactivo.id, activo.id, error.id]).size).toBe(3);
    });

    it("con prefers-reduced-motion deja solo el fundido, sin escala", () => {
        const estados: EstadoOrbe[] = ["inactivo", "activo", "error"];
        for (const estado of estados) {
            const conMovimiento = transicionOrbe(estado, false);
            const reducida = transicionOrbe(estado, true);
            expect(reducida.soloFundido).toBe(true);
            // La escala no se mueve: el orbe no crece ni encoge.
            expect(reducida.escala).toBe(1);
            // El tinte y la opacidad final se conservan: el estado se sigue leyendo.
            expect(reducida.tinte).toBe(conMovimiento.tinte);
            expect(reducida.opacidad).toBe(conMovimiento.opacidad);
            // El fundido es más corto y sin curva elástica.
            expect(reducida.duracion).toBeLessThan(conMovimiento.duracion);
            expect(reducida.id).toContain("fundido");
        }
    });
});
