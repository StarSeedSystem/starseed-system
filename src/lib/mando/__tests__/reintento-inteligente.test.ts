import { describe, expect, it } from "vitest";
import {
    cambioAutomatico,
    clasificar,
    ejecutarReintentoInteligente,
    ponerPrimera,
    reencolar,
    type TareaAnalizar,
} from "../reintento-inteligente";

const REVISION = `## Ola 1005 · A: tarea
**Riesgos reales**
1. Falta validar la entrada.
**Seguimiento:** sí, bloqueante — corrige la validación literal`;

function tarea(estado: string, extra: Partial<TareaAnalizar> = {}): TareaAnalizar {
    return { id: "A", estado, archivos: ["src/lib/a.ts"], prompt: "Implementa A", ...extra };
}

describe("clasificación de la tabla de reparación", () => {
    for (const estado of ["rechazada", "bloqueante", "fallo_tests", "fallo_tsc", "sin_cambios", "interrumpida", "conflicto", "faltan"]) {
        it(`${estado} se repara`, () => {
            expect(clasificar(tarea(estado), { A: {} }, REVISION).accion).toBe("reintentar");
        });
    }

    it("una dependencia viva espera", () => {
        expect(clasificar(tarea("bloqueada", { nota: "dependencia no integrada: Z" }), { A: {} }, REVISION).accion).toBe("esperar");
    });

    it("solo los descartes expresos se descartan", () => {
        for (const estado of ["sustituida", "reasignada", "duplicada", "descartada"]) {
            expect(clasificar(tarea(estado), { A: {} }, REVISION).accion).toBe("descartar");
        }
    });

    it("el tercer intento escala y nunca se descarta", () => {
        expect(clasificar(tarea("fallo_tsc", { id: "Ac" }), { Ac: {} }, REVISION)).toEqual({
            accion: "escalar",
            motivo: "tercer intento fallido: escala al director, nunca se descarta",
        });
    });
});

describe("cambio automático", () => {
    it("conserva literal la objeción de la revisión", () => {
        const cambio = cambioAutomatico(tarea("rechazada"), { revisionesMd: REVISION });
        expect(cambio).toContain("1. Falta validar la entrada.");
        expect(cambio).toContain("Seguimiento: sí, bloqueante — corrige la validación literal");
    });

    it("incorpora salida de pruebas, tsc y archivos faltantes", () => {
        expect(cambioAutomatico(tarea("fallo_tests"), { pasos: "vitest: expected 2 received 1" })).toContain("expected 2");
        expect(cambioAutomatico(tarea("fallo_tsc"), { tsc: "error TS2322 en a.ts" })).toContain("TS2322");
        expect(cambioAutomatico(tarea("faltan"), { faltantes: ["src/lib/b.ts"] })).toContain("src/lib/b.ts");
    });

    it("sin cambios nombra todos los archivos declarados", () => {
        expect(cambioAutomatico(tarea("sin_cambios", { archivos: ["a.ts", "b.ts"] }))).toContain("a.ts, b.ts");
    });
});

describe("cadena, modelo y cola", () => {
    it("sigue A → Ab → Ac sobre el último fallo", () => {
        const progreso = { A: { estado: "rechazada" }, Ab: { estado: "fallo_tests" } };
        const resultado = ejecutarReintentoInteligente({
            ids: ["A"], progreso, revisionesMd: REVISION,
            colasTareas: [tarea("rechazada"), tarea("fallo_tests", { id: "Ab", modelo: "nim/kimi-k3" })],
            fuentes: { Ab: { pasos: "test falla: expected true" } },
            modelos: ["nim/kimi-k3", "xkiro/qwen3-coder-plus"],
        });
        expect(resultado.reintentadas).toEqual(["Ac"]);
        expect(resultado.reencoladas[0]?.prompt).toContain("expected true");
    });

    it("no duplica si ya existe un sucesor vivo", () => {
        const resultado = ejecutarReintentoInteligente({
            ids: ["A"], progreso: { A: { estado: "rechazada" }, Ab: { estado: "pendiente" } },
            revisionesMd: REVISION, colasTareas: [tarea("pendiente", { id: "Ab" })],
        });
        expect(resultado.reencoladas).toEqual([]);
        expect(resultado.esperando[0]?.motivo).toContain("sucesor vivo: Ab");
    });

    it("no hereda estado, nota, motivo ni modelo y deja una sola REPARACIÓN", () => {
        const nueva = reencolar(tarea("fallo_tsc", {
            nota: "vieja", motivo: "viejo", modelo: "nim/kimi-k3",
            prompt: "Contrato\n\n## REPARACIÓN\nbloque viejo",
        }), "bloque nuevo", { A: {} }, ["nim/kimi-k3", "xkiro/qwen3-coder-plus"]);
        expect(nueva).not.toHaveProperty("estado");
        expect(nueva).not.toHaveProperty("nota");
        expect(nueva).not.toHaveProperty("motivo");
        expect(nueva.modelo).toBe("codex/gpt-5.6-sol");
        expect(nueva.prompt.match(/## REPARACIÓN/g)).toHaveLength(1);
        expect(nueva.prompt).not.toContain("bloque viejo");
    });

    it("desde el segundo intento usa Codex si el modelo anterior fue otro", () => {
        const nueva = reencolar(tarea("fallo_tests", { id: "Ab", modelo: "nim/kimi-k3" }), "arregla", ["A", "Ab"]);
        expect(nueva.id).toBe("Ac");
        expect(nueva.modelo).toBe("codex/gpt-5.6-sol");
    });

    it("si Codex fue el que falló elige otro modelo de la rotación", () => {
        const nueva = reencolar(tarea("fallo_tests", { modelo: "codex/gpt-5.6-sol" }), "arregla", ["A"], ["xkiro/qwen3-coder-plus"]);
        expect(nueva.modelo).toBe("xkiro/qwen3-coder-plus");
    });

    it("pone el reintento primero y elimina duplicados", () => {
        const cola = ponerPrimera([{ id: "A" }, { id: "B" }], [{ id: "Ac" }, { id: "B" }]);
        expect(cola.map((t) => t.id)).toEqual(["Ac", "B", "A"]);
        expect(cola.findIndex((t) => t.id === "Ac") + 1).toBe(1);
    });

    it("reintentar todas solo procesa fallos y bloqueos", () => {
        const progreso = { A: { estado: "fallo_tsc" }, B: { estado: "pendiente" }, C: { estado: "en_curso" }, D: { estado: "informe" }, E: { estado: "sustituida" } };
        const resultado = ejecutarReintentoInteligente({ progreso, revisionesMd: REVISION });
        expect(resultado.resultados.map((r) => r.id)).toEqual(["A"]);
    });
});

describe("ramas que esperaron un visto bueno (2026-10-08)", () => {
    const md = `## 2026-10-08 15:35 · 363 · RM6: Registrar Red Mesh
**Revisión (freellmapi/auto)**

**Riesgos reales**
1. El campo url pasa de "/senales" a "internal://inferencia-distribuida-local".

**Probar a mano en localhost**
1. Abrir la biblioteca.

**Seguimiento:** sí, bloqueante — URL interna no válida.
`;

    it("con revisión bloqueante se repara con la objeción literal", () => {
        const progreso = { RM6: { estado: "pendiente_aprobacion", revisor: "bloqueante", prompt: "Registra RM6." } };
        const r = ejecutarReintentoInteligente({ ids: ["RM6"], progreso, revisionesMd: md });
        expect(r.reintentadas).toEqual(["RM6b"]);
        expect(r.reencoladas[0].prompt).toContain("internal://inferencia-distribuida-local");
    });

    it("en verde espera a una persona y no entra en «reparar todas»", () => {
        const progreso = { X: { estado: "pendiente_aprobacion", revisor: "ok" } };
        expect(ejecutarReintentoInteligente({ ids: ["X"], progreso, revisionesMd: "" }).reintentadas).toEqual([]);
        expect(ejecutarReintentoInteligente({ progreso, revisionesMd: "" }).reintentadas).toEqual([]);
    });
});
