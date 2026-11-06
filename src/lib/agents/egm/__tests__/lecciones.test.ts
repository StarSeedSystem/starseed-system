import { describe, expect, it } from "vitest";

import type { Objecion } from "../peces";
import { leccionesDe } from "../lecciones";

function entradaCon(
    overrides: Partial<Parameters<typeof leccionesDe>[0]> = {},
): Parameters<typeof leccionesDe>[0] {
    return {
        perfilId: "perfil-1",
        cerebroId: "cerebro-1",
        objeciones: [],
        resueltas: [],
        rechazadas: [],
        fecha: "2026-11-06",
        ...overrides,
    };
}

describe("leccionesDe", () => {
    it("de 3 objeciones (1 bloquea resuelta, 1 importa rechazada, 1 menor) salen 2 lecciones con su texto", () => {
        const objeciones: Objecion[] = [
            { gravedad: "bloquea", texto: "El total no considera IVA" },
            { gravedad: "importa", texto: "Falta validar el email" },
            { gravedad: "menor", texto: "Mejorar el placeholder" },
        ];
        const lecciones = leccionesDe(
            entradaCon({
                objeciones,
                resueltas: [{ texto: "El total no considera IVA", correccion: "Se añadió el cálculo del IVA al total" }],
                rechazadas: [{ texto: "Falta validar el email", porque: "El formulario ya lo valida en el servidor" }],
            }),
        );
        expect(lecciones).toHaveLength(2);
        expect(lecciones[0].brainId).toBe("cerebro-1");
        expect(lecciones[0].kinds).toContain("leccion");
        expect(lecciones[0].kinds).toContain("egm");
        expect(lecciones[0].content).toContain("El total no considera IVA");
        expect(lecciones[0].content).toContain("Se añadió el cálculo del IVA al total");
        expect(lecciones[1].content).toContain("Falta validar el email");
        expect(lecciones[1].content).toContain("El formulario ya lo valida en el servidor");
        expect(lecciones[0].content).not.toContain("Mejorar el placeholder");
    });

    it("las objeciones menor no se guardan aunque alguien las marque como resueltas", () => {
        const lecciones = leccionesDe(
            entradaCon({
                objeciones: [{ gravedad: "menor", texto: "Renombrar la variable" }],
                resueltas: [{ texto: "Renombrar la variable", correccion: "Renombrada" }],
            }),
        );
        expect(lecciones).toEqual([]);
    });

    it("sin cerebro no hay lecciones", () => {
        const lecciones = leccionesDe(
            entradaCon({
                cerebroId: null,
                objeciones: [{ gravedad: "bloquea", texto: "Error grave" }],
                resueltas: [{ texto: "Error grave", correccion: "Arreglado" }],
            }),
        );
        expect(lecciones).toEqual([]);
    });

    it("una resuelta que no corresponde a ninguna objeción bloquea/importa no produce lección", () => {
        const lecciones = leccionesDe(
            entradaCon({
                objeciones: [{ gravedad: "importa", texto: "Falta un test" }],
                resueltas: [
                    { texto: "Falta un test", correccion: "Test añadido" },
                    { texto: "Objeción que el pez nunca dijo", correccion: "Corrección huérfana" },
                ],
            }),
        );
        expect(lecciones).toHaveLength(1);
        expect(lecciones[0].content).toContain("Falta un test");
        expect(lecciones[0].content).not.toContain("huérfana");
    });

    it("distingue resuelta de rechazada y guarda la fecha y el perfil como hechos", () => {
        const lecciones = leccionesDe(
            entradaCon({
                objeciones: [
                    { gravedad: "bloquea", texto: "Falla en producción" },
                    { gravedad: "bloquea", texto: "Excede el presupuesto" },
                ],
                resueltas: [{ texto: "Falla en producción", correccion: "Se corrigió la ruta" }],
                rechazadas: [{ texto: "Excede el presupuesto", porque: "El Hardware ya estaba pagado" }],
                fecha: "2026-11-04",
            }),
        );
        expect(lecciones).toHaveLength(2);
        expect(lecciones[0].content).toContain("2026-11-04");
        expect(lecciones[0].content).toContain("perfil-1");
        expect(lecciones[0].content).toContain("Se corrigió la ruta");
        expect(lecciones[0].content).not.toContain("ya estaba pagado");
        expect(lecciones[1].content).not.toContain("Se corrigió la ruta");
        expect(lecciones[1].content).toContain("ya estaba pagado");
    });
});
