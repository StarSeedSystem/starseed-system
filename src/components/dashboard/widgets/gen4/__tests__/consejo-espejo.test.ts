import { describe, expect, it } from "vitest";
import { COUNCIL_PERSPECTIVES } from "@/lib/aurora/council";
import { CONSEJEROS, resumirInforme, resumenSintesis } from "../elder-council-partes";

describe("Consejo · la ficha ligera es espejo del Consejo real", () => {
    it("mismos ids, nombres y colores que COUNCIL_PERSPECTIVES", () => {
        expect(CONSEJEROS.map((c) => [c.id, c.nombre, c.color.toLowerCase()])).toEqual(COUNCIL_PERSPECTIVES.map((p) => [p.id, p.label, p.accent.toLowerCase()]));
    });
    it("resume el informe sin perder la honestidad (fuente única, fallidos)", () => {
        const r = resumirInforme({ topic: "T", at: 1, ms: 2, failed: 1, singleSource: true, sourcesUsed: ["A"], synthesis: { ok: true, verdict: "a_favor", text: "x".repeat(2000) },
            opinions: [{ perspective: { id: "ecologico" }, ok: false, verdict: "a_favor" }] });
        expect(r.dictamenes[0].veredicto).toBe("indeterminado");
        expect(r.sintesis!.texto.length).toBe(900);
        expect(r.fuenteUnica).toBe(true);
        expect(resumenSintesis("## **Hola** mundo")).toBe("Hola mundo");
    });
});
