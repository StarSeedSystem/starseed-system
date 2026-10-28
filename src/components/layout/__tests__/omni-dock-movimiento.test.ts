import { describe, it, expect } from "vitest";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import { estiloIcono, REGISTRO_DOCK, type FaseIconoDock, type RegistroIconoDock } from "../omni-dock-movimiento";

const fases: FaseIconoDock[] = ["reposo", "hover", "pulsado", "lanzando"];

const registroDe = (registro: RegistroIconoDock["registro"], reducido = false): RegistroIconoDock => ({
    registro,
    reducido,
});

describe("estiloIcono — micro-interacciones del OmniDock", () => {
    it("hover sube 4 px y escala 1,08 con la entrada del registro", () => {
        const h = estiloIcono("hover", registroDe("sobrio"));
        expect(h.transform).toBe("translateY(-4px) scale(1.08)");
        expect(h.transition).toBe(`${DURACION.normal}ms ${CURVA.suave}`);
    });

    it("pulsado encoge a 0,96 con la pulsación mínima del OS (tokensDe «press»)", () => {
        const p = estiloIcono("pulsado", registroDe("expresivo"));
        expect(p.transform).toBe("scale(0.96)");
        expect(p.transition).toBe(`${DURACION.instantaneo}ms ${CURVA.entrada}`);
    });

    it("lanzando es un rebote único y corto: curva elástica, duración mínima y volver a 1", () => {
        const l = estiloIcono("lanzando", registroDe("sobrio"));
        expect(l.transform).toBe("none");
        expect(l.transition).toBe(`${DURACION.instantaneo}ms ${CURVA.elastico}`);
    });

    it("reposo vuelve con la salida del registro, más corta que su entrada", () => {
        const r = estiloIcono("reposo", registroDe("expresivo"));
        expect(r.transform).toBe("none");
        expect(r.transition).toBe(`${DURACION.normal}ms ${CURVA.salida}`);
    });

    it("con movimiento reducido ninguna fase se mueve: estado final sin transform", () => {
        for (const fase of fases) {
            const e = estiloIcono(fase, registroDe("experimental", true));
            expect(e.transform).toBe("none");
            expect(e.transition).toBe("none");
        }
    });

    it("solo se animan transform y opacity: transition nunca toca otra propiedad", () => {
        for (const fase of fases) {
            for (const registro of ["sobrio", "expresivo", "experimental"] as const) {
                const e = estiloIcono(fase, registroDe(registro));
                expect(e.transition).toMatch(/^\d+ms cubic-bezier\([^)]+\)$/);
                // Solo transform: translate, scale y none; nada de width/box-shadow.
                expect(e.transform).toMatch(/^(none|translateY\(-?[\d.]+px\)( scale\([\d.]+\))?|scale\([\d.]+\))$/);
            }
        }
    });

    it("es determinista y la identidad de gesto cambia con el registro", () => {
        expect(estiloIcono("hover", registroDe(REGISTRO_DOCK))).toEqual(estiloIcono("hover", registroDe("sobrio")));
        expect(estiloIcono("hover", registroDe("experimental")).transition).not.toBe(
            estiloIcono("hover", registroDe("sobrio")).transition,
        );
    });

    it("el registro manda el carácter y el dock usa Trinity: dos registros, dos entradas válidas", () => {
        expect(estiloIcono("hover", registroDe("expresivo")).transition).toBe(
            `${DURACION.pausado}ms ${CURVA.entrada}`,
        );
        expect(estiloIcono("reposo", registroDe("experimental")).transition).toBe(
            `${DURACION.pausado}ms ${CURVA.salida}`,
        );
        // La salida sigue siendo SIEMPRE más corta que la entrada (regla del ADN).
        for (const registro of ["sobrio", "expresivo", "experimental"] as const) {
            const msDe = (t: string) => Number(t.split("ms")[0]);
            expect(msDe(estiloIcono("hover", registroDe(registro)).transition)).toBeGreaterThan(
                msDe(estiloIcono("reposo", registroDe(registro)).transition),
            );
        }
    });
});
