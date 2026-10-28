import { describe, it, expect } from "vitest";
import { presetOrbe, cssKeyframesOrbe } from "@/lib/design/animaciones-orbe";
import { movimientoDe } from "@/lib/design/registros-movimiento";
import { DURACION } from "@/lib/design/movimiento";

const ESTADOS = ["reposo", "escucha", "piensa", "habla", "siembra"] as const;
const REGISTROS = ["sobrio", "expresivo", "experimental"] as const;

const declaraciones = (t: string): string[] =>
    t.split(/[{}]/)
        .filter((b) => b.includes(";"))
        .flatMap((b) => b.split(";").map((d) => d.trim()).filter(Boolean));

describe("presetOrbe — límites en los 15 pares estado × registro", () => {
    it("todas las magnitudes dentro de su ventana", () => {
        for (const estado of ESTADOS) {
            for (const registro of REGISTROS) {
                const p = presetOrbe(estado, registro);
                expect(p.escala[0]).toBeGreaterThanOrEqual(0);
                expect(p.escala[1]).toBeLessThanOrEqual(1.05);
                expect(p.escala[0]).toBeLessThan(p.escala[1]);
                expect(p.periodoMs).toBeGreaterThanOrEqual(2400);
                expect(p.periodoMs).toBeLessThanOrEqual(6000);
                expect(p.brillo[0]).toBeGreaterThanOrEqual(0);
                expect(p.brillo[1]).toBeLessThanOrEqual(1);
                expect(p.brillo[0]).toBeLessThan(p.brillo[1]);
                expect(p.giroGradosPorS).toBeLessThanOrEqual(100);
                expect(p.ondas).toBeLessThanOrEqual(3);
                expect((p.ondas * 1000) / p.periodoMs).toBeLessThanOrEqual(3);
                expect(presetOrbe(estado, registro)).toEqual(p);
            }
        }
    });

    it("reposo hereda la respiración del registro en Astraura", () => {
        for (const registro of REGISTROS) {
            const m = movimientoDe(registro, "astraura");
            const p = presetOrbe("reposo", registro);
            expect(p.escala[0]).toBe(1);
            expect(p.escala[1]).toBe(m.respiracion.escala);
            expect(p.periodoMs).toBe(m.respiracion.periodoMs);
        }
    });

    it("escucha respira más rápido y más ancho que reposo, con dos ondas", () => {
        for (const registro of REGISTROS) {
            const reposo = presetOrbe("reposo", registro);
            const escucha = presetOrbe("escucha", registro);
            expect(escucha.periodoMs).toBeLessThan(reposo.periodoMs);
            expect(escucha.escala[1]).toBeGreaterThan(reposo.escala[1]);
            expect(escucha.ondas).toBe(2);
        }
    });
});

describe("la siembra — la firma de la marca", () => {
    it("es común a todos los registros, corre UNA vez; los demás son cíclicos", () => {
        const base = presetOrbe("siembra", "sobrio");
        for (const registro of REGISTROS) {
            expect(presetOrbe("siembra", registro)).toEqual(base);
        }
        for (const estado of ["reposo", "escucha", "piensa", "habla"] as const) {
            expect(presetOrbe(estado).unico).toBeUndefined();
        }
        expect(base.unico).toBe(true);
    });

    it("dura cinco actos a ritmo de escena (2.400 ms), sin giro y con dos círculos", () => {
        const p = presetOrbe("siembra");
        expect(p.periodoMs).toBe(DURACION.escena * 5);
        expect(p.giroGradosPorS).toBe(0);
        expect(p.ondas).toBe(2);
    });
});

describe("cssKeyframesOrbe", () => {
    it("solo anima transform y opacity, con el nombre pedido", () => {
        for (const estado of ESTADOS) {
            const texto = cssKeyframesOrbe(presetOrbe(estado, "expresivo"), "orbe-ast");
            expect(texto.startsWith("@keyframes orbe-ast")).toBe(true);
            const decls = declaraciones(texto);
            expect(decls.length).toBeGreaterThan(0);
            for (const d of decls) {
                expect(d.startsWith("transform:") || d.startsWith("opacity:")).toBe(true);
            }
        }
    });

    it("la respiración sube a mitad del ciclo y el giro avanza sin parar", () => {
        const p = presetOrbe("reposo", "expresivo");
        const texto = cssKeyframesOrbe(p);
        expect(texto).toContain("50%");
        expect(texto).toContain("rotate(");
        const decls = declaraciones(texto);
        expect(decls.length).toBe(6);
        expect(decls[3]).toContain("opacity: 0.9");
    });

    it("con movimiento reducido el estado final queda quieto e igual en ambos extremos", () => {
        const texto = cssKeyframesOrbe(presetOrbe("habla", "experimental"), "orbe-h", true);
        expect(texto).toContain("@keyframes orbe-h-reducido");
        const decls = declaraciones(texto);
        expect(decls.length).toBe(2);
        expect(decls[0]).toContain("scale(1)");
        expect(decls[0]).not.toContain("rotate");
        expect(decls[1]).toContain("opacity: 1");
    });

    it("la siembra: del punto al ojo abierto en la sección áurea, y queda", () => {
        const texto = cssKeyframesOrbe(presetOrbe("siembra"));
        expect(texto).toContain("@keyframes orbe-siembra");
        expect(texto).toContain("61.8%");
        const decls = declaraciones(texto);
        expect(decls[0]).toContain("scale(0)");
        expect(decls[decls.length - 2]).toContain("scale(1)");
        expect(decls[decls.length - 2]).not.toContain("rotate");
        expect(decls[decls.length - 1]).toContain("opacity: 1");
        expect(decls.length).toBe(12);
    });
});
