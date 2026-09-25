import { describe, expect, it } from "vitest";
import { resolverNivelMovimiento } from "@/lib/movimiento/nivel";
import {
    entradaPagina,
    inclinacionPanel,
    resortePanel,
    transicionPaso,
    variantesPaso,
} from "@/lib/movimiento/transiciones";

describe("nivel de movimiento", () => {
    it("la preferencia de menos movimiento manda sobre todo", () => {
        expect(resolverNivelMovimiento({ prefiereReducido: true, a11yReducido: false, perf: "high" })).toBe("minimo");
        expect(resolverNivelMovimiento({ prefiereReducido: false, a11yReducido: true, perf: "high" })).toBe("minimo");
    });

    it("los equipos modestos reciben la versión suave", () => {
        expect(resolverNivelMovimiento({ prefiereReducido: false, a11yReducido: false, perf: "eco" })).toBe("suave");
        expect(resolverNivelMovimiento({ prefiereReducido: false, a11yReducido: false, perf: "mid" })).toBe("suave");
    });

    it("el resto, completo (también sin data-perf todavía)", () => {
        expect(resolverNivelMovimiento({ prefiereReducido: false, a11yReducido: false, perf: "high" })).toBe("completo");
        expect(resolverNivelMovimiento({ prefiereReducido: false, a11yReducido: false, perf: null })).toBe("completo");
    });
});

describe("preajustes de transición", () => {
    it("los paneles no animan en mínimo y solo inclinan en 3D en completo", () => {
        expect(resortePanel("minimo")).toBeNull();
        expect(resortePanel("completo")?.type).toBe("spring");
        expect(inclinacionPanel("completo")).toBeGreaterThan(0);
        expect(inclinacionPanel("suave")).toBe(0);
    });

    it("la entrada de página es corta y termina siempre visible y sin desplazamiento", () => {
        for (const nivel of ["completo", "suave", "minimo"] as const) {
            const e = entradaPagina(nivel);
            expect(e.duracion).toBeGreaterThanOrEqual(120);
            expect(e.duracion).toBeLessThanOrEqual(420);
            const ultimo = e.fotogramas[e.fotogramas.length - 1];
            expect(ultimo.opacity).toBe(1);
            if (ultimo.transform) expect(String(ultimo.transform)).toMatch(/translate3d\(0,? 0,? 0\)/);
        }
        expect(String(entradaPagina("completo").fotogramas[0].transform)).toContain("rotateX");
    });

    it("el modo seguro solo funde (no mueve piezas fixed)", () => {
        const e = entradaPagina("completo", true);
        expect(e.fotogramas.every((f) => f.transform === undefined)).toBe(true);
    });

    it("los pasos entran desde el lado hacia el que se avanza", () => {
        const v = variantesPaso("completo");
        expect(v.entrar(1).x).toBeGreaterThan(0);
        expect(v.entrar(-1).x).toBeLessThan(0);
        expect(v.salir(1).x).toBeLessThan(0);
        expect(v.centro).toMatchObject({ opacity: 1, x: 0, rotateY: 0 });
        expect(variantesPaso("minimo").entrar(1)).toEqual({ opacity: 0 });
        expect(transicionPaso("minimo")).toEqual({ duration: 0.14 });
    });
});
