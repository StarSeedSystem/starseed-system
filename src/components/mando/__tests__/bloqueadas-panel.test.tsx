/**
 * Pruebas de las funciones PURAS de `bloqueadas-panel.tsx` (Ola 1005Z · BLQ1005C).
 * Sin red, sin disco, sin procesos: entrada → salida.
 */
import { describe, expect, it } from "vitest";

import {
    cadenaSucesores,
    esEstadoDescartable,
    esEstadoReparable,
    itemDesdeFilaMedidor,
    itemDesdeRamaTarea,
    resumenReparacion,
    textoResultado,
} from "@/components/mando/bloqueadas-panel";

describe("esEstadoReparable", () => {
    it("acepta fallos y bloqueos revisables", () => {
        for (const e of ["fallo_tsc", "fallo_tests", "sin_cambios", "rechazada", "bloqueante", "interrumpida", "conflicto"]) {
            expect(esEstadoReparable(e), e).toBe(true);
        }
        expect(esEstadoReparable("fallo_total_nuevo")).toBe(true);
    });

    it("rechaza los estados que el contrato prohíbe reprocesar", () => {
        for (const e of ["sustituida", "informe", "en_curso", "pendiente", "commit"]) {
            expect(esEstadoReparable(e), e).toBe(false);
        }
    });
});

describe("esEstadoDescartable", () => {
    it("descartar es la excepción: solo lo que ya vive con otro id", () => {
        expect(esEstadoDescartable("sustituida")).toBe(true);
        expect(esEstadoDescartable("duplicada")).toBe(true);
        expect(esEstadoDescartable("rechazada")).toBe(false);
        expect(esEstadoDescartable("sin_cambios")).toBe(false);
    });
});

describe("cadenaSucesores", () => {
    it("agrupa X, Xb, Xc con la base primero y sin duplicados", () => {
        expect(cadenaSucesores("PA10b", ["PA10c", "PA10", "PA10b", "ZX9"])).toEqual(["PA10", "PA10b", "PA10c"]);
    });

    it("sin conocidos se queda con el propio id", () => {
        expect(cadenaSucesores("T1", [])).toEqual(["T1"]);
    });
});

describe("itemDesdeFilaMedidor", () => {
    it("usa el porque como causa y propone un cambio acorde al estado", () => {
        const item = itemDesdeFilaMedidor({
            id: "NE1", titulo: "Neuronas", estado: "sin_cambios",
            porque: "no tocó sus archivos", acciones: [],
        }, ["NE1b"]);
        expect(item.causa).toBe("no tocó sus archivos");
        expect(item.cambio).toContain("no tocó tus archivos declarados");
        expect(item.sucesores).toEqual(["NE1", "NE1b"]);
        expect(item.reparable).toBe(true);
        expect(item.descartable).toBe(false);
    });

    it("una sustituida es descartable y no reparable", () => {
        const item = itemDesdeFilaMedidor({ id: "A1", titulo: "x", estado: "sustituida", acciones: [] }, []);
        expect(item.reparable).toBe(false);
        expect(item.descartable).toBe(true);
    });
});

describe("itemDesdeRamaTarea", () => {
    it("la causa es el veredicto del servidor cuando existe", () => {
        const item = itemDesdeRamaTarea({
            id: "T3", titulo: "Reparar panel", estado: "rechazada", nota: "",
            veredicto: { accion: "reintentar", motivo: "objeción literal del revisor" },
        }, ["T3b"]);
        expect(item.causa).toBe("objeción literal del revisor");
        expect(item.sucesores).toEqual(["T3", "T3b"]);
    });

    it("una bloqueada por dependencia no hereda el cambio genérico", () => {
        const item = itemDesdeRamaTarea({
            id: "D2", titulo: "Dependiente", estado: "bloqueada",
            bloqueadaPor: "dependencia no integrada: D1 (fallo_tsc)", veredicto: null,
        }, []);
        expect(item.causa).toContain("D1");
        expect(item.cambio).toContain("dependencia");
        expect(item.reparable).toBe(true);
    });
});

describe("textoResultado y resumenReparacion", () => {
    it("enseña el sucesor y su posición tras reparar", () => {
        const r = {
            resultados: [{ id: "T1", accion: "reintentada", motivo: "m", sucesor: "T1b", posicion: 1, texto: "ok" }],
            reintentadas: ["T1b"],
        };
        const t = textoResultado(r, "T1");
        expect(t.ok).toBe(true);
        expect(t.texto).toContain("T1b");
        expect(t.sucesor).toBe("T1b");
    });

    it("cuenta reparadas, escaladas, descartadas y esperando", () => {
        expect(resumenReparacion({
            reintentadas: ["A", "B"], escaladas: [{ id: "C", motivo: "" }],
            descartadas: [], esperando: [{ id: "D", motivo: "" }],
        })).toBe("2 reparadas · 1 escaladas · 0 descartadas · 1 esperando");
    });

    it("sin error se anota el motivo del resultado", () => {
        const t = textoResultado({ resultados: [{ id: "T9", accion: "esperando", motivo: "ya tiene sucesor vivo" }] }, "T9");
        expect(t.ok).toBe(false);
        expect(t.texto).toContain("sucesor vivo");
    });
});
