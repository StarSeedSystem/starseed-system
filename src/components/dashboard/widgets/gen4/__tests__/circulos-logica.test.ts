import { describe, expect, it } from "vitest";
import { abierto, etapaDe, normalizarCasos, ordenarCasos, participantesDe, pasoDe, type Caso } from "../restorative-court-partes";

const c = (id: string, stage: Caso["stage"], createdAt = "2026-09-01T00:00:00Z"): Caso => ({ id, title: id, description: "", participants: [], stage, createdAt, updates: [] });

describe("Círculos de Paz · lógica", () => {
    it("el camino tiene cuatro pasos y «sin acuerdo» también lo cierra", () => {
        expect([pasoDe("solicitada"), pasoDe("facilitador_asignado"), pasoDe("en_circulo"), pasoDe("acuerdo"), pasoDe("sin_acuerdo")]).toEqual([0, 1, 2, 3, 3]);
        expect(etapaDe("sin_acuerdo").corto).toBe("Sin acuerdo");
        expect(abierto({ stage: "en_circulo" })).toBe(true);
        expect(abierto({ stage: "sin_acuerdo" })).toBe(false);
    });
    it("ordena: abiertos primero (más avanzados antes) y luego los cerrados más recientes", () => {
        const r = ordenarCasos([c("a", "acuerdo", "2026-09-10T00:00:00Z"), c("b", "solicitada"), c("d", "sin_acuerdo", "2026-09-20T00:00:00Z"), c("e", "en_circulo")]);
        expect(r.map((x) => x.id)).toEqual(["e", "b", "d", "a"]);
    });
    it("normaliza lo que venga de la nube sin romperse", () => {
        const r = normalizarCasos([{ id: "x", title: "T", stage: "solicitada", participants: ["Ana", 3], createdAt: "" }, null, { title: "sin id" }, "basura"]);
        expect(r).toHaveLength(1);
        expect(r[0].participants).toEqual(["Ana"]);
        expect(r[0].updates).toEqual([]);
        expect(normalizarCasos("nada")).toEqual([]);
    });
    it("lee participantes separados por comas, punto y coma o saltos, sin duplicados", () => {
        expect(participantesDe(" Ana, Luis;Marta\nAna ,, ")).toEqual(["Ana", "Luis", "Marta"]);
        expect(participantesDe(Array.from({ length: 20 }, (_, i) => `P${i}`).join(","))).toHaveLength(12);
        expect(participantesDe("x".repeat(90))[0]).toHaveLength(60);
    });
});
