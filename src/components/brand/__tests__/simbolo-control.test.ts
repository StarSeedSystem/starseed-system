// ESC1110B — El control une mirada, parpadeo y flor; con movimiento reducido no sigue ni parpadea.
import { describe, expect, it } from "vitest";
import { SIMBOLO_OFICIAL, validarArchivoSimbolo } from "../simbolo-archivo";
import { crearControlSimbolo, opcionesFlorDeArchivo } from "../simbolo-control";
import { PASO_REPOSO, enReposo } from "../simbolo-flor";
import { PARPADEO } from "../simbolo-ojo";

function correr(c: ReturnType<typeof crearControlSimbolo>, desde: number, ms: number) {
    let ultimo = c.paso(0, desde, 0);
    for (let t = desde + 16; t <= desde + ms; t += 16) ultimo = c.paso(0.016, t, t / 1000);
    return ultimo;
}

describe("control del símbolo", () => {
    it("vivo: mira al puntero, parpadea al clic y se mueve", () => {
        const c = crearControlSimbolo(SIMBOLO_OFICIAL, { ahoraMs: 0, azar: () => 0.99 });
        c.mirar(-400, -400, 200, 0);
        const f = correr(c, 0, 500);
        expect(f.mirada.x).toBeLessThan(-0.4);
        expect(f.mirada.y).toBeGreaterThan(0.4);
        c.parpadear(1000);
        expect(c.paso(0.016, 1000 + PARPADEO.cierreMs, 1).cierre).toBeGreaterThan(0.9);
        expect(c.paso(0.016, 1000 + PARPADEO.cierreMs + PARPADEO.aperturaMs + 10, 1).cierre).toBe(0);
        expect(c.enMovimiento()).toBe(true);
    });

    it("tras 2,5 s sin entrada la mirada vuelve al frente", () => {
        const c = crearControlSimbolo(SIMBOLO_OFICIAL, { ahoraMs: 0 });
        c.mirar(400, 0, 200, 0);
        correr(c, 0, 400);
        const f = correr(c, 3000, 1200);
        expect(Math.abs(f.mirada.x)).toBeLessThan(0.01);
    });

    it("movimiento reducido: sin seguir, sin parpadeo, sin giro solo; teclado salta exacto", () => {
        const c = crearControlSimbolo(SIMBOLO_OFICIAL, { reducido: true, ahoraMs: 0 });
        c.mirar(400, 400, 200, 0);
        c.parpadear(10);
        const f = correr(c, 0, 2000);
        expect(f.mirada).toEqual({ x: 0, y: 0 });
        expect(f.cierre).toBe(0);
        expect(f.quieto).toBe(true);
        expect(f.anguloFlor).toBe(0);
        expect(c.enMovimiento()).toBe(false);
        c.teclado(1);
        expect(c.flor().angulo).toBeCloseTo(PASO_REPOSO, 12);
        expect(c.enMovimiento()).toBe(false);
        expect(opcionesFlorDeArchivo(SIMBOLO_OFICIAL, true).auto).toBe(false);
    });

    it("arrastrar y soltar asienta la flor en un reposo exacto", () => {
        const c = crearControlSimbolo(SIMBOLO_OFICIAL, { ahoraMs: 0 });
        c.arrastrar(0.3, 0.1);
        c.soltar();
        correr(c, 0, 5000);
        expect(enReposo(c.flor().angulo, 1e-9)).toBe(true);
    });

    it("el archivo manda: sin seguir el cursor ni parpadeo ni flor", () => {
        const a = validarArchivoSimbolo({ ...SIMBOLO_OFICIAL, comportamientos: { ...SIMBOLO_OFICIAL.comportamientos, seguirCursor: false, parpadeo: false, rotacionFlor: false } }).archivo;
        const c = crearControlSimbolo(a, { ahoraMs: 0 });
        c.mirar(400, 0, 200, 0);
        c.parpadear(0);
        const f = correr(c, 0, 1000);
        expect(f.mirada.x).toBe(0);
        expect(f.cierre).toBe(0);
        expect(f.anguloFlor).toBe(0);
        expect(opcionesFlorDeArchivo(a, false).auto).toBe(false);
    });
});
