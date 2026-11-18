import { describe, it, expect } from "vitest";
import {
    getWidgetFunction,
    getWidgetFunctionStyle,
    type WidgetFunctionKind,
} from "../widget-function-style";
import type { WidgetType } from "../dashboard-types";

// ════════════════════════════════════════════════════════════════
// Widget Function Style: comprueba que la correspondencia
// widget → familia funcional es coherente y determinista.
// ════════════════════════════════════════════════════════════════

const FAMILIAS_VALIDAS: WidgetFunctionKind[] = [
    "governance", "economy", "learning", "culture", "social",
    "climate", "cosmos", "system", "ai", "media",
    "location", "files", "productivity", "apps", "identity", "utility",
];

function esFamiliaValida(k: WidgetFunctionKind): boolean {
    return FAMILIAS_VALIDAS.includes(k);
}

describe("getWidgetFunction", () => {
    it("TRADUCTOR pertenece a la familia 'ai' (no 'utility')", () => {
        expect(getWidgetFunction("TRADUCTOR")).toBe("ai");
    });

    it("ASTRAURA_CORTEX pertenece a la familia 'ai'", () => {
        expect(getWidgetFunction("ASTRAURA_CORTEX")).toBe("ai");
    });

    it("devuelve una familia válida para todos los tipos conocidos", () => {
        const tipos: WidgetType[] = [
            "TRADUCTOR", "ASTRAURA_CORTEX", "ORACLE_PREDICT", "NEXUS_QUICK_ACCESS",
            "BRAINS", "AI_GENERATED", "CLOCK_DATE", "TASKS_QUICK",
        ];
        for (const t of tipos) {
            expect(esFamiliaValida(getWidgetFunction(t))).toBe(true);
        }
    });

    it("fallback 'utility' para tipo desconocido sin lanzar", () => {
        expect(getWidgetFunction("TIPO_QUE_NO_EXISTE" as WidgetType)).toBe("utility");
    });

    it("es determinista: misma entrada → misma salida", () => {
        const a = getWidgetFunction("TRADUCTOR");
        const b = getWidgetFunction("TRADUCTOR");
        expect(a).toBe(b);
    });
});

describe("getWidgetFunctionStyle", () => {
    it("TRADUCTOR devuelve estilo 'ai' con acento cian eléctrico y peso 'action'", () => {
        const style = getWidgetFunctionStyle("TRADUCTOR");
        expect(style.kind).toBe("ai");
        expect(style.accent).toBe("#22D3EE");
        expect(style.weight).toBe("action");
    });

    it("ASTRAURA_CORTEX devuelve estilo 'ai' idéntico", () => {
        const t1 = getWidgetFunctionStyle("TRADUCTOR");
        const t2 = getWidgetFunctionStyle("ASTRAURA_CORTEX");
        expect(t1).toEqual(t2);
    });

    it("devuelve estructura completa (kind, accent, weight) para cualquier tipo", () => {
        const tipos: WidgetType[] = [
            "TRADUCTOR", "CLOCK_DATE", "SYSTEM_STATUS", "MAP_LOCATION",
        ];
        for (const t of tipos) {
            const s = getWidgetFunctionStyle(t);
            expect(esFamiliaValida(s.kind)).toBe(true);
            expect(typeof s.accent).toBe("string");
            expect(s.accent.length).toBeGreaterThan(0);
            expect(["ambient", "data", "action"]).toContain(s.weight);
        }
    });

    it("es determinista", () => {
        const a = getWidgetFunctionStyle("TRADUCTOR");
        const b = getWidgetFunctionStyle("TRADUCTOR");
        expect(a).toEqual(b);
    });
});