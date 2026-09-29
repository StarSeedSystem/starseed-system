/**
 * validarCola con las tareas de los SUEÑOS PROFUNDOS (2026-09-29): `tipo: "analisis"`, área,
 * lente, `aprobacion` y `privado`. Un sueño solo lee: queda exento de la regla de ≤3 archivos
 * y una cola de sueños puede llevar 14 áreas × 6 lentes; a cambio necesita área y lente.
 */
import { describe, expect, it } from "vitest";

import { TOPE_TAREAS_COLA, extrasDeTarea, motivoNoNube, validarCola } from "@/lib/mando/colas";

const PROMPT = "SUEÑO PROFUNDO · análisis, NO escritura: lee y escribe un informe.";

function sueno(n: number, extra: Record<string, unknown> = {}) {
    return {
        id: `SA0929${n}`,
        titulo: `Sueño ${n}`,
        prompt: PROMPT,
        tipo: "analisis",
        area: "voz",
        lente: "arquitectura-deuda",
        archivos: Array.from({ length: 30 }, (_, i) => `src/lib/voces/a${i}.ts`),
        ...extra,
    };
}

describe("validarCola · sueños profundos", () => {
    it("acepta una cola de 84 sueños con 30 archivos cada uno y conserva sus campos", () => {
        const { errores, tareas, avisos } = validarCola("suenos-2026-09-29", Array.from({ length: 84 }, (_, i) => sueno(i + 1)));
        expect(errores).toEqual([]);
        expect(avisos).toEqual([]);
        expect(tareas).toHaveLength(84);
        expect(tareas[0]).toMatchObject({ tipo: "analisis", area: "voz", lente: "arquitectura-deuda" });
        expect(tareas[0].archivos).toHaveLength(30);
    });

    it("una cola de código sigue con su techo de tareas", () => {
        const muchas = Array.from({ length: TOPE_TAREAS_COLA + 1 }, (_, i) => ({ id: `T${i + 1}`, titulo: "t", prompt: PROMPT, archivos: [] }));
        expect(validarCola("400-muchas", muchas).errores.some((e) => e.includes("Demasiadas tareas"))).toBe(true);
    });

    it("un sueño sin área o sin lente, o sin archivos, no vale", () => {
        const { errores } = validarCola("suenos-2026-09-29", [sueno(1, { area: undefined }), sueno(2, { lente: "Mal Lente" }), sueno(3, { archivos: [] })]);
        expect(errores.filter((e) => e.includes("necesita área y lente"))).toHaveLength(2);
        expect(errores.some((e) => e.includes("sin archivos"))).toBe(true);
    });

    it("un sueño no puede leer un .env", () => {
        const { errores } = validarCola("suenos-2026-09-29", [sueno(1, { archivos: ["src/lib/.env.local"] })]);
        expect(errores.some((e) => e.includes("ruta de archivo no permitida"))).toBe(true);
    });

    it("un tipo desconocido es un error, no una tarea de código disfrazada", () => {
        const { errores } = validarCola("400-prueba", [{ id: "A1", titulo: "t", prompt: PROMPT, archivos: [], tipo: "magia" }]);
        expect(errores.some((e) => e.includes("tipo «magia» desconocido"))).toBe(true);
    });

    it("una tarea de código con más de 3 archivos avisa pero se puede guardar", () => {
        const { errores, avisos } = validarCola("400-prueba", [
            { id: "A1", titulo: "t", prompt: PROMPT, archivos: ["a.ts", "b.ts", "c.ts", "d.ts"] },
        ]);
        expect(errores).toEqual([]);
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toContain("≤3");
    });

    it("la propuesta conserva el visto bueno y lo privado", () => {
        const { tareas } = validarCola("401-suenos-2026-09-29", [
            { id: "SP09291", titulo: "t", prompt: PROMPT, archivos: ["a.ts"], aprobacion: true, privado: true },
        ]);
        expect(tareas[0].aprobacion).toBe(true);
        expect(tareas[0].privado).toBe(true);
        expect(tareas[0].tipo).toBeUndefined();
    });
});

describe("extrasDeTarea y motivoNoNube", () => {
    it("solo acepta etiquetas limpias", () => {
        expect(extrasDeTarea({ tipo: "analisis", area: "voz", lente: "x/../y", aprobacion: "sí" })).toEqual({ tipo: "analisis", area: "voz" });
    });

    it("ni sueños ni tareas privadas salen a la nube", () => {
        const base = { id: "A1", ola: "o", titulo: "t", archivos: [], prompt: PROMPT, depende: [] };
        expect(motivoNoNube([base])).toBeNull();
        expect(motivoNoNube([{ ...base, privado: true }])).toContain("privadas");
        expect(motivoNoNube([{ ...base, tipo: "analisis" }])).toContain("Mac");
    });
});
