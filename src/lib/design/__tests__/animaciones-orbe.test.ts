import { describe, it, expect } from "vitest";
import { movimientoDe, type RegistroMovimiento } from "@/lib/design/registros-movimiento";
import {
    DESTELLOS_MAX_POR_SEGUNDO,
    SIEMBRA_MS,
    cssKeyframesOrbe,
    presetOrbe,
    repeticionesDe,
    type EstadoOrbe,
} from "@/lib/design/animaciones-orbe";

const ESTADOS: EstadoOrbe[] = ["reposo", "escucha", "piensa", "habla", "siembra"];
const REGISTROS: RegistroMovimiento[] = ["sobrio", "expresivo", "experimental"];
const TODOS = ESTADOS.flatMap((estado) => REGISTROS.map((registro) => ({ estado, registro })));

function propiedadesCss(texto: string): string[] {
    return [...texto.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
}
describe("presetOrbe — límites de los cinco estados", () => {
    for (const { estado, registro } of TODOS) {
        it(`${estado} · ${registro} cabe en los límites del OS`, () => {
            const p = presetOrbe(estado, registro);
            const [sMin, sMax] = p.escala;
            const [bMin, bMax] = p.brillo;
            expect(sMin).toBeLessThanOrEqual(sMax);
            expect(sMin).toBeGreaterThanOrEqual(0);
            expect(sMax).toBeGreaterThanOrEqual(1);
            expect(sMax).toBeLessThanOrEqual(1.12);
            expect(bMin).toBeGreaterThanOrEqual(0);
            expect(bMin).toBeLessThanOrEqual(bMax);
            expect(bMax).toBeLessThanOrEqual(1);
            expect(p.giroGradosPorS).toBeGreaterThanOrEqual(0);
            expect(p.giroGradosPorS).toBeLessThanOrEqual(60);
            expect(Number.isInteger(p.ondas)).toBe(true);
            expect(p.ondas).toBeGreaterThanOrEqual(0);
            expect(p.ondas).toBeLessThanOrEqual(4);
            expect(1000 / p.periodoMs).toBeLessThanOrEqual(DESTELLOS_MAX_POR_SEGUNDO);
            if (estado === "siembra") {
                expect(p.periodoMs).toBe(SIEMBRA_MS);
            } else {
                expect(p.periodoMs).toBeGreaterThanOrEqual(1000);
                expect(p.periodoMs).toBeLessThanOrEqual(6000);
                expect(sMin).toBeLessThan(1);
                expect(sMax).toBeGreaterThan(1);
            }
        });
    }
    it("deriva periodo y amplitud de movimientoDe(registro, \"astraura\")", () => {
        const m = movimientoDe("expresivo", "astraura");
        expect(presetOrbe("escucha", "expresivo").periodoMs).toBe(m.respiracion.periodoMs);
        const sobrio = presetOrbe("escucha", "sobrio");
        const experimental = presetOrbe("escucha", "experimental");
        expect(experimental.escala[1]).toBeGreaterThan(sobrio.escala[1]);
        expect(experimental.giroGradosPorS).toBeGreaterThanOrEqual(sobrio.giroGradosPorS);
    });
    it("es determinista y ordena las ondas por intensidad", () => {
        expect(presetOrbe("piensa", "sobrio")).toEqual(presetOrbe("piensa", "sobrio"));
        expect(presetOrbe("reposo", "sobrio").ondas).toBe(0);
        expect(presetOrbe("habla", "sobrio").ondas).toBe(3);
    });
});
describe("presetOrbe — movimiento reducido", () => {
    for (const { estado, registro } of TODOS) {
        it(`${estado} · ${registro} queda quieto`, () => {
            const p = presetOrbe(estado, registro, true);
            expect(p.periodoMs).toBe(0);
            expect(p.escala).toEqual([1, 1]);
            expect(p.brillo[0]).toBe(p.brillo[1]);
            expect(p.giroGradosPorS).toBe(0);
            expect(p.ondas).toBe(0);
        });
    }
    it("su clave estática no anima escala ni giro", () => {
        const css = cssKeyframesOrbe(presetOrbe("habla", "expresivo", true));
        expect(css).toContain("@keyframes orbe-quieto");
        expect(css).toContain("scale(1)");
        expect(css).toContain("rotate(0deg)");
    });
});
describe("siembra — la firma de la marca", () => {
    it("dura 2.400 ms y se reproduce una sola vez", () => {
        expect(SIEMBRA_MS).toBe(2400);
        expect(presetOrbe("siembra", "sobrio").periodoMs).toBe(2400);
        expect(repeticionesDe("siembra")).toBe(1);
        for (const estado of ESTADOS.filter((e) => e !== "siembra")) {
            expect(repeticionesDe(estado)).toBe(Infinity);
        }
    });
    it("pinta punto → dos círculos → ojo en cuatro paradas", () => {
        const css = cssKeyframesOrbe(presetOrbe("siembra", "expresivo"));
        expect(css).toContain("@keyframes orbe-siembra");
        for (const parada of ["0%", "25%", "55%", "100%"]) expect(css).toContain(parada);
        for (const escala of ["scale(0)", "scale(0.12)", "scale(0.62)", "scale(1)"]) {
            expect(css).toContain(escala);
        }
        expect(css.match(/scale\(/g)).toHaveLength(4);
    });
});
describe("cssKeyframesOrbe — solo transform y opacity", () => {
    for (const estado of ESTADOS) {
        it(`${estado} no anima propiedades de layout`, () => {
            const css = cssKeyframesOrbe(presetOrbe(estado, "experimental"));
            expect(css.startsWith("@keyframes ")).toBe(true);
            for (const propiedad of propiedadesCss(css)) {
                expect(["transform", "opacity"]).toContain(propiedad);
            }
        });
    }
    it("usa los valores del preset en la respiración", () => {
        const p = presetOrbe("piensa", "sobrio");
        const css = cssKeyframesOrbe(p);
        expect(css).toContain("@keyframes orbe-respira");
        expect(css).toContain(`scale(${p.escala[0]})`);
        expect(css).toContain(`scale(${p.escala[1]})`);
        expect(css).toContain(`opacity: ${p.brillo[0]}`);
        expect(css).toContain(`opacity: ${p.brillo[1]}`);
    });
});
