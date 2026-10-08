import { describe, expect, it } from "vitest";
import { baseDeCadena, estadoDeDependencia, sucesorasDe } from "../cadenas";

describe("cadenas de reintento", () => {
    it("la base es la de Genesis y la del vigilante", () => {
        expect(baseDeCadena("CAMR1005Db")).toBe("CAMR1005D");
        expect(baseDeCadena("RM6b")).toBe("RM6");
        expect(baseDeCadena("RM6")).toBe("RM6");
        expect(baseDeCadena("DR0927-1b")).toBe("DR0927-1");
        expect(baseDeCadena("pRJ1")).toBe("pRJ1");
    });

    it("las sucesoras van en orden y nunca incluyen a las anteriores", () => {
        expect(sucesorasDe("RM6b", ["RM6", "RM6c", "RM6b", "RM7", "RM6d"])).toEqual(["RM6c", "RM6d"]);
        expect(sucesorasDe("RM6", ["RM6"])).toEqual([]);
    });
});

describe("estadoDeDependencia", () => {
    const de = (p: Record<string, string>) => (id: string) => p[id];

    it("integrada ella → cumplida", () => {
        expect(estadoDeDependencia("A", de({ A: "commit" }), ["A"])).toEqual({ estado: "commit", cumplida: true });
    });

    it("sustituida con sucesora viva → espera viva con el estado de la sucesora", () => {
        const p = { RM6: "sustituida", RM6b: "reasignada" };
        expect(estadoDeDependencia("RM6", de(p), Object.keys(p))).toEqual({
            estado: "reasignada", via: "RM6b", cumplida: false,
        });
    });

    it("una sucesora integrada la cumple, aunque la original fallara", () => {
        const p = { X1: "fallo_tsc", X1b: "sustituida", X1c: "commit" };
        expect(estadoDeDependencia("X1", de(p), Object.keys(p))).toEqual({ estado: "commit", via: "X1c", cumplida: true });
    });

    it("toda la cadena muerta → su propio estado, sin salida", () => {
        const p = { P: "pendiente_aprobacion", Pb: "sustituida" };
        expect(estadoDeDependencia("Pb", de(p), Object.keys(p))).toEqual({ estado: "sustituida", cumplida: false });
    });

    it("una sucesora definida en una cola y aún sin progreso cuenta como viva (pendiente)", () => {
        expect(estadoDeDependencia("RM6", de({ RM6: "sustituida" }), ["RM6", "RM6b"])).toEqual({
            estado: "pendiente", via: "RM6b", cumplida: false,
        });
    });

    it("integrada en main según los asuntos de git", () => {
        expect(estadoDeDependencia("RM6", de({ RM6: "sustituida" }), ["RM6", "RM6b"], (id) => id === "RM6b").cumplida).toBe(true);
    });
});
