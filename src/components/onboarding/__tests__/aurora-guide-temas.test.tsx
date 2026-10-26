import { describe, it, expect, vi } from "vitest";
import { STEPS } from "../aurora-guide";
import { TODOS_LOS_TEMAS } from "@/lib/onboarding/guia-temas-red";
import { ACENTOS_TRINITY } from "@/lib/onboarding/guia-completa";

const claves = STEPS.map((p) => p.key);
const pasoDe = (key: string) => STEPS.find((p) => p.key === key);

/** Recorre el «Ir» de un paso con un router de mentira y devuelve la ruta pedida. */
function rutaDe(paso: (typeof STEPS)[number]): unknown {
    const router = { push: vi.fn() };
    paso.go?.run({ router: router as never, setActiveEdge: () => {} });
    return router.push.mock.calls[0]?.[0];
}

describe("aurora-guide · los diez temas del tour (Ola 1021G)", () => {
    it("el tour incluye los diez temas, una vez cada uno y en el orden de TODOS_LOS_TEMAS", () => {
        const posiciones = TODOS_LOS_TEMAS.map((t) => claves.indexOf(t.key));
        expect(posiciones.every((i) => i >= 0)).toBe(true);
        expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
    });

    it("ningún paso del tour se repite", () => {
        expect(new Set(claves).size).toBe(claves.length);
    });

    it("cada tema usa los textos, la pregunta y la ruta de la fuente común", () => {
        for (const tema of TODOS_LOS_TEMAS) {
            const paso = pasoDe(tema.key);
            expect(paso, `falta el paso del tema ${tema.key}`).toBeTruthy();
            expect(paso?.title).toBe(tema.titulo);
            expect(paso?.body).toBe(tema.cuerpo);
            expect(paso?.say).toBe(tema.voz);
            expect(paso?.ask).toBe(tema.preguntaAurora);
            expect(paso?.go).toBeTruthy();
            vi.useFakeTimers();
            try {
                expect(rutaDe(paso!)).toBe(tema.ruta);
            } finally {
                vi.useRealTimers();
            }
        }
    });

    it("cada tema trae su icono lucide y un color Trinity", () => {
        const colores: string[] = Object.values(ACENTOS_TRINITY);
        for (const tema of TODOS_LOS_TEMAS) {
            const paso = pasoDe(tema.key);
            expect(paso?.icon, `el tema ${tema.key} no tiene icono`).toBeTruthy();
            expect(colores).toContain(paso?.accent);
        }
    });

    it("el paso de cerebro lleva a /cerebro", () => {
        const paso = pasoDe("neuronas-cerebro");
        expect(paso).toBeTruthy();
        vi.useFakeTimers();
        try {
            expect(rutaDe(paso!)).toBe("/cerebro");
        } finally {
            vi.useRealTimers();
        }
        expect(pasoDe("cerebros")?.paso.ruta ?? "/cerebro").toBe("/cerebro");
    });

    it("no queda el paso viejo de la Librería y sí el de Librería y Biblioteca", () => {
        expect(pasoDe("libreria")).toBeUndefined();
        expect(pasoDe("libreria-biblioteca")).toBeTruthy();
    });
});
