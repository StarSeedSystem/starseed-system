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

import {
    causaDelMedio,
    clasificar,
    contarVeredictos,
    esFalloDelMedio,
    resumenVeredictos,
} from "@/lib/mando/reintento-inteligente";

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

describe("un fallo del MEDIO vuelve a la cola, no al cajón (2026-09-22)", () => {
    const tarea = (id: string, estado: string, nota: string) => ({
        id, ola: "363", titulo: "t", estado, nota, motivo: "", depende: [], archivos: [], modelo: "",
    });

    it("«ningún proveedor respondió» se reintenta, no se descarta", () => {
        // RM3, medido en la ola viva: el veredicto era «descartar: sin acción requerida».
        const v = clasificar(tarea("RM3", "fallo", "ningún proveedor respondió (does not exist)"), {}, "");
        expect(v.accion).toBe("reintentar");
        expect(v.motivo).toContain("era el medio");
    });

    it("una red caída no gasta uno de los tres intentos", () => {
        // p316Ic: con tres ids hermanos en progreso acababa en «necesita una persona».
        const progreso = { p316I: {}, p316Ib: {}, p316Ic: {} };
        const v = clasificar(tarea("p316Ic", "interrumpida", "red caída: $ codex exec ..."), progreso, "");
        expect(v.accion).toBe("reintentar");
        expect(v.motivo).toContain("red");
    });

    it("un rechazo humano NO se cuela como fallo del medio", () => {
        // Aquí alguien miró el trabajo y dijo que no: eso no lo arregla reintentar a ciegas.
        const v = clasificar(tarea("RM4", "rechazada", "no toco ninguno de los 2 archivos que declaraba"), {}, "");
        expect(v.accion).toBe("descartar");
    });

    it("un fallo de la propia tarea sigue contando intentos", () => {
        const progreso = { R7: {}, R7b: {}, R7c: {} };
        const v = clasificar(tarea("R7c", "fallo_tsc", "14 errores tsc"), progreso, "");
        expect(v.accion).toBe("descartar");
        expect(v.motivo).toContain("tres intentos");
    });

    it("la causa se nombra en castellano para que se entienda el porqué", () => {
        expect(causaDelMedio("ningún proveedor respondió (does not exist)")).toContain("proveedor");
        expect(causaDelMedio("429 too many requests")).toContain("429");
        expect(causaDelMedio("algo raro")).toBe("falló el medio");
    });

    it("esFalloDelMedio solo mira estados de fallo", () => {
        expect(esFalloDelMedio("commit", "timeout")).toBe(false);
        expect(esFalloDelMedio("fallo", "timeout")).toBe(true);
        expect(esFalloDelMedio("fallo", "el revisor pidió otra cosa")).toBe(false);
    });
});
