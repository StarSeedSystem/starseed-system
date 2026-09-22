/**
 * El veredicto de una tarea rechazada sale de la revisión ESCRITA, y por eso lo calcula el
 * servidor (2026-09-22).
 *
 * Lo que pasaba: el panel de Ramificación llamaba a `clasificar(tarea, {}, "")` en el
 * navegador — sin progreso y sin `revisiones.md`, porque el navegador no puede leer el
 * disco. Con esos argumentos `clasificar` SIEMPRE llega a la última rama y devuelve
 * «descartar: rechazo sin razón escrita», de modo que 22 tareas rechazadas ofrecían
 * descartarse aunque su revisión dijese «sí, bloqueante» y explicase el arreglo. El resumen
 * remataba: «0 se reintentan · 24 se descartan».
 */
import { describe, expect, it } from "vitest";

import { clasificar, contarVeredictos, resumenVeredictos } from "@/lib/mando/reintento-inteligente";

/** Una sección de revisiones.md como las que escribe el revisor de verdad. */
const REVISIONES = [
    "## 2026-09-21 19:07 ·  · p323Bc: API /api/mando/reportes: reúne commits, progreso, colas y bus",
    "**Revisión (groq/openai/gpt-oss-120b)**",
    "",
    "**Riesgos reales**",
    "",
    "1. **Hard-code de `baseLocal`.** Se sustituyó la variable de entorno por un valor fijo.",
    "",
    "**Seguimiento:** sí, bloqueante — hard-code de `baseLocal`. Debe volver a usar la variable.",
    "",
].join("\n");

describe("el veredicto necesita la revisión escrita", () => {
    it("con revisiones.md dice reintentar y cita la objeción", () => {
        const v = clasificar(
            { id: "p323Bc", ola: "323", titulo: "API de reportes", estado: "rechazada", nota: "", motivo: "", depende: [], archivos: [], modelo: "" },
            {},
            REVISIONES,
        );
        expect(v.accion).toBe("reintentar");
        expect(v.motivo).toContain("bloqueante");
    });

    it("sin revisiones.md la MISMA tarea se descarta: era la llamada del navegador", () => {
        const v = clasificar(
            { id: "p323Bc", ola: "323", titulo: "API de reportes", estado: "rechazada", nota: "", motivo: "", depende: [], archivos: [], modelo: "" },
            {},
            "",
        );
        expect(v.accion).toBe("descartar");
        expect(v.motivo).toContain("sin razón escrita");
    });
});

describe("contarVeredictos cuenta los que ya vienen calculados", () => {
    it("reparte por acción", () => {
        const r = contarVeredictos([
            { accion: "reintentar" },
            { accion: "reintentar" },
            { accion: "esperar" },
            { accion: "descartar" },
        ]);
        expect(r.resumenTexto).toBe("2 se reintentan · 1 se descartan · 1 esperan");
    });

    it("una tarea sin veredicto no se cuenta como reintentable", () => {
        // Prudencia: lo que no se sabe no se ofrece reintentar en masa.
        const r = contarVeredictos([null, undefined, { accion: "reintentar" }]);
        expect(r.reintentarCount).toBe(1);
        expect(r.descartarCount).toBe(2);
    });

    it("da el mismo recuento que resumenVeredictos con los mismos datos", () => {
        const tareas = [
            { id: "p323Bc", ola: "323", titulo: "t", estado: "rechazada", nota: "", motivo: "", depende: [], archivos: [], modelo: "" },
        ];
        const viejo = resumenVeredictos(tareas, {}, REVISIONES);
        const nuevo = contarVeredictos(tareas.map((t) => clasificar(t, {}, REVISIONES)));
        expect(nuevo).toEqual(viejo);
    });
});
