/**
 * RTGUI1021K2-d3b · La identidad de voz por personalidad, adaptada a la API de hoy.
 *
 * La rama nube/41401596437 probaba un módulo `identidad-voz` que main nunca integró:
 * la precedencia entre capas vive hoy en `voice-config.ts` (agente > neurona >
 * personalidad > cerebro > cuenta, SGO1031A/B) y ya está probada en
 * `motor-activo-jerarquia.test.ts`. De esa rama solo sobrevive aquí lo que el código
 * de HOY hace y nadie cubría: el mapa de voz por persona de `voz-rt.ts`
 * (vozDePersona) sobrevive a un pin guardado malformado, y sin personalidad no
 * pierde la F1.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { vozDePersona } from "@/lib/aurora/voz-rt";

/** La clave es privada en `voz-rt.ts`; aquí se repite su valor real. */
const CLAVE_VOZ = "starseed.voz-rt.voz";

afterEach(() => {
    window.localStorage.removeItem(CLAVE_VOZ);
});

describe("vozDePersona · identidad por personalidad (RTGUI1021K2-d3b)", () => {
    it("un pin malformado no borra lo que ya sabía el mapa: Hermione sigue F3", () => {
        window.localStorage.setItem(CLAVE_VOZ, "X99");
        expect(vozDePersona("Hermione")).toBe("F3");
    });

    it("ni sin consulta ni sin personalidad se pierde la F1", () => {
        expect(vozDePersona(undefined)).toBe("F1");
        expect(vozDePersona("")).toBe("F1");
    });
});
