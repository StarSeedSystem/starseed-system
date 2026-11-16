/**
 * El catch de `auroraTranscript` deja de ser mudo sin inundar la consola.
 *
 * Solo se prueban las dos funciones puras que deciden el aviso: la huella del
 * fallo (tipo, jamás el mensaje, que puede llevar la voz de la persona) y si
 * toca avisar (solo cuando cambia el tipo, porque el sondeo va cada 550 ms).
 */
import { describe, expect, it } from "vitest";

import { debeAvisarFallo, huellaDeFallo } from "../aurora-guide-voice";

describe("huellaDeFallo", () => {
  it("usa el nombre del error y nunca su mensaje", () => {
    const huella = huellaDeFallo(new Error("mi voz privada"));
    expect(huella).toBe("Error");
    expect(huella).not.toContain("privada");
  });

  it("conserva el nombre propio de un error de tipo", () => {
    expect(huellaDeFallo(new TypeError("dato sensible"))).toBe("TypeError");
  });

  it("describe lo que no es un Error sin lanzar", () => {
    expect(huellaDeFallo(null)).toBe("null");
    expect(huellaDeFallo(undefined)).toBe("undefined");
    expect(huellaDeFallo("texto")).toBe("string");
  });
});

describe("debeAvisarFallo", () => {
  it("avisa la primera vez y calla si el tipo se repite", () => {
    expect(debeAvisarFallo(null, new Error("uno"))).toBe(true);
    expect(debeAvisarFallo("Error", new Error("dos"))).toBe(false);
  });

  it("vuelve a avisar cuando cambia el tipo de fallo", () => {
    expect(debeAvisarFallo("Error", new TypeError("otro"))).toBe(true);
  });
});
