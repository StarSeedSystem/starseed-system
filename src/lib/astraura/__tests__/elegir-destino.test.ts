/**
 * (Ola 278 · OS6 · ampliado G1 2026-09-26) Tests PUROS de la decisión de
 * destino del proxy de Astraura 1.58: `elegirDestino` (local · nube ·
 * local-respaldo · sin destino) y `debeRechazarLocalNoDisponible` (el 421
 * honesto cuando piden la neurona local en un despliegue que no lo es).
 * Sin red, sin `NextRequest`: solo el módulo puro.
 */
import { describe, expect, it } from "vitest";
import { debeRechazarLocalNoDisponible, elegirDestino } from "@/lib/astraura/elegir-destino";

const BASE_NUBE = "https://uno.trycloudflare.com";
const BASE_LOCAL = "http://127.0.0.1:8000";

describe("elegirDestino", () => {
  it("(a) piden local y el despliegue ES local → neurona local, aunque haya nube sana", () => {
    expect(elegirDestino({ pedido: "local", local: true, baseNube: BASE_NUBE, baseLocal: BASE_LOCAL })).toEqual({
      base: BASE_LOCAL,
      via: "local",
    });
  });

  it("(b) hay nube sana → nube (también si piden local mientras no es un despliegue local)", () => {
    expect(elegirDestino({ pedido: "nube", local: false, baseNube: BASE_NUBE, baseLocal: BASE_LOCAL })).toEqual({
      base: BASE_NUBE,
      via: "nube",
    });
    expect(elegirDestino({ pedido: "local", local: false, baseNube: BASE_NUBE, baseLocal: BASE_LOCAL })).toEqual({
      base: BASE_NUBE,
      via: "nube",
    });
  });

  it("(c) sin nube pero el despliegue ES local → respaldo a la neurona local", () => {
    expect(elegirDestino({ pedido: "nube", local: true, baseNube: null, baseLocal: BASE_LOCAL })).toEqual({
      base: BASE_LOCAL,
      via: "local-respaldo",
    });
  });

  it("(d) ni nube ni local → null", () => {
    expect(elegirDestino({ pedido: "nube", local: false, baseNube: null, baseLocal: BASE_LOCAL })).toBeNull();
    expect(elegirDestino({ pedido: "local", local: true, baseNube: null, baseLocal: "" })).toBeNull();
  });
});

describe("debeRechazarLocalNoDisponible (G1)", () => {
  it("piden local y el despliegue NO es local → true (421)", () => {
    expect(debeRechazarLocalNoDisponible("local", false)).toBe(true);
  });

  it("piden local y el despliegue SÍ es local → false (se resuelve normal)", () => {
    expect(debeRechazarLocalNoDisponible("local", true)).toBe(false);
  });

  it("piden nube, con o sin despliegue local → false siempre", () => {
    expect(debeRechazarLocalNoDisponible("nube", false)).toBe(false);
    expect(debeRechazarLocalNoDisponible("nube", true)).toBe(false);
  });
});
