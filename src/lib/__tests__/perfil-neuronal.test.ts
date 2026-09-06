/**
 * Tests del perfil neuronal por timbre (Tarea F4 · Ola 263 · Forja fase 2).
 * Comprueban que el vocabulario de instruct coincide con el del demonio,
 * que la semilla usa la fórmula exacta y que los acotados se respetan.
 */

import { describe, expect, it } from "vitest";

import { TIMBRES, type Timbre } from "@/lib/aurora/timbres";
import { perfilNeuronal, semillaPorDefecto, validarInstruct } from "@/lib/voces/perfil-neuronal";

describe("validarInstruct", () => {
    it("conserva los tokens válidos en el orden canónico y sin ignorados", () => {
        const r = validarInstruct("female, young adult, moderate pitch");
        expect(r.tokens).toEqual(["female", "young adult", "moderate pitch"]);
        expect(r.valido).toBe("female, young adult, moderate pitch");
        expect(r.ignorados).toEqual([]);
    });

    it("descarta texto libre y el segundo token del mismo grupo, y reordena", () => {
        const r = validarInstruct("voz cálida, female, whisper, high pitch, moderate pitch");
        // El segundo tono («moderate pitch») queda descartado: un timbre no
        // puede ser agudo y medio a la vez; el texto libre en español ignora.
        expect(r.tokens).toEqual(["female", "high pitch", "whisper"]);
        expect(r.valido).toBe("female, high pitch, whisper");
        expect(r.ignorados).toEqual(["voz cálida", "moderate pitch"]);
    });

    it("normaliza mayúsculas y espacios dobles", () => {
        const r = validarInstruct("  Female ,   YOUNG   ADULT ");
        expect(r.tokens).toEqual(["female", "young adult"]);
        expect(r.ignorados).toEqual([]);
    });
});

describe("semillaPorDefecto", () => {
    it("usa la fórmula exacta del demonio (h = h*31 + código; 700000 + h % 90000)", () => {
        // Cálculo a mano, paso a paso, con >>> 0 (uint32):
        let h = 0;
        for (const ch of "aurora") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        expect(h).toBe(2888586080);
        expect(semillaPorDefecto("aurora")).toBe(700000 + (2888586080 % 90000));
    });
});

describe("perfilNeuronal", () => {
    it("traduce el timbre Aurora con speed 1, seed determinista y pitch 1", () => {
        const p = perfilNeuronal(TIMBRES[0]);
        expect(TIMBRES[0].id).toBe("fem-aurora");
        expect(p.voz).toBe("ef_dora");
        expect(p.speed).toBe(1);
        expect(p.instruct).toBe("female, young adult, moderate pitch");
        expect(p.pitch).toBe(1);
        expect(p.seed).toBe(semillaPorDefecto("fem-aurora"));
        expect(p.ignorados).toEqual([]);
    });

    it("acota un pitch fuera de rango a 1.4", () => {
        const t: Timbre = {
            ...TIMBRES[0],
            id: "prueba-pitch",
            local: { ...TIMBRES[0].local, pitch: 2 },
        };
        expect(perfilNeuronal(t).pitch).toBe(1.4);
    });

    it("acota el speed y respeta una semilla explícita", () => {
        const t: Timbre = {
            ...TIMBRES[0],
            id: "prueba-speed",
            local: { ...TIMBRES[0].local, speed: 9, seed: 123456 },
        };
        const p = perfilNeuronal(t);
        expect(p.speed).toBe(1.6);
        expect(p.seed).toBe(123456);
    });

    it("deriva el género cuando el instruct queda vacío tras validar", () => {
        const t: Timbre = {
            ...TIMBRES[0],
            id: "prueba-instruct",
            local: { voz: "ef_dora", speed: 1, instruct: "voz bonita suave" },
        };
        const p = perfilNeuronal(t);
        expect(p.instruct).toBe("female");
        expect(p.ignorados).toEqual(["voz bonita suave"]);
    });
});
