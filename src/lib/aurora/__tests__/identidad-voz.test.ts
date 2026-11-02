// @vitest-environment jsdom
/**
 * GUI1021K2 · Identidad de voz que main conserva: el mapa fijo
 * personalidad → voz RT (`VOZ_POR_PERSONA` de `voz-rt.ts`).
 *
 * Rescate de los casos de la rama nube, adaptados a la API de hoy
 * (`vozDePersona`). Se descartan los que probaban la precedencia
 * agente > personalidad > cerebro > neurona > cuenta y el pin de la cuenta:
 * main cambió ese contrato a propósito (`voice-config.ts` pone la neurona
 * delante de la personalidad y la cuenta ya no fija pin; esos casos viven en
 * `src/lib/aurora/__tests__/motor-activo-jerarquia.test.ts`).
 */
import { afterEach, describe, expect, it } from "vitest";
import { vozDePersona } from "@/lib/aurora/voz-rt";

const CLAVE_VOZ = "starseed.voz-rt.voz";

afterEach(() => {
  window.localStorage.clear();
});

describe("vozDePersona · la identidad por personalidad no se pierde", () => {
  it("ni sin consulta ni sin personalidad se pierde la F1", () => {
    expect(vozDePersona()).toBe("F1");
    expect(vozDePersona(undefined)).toBe("F1");
  });

  it("un pin guardado malformado no borra lo que ya sabía el mapa (F3 de Hermione)", () => {
    window.localStorage.setItem(CLAVE_VOZ, "X99");
    expect(vozDePersona("hermione")).toBe("F3");
  });

  it("aurora se queda en F1 por la personalidad", () => {
    expect(vozDePersona("aurora")).toBe("F1");
  });
});
