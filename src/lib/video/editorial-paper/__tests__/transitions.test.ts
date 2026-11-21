import { describe, it, expect } from "vitest";
import { ESCENARIO_ORBE, ESTADOS_ORBE_VISUAL, FUNDIDO_PLANO, escalaEscenarioOrbe,
    transicionAnuncio, transicionEstadoOrbe, type EstadoOrbe, type TransicionAnuncio } from "../transitions";
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

describe("orbe binario · escenario fijo 16:9", () => {
    it("es un lienzo fijo 1920×1080 y se escala al visor sin recortar", () => {
        expect(ESCENARIO_ORBE.ancho).toBe(1920);
        expect(ESCENARIO_ORBE.alto).toBe(1080);
        expect(ESCENARIO_ORBE.proporcion).toBeCloseTo(16 / 9, 10);
        expect(escalaEscenarioOrbe(1920, 1080)).toBe(1);
        expect(escalaEscenarioOrbe(960, 540)).toBe(0.5);
        expect(escalaEscenarioOrbe(2560, 1080)).toBe(1);
        expect(escalaEscenarioOrbe(1080, 1920)).toBe(0.5625);
        expect(escalaEscenarioOrbe(0, 1080)).toBe(0);
        expect(escalaEscenarioOrbe(Number.NaN, 1080)).toBe(0);
    });
});

describe("transicionEstadoOrbe", () => {
    it("idle → activo: 150–300 ms, más opaco y con escala mayor", () => {
        const t = transicionEstadoOrbe("idle", "activo", false);
        expect([t.desde, t.hasta]).toEqual(["idle", "activo"]);
        expect(t.duracion).toBeGreaterThanOrEqual(0.15);
        expect(t.duracion).toBeLessThanOrEqual(0.3);
        expect(t.soloFundido).toBe(false);
        expect(t.hastaFotograma.opacidad).toBeGreaterThan(t.desdeFotograma.opacidad);
        expect(t.hastaFotograma.escala).toBeGreaterThan(t.desdeFotograma.escala);
        expect(t.token).toBe(zenith);
    });

    it("activo → error: baja la opacidad y encoge, sin tocar el layout", () => {
        const t = transicionEstadoOrbe("activo", "error", false);
        expect(t.hastaFotograma.opacidad).toBeLessThan(t.desdeFotograma.opacidad);
        expect(t.hastaFotograma.escala).toBeLessThan(t.desdeFotograma.escala);
        expect(t.token).toBe(anchor);
        expect(Object.keys(t.desdeFotograma).sort()).toEqual(["escala", "opacidad"]);
        expect(Object.keys(t.hastaFotograma).sort()).toEqual(["escala", "opacidad"]);
    });

    it("movimiento reducido: solo funde, sin cambiar la escala", () => {
        const t = transicionEstadoOrbe("idle", "activo", true);
        expect(t.soloFundido).toBe(true);
        expect(t.desdeFotograma.escala).toBe(t.hastaFotograma.escala);
        expect(t.desdeFotograma.opacidad).not.toBe(t.hastaFotograma.opacidad);
        expect(t.easing).toBe(FUNDIDO_PLANO.easing);
        expect(t.duracion).toBeLessThan(0.24);
        const iguales = transicionEstadoOrbe("error", "error", false);
        expect(iguales.duracion).toBe(0);
        expect(iguales.desdeFotograma).toEqual(iguales.hastaFotograma);
    });

    it("los tres estados toman su color de los tokens", () => {
        const estados: EstadoOrbe[] = ["idle", "activo", "error"];
        expect(estados.map((e) => ESTADOS_ORBE_VISUAL[e].token)).toEqual([neutro, zenith, anchor]);
        for (const e of estados) {
            const f = ESTADOS_ORBE_VISUAL[e].fotograma;
            expect(f.opacidad).toBeGreaterThan(0);
            expect(f.opacidad).toBeLessThanOrEqual(1);
            expect(f.escala).toBeGreaterThan(0);
        }
    });
});
