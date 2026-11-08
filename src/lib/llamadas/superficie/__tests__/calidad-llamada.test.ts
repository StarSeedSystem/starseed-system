import { describe, expect, it } from "vitest";
import { caudalKbps, resumirCalidadLlamada } from "../calidad-llamada";

describe("calidad de la llamada (LLA1108C)", () => {
  it("caudal a partir de bytes acumulados", () => {
    expect(caudalKbps({ bytes: 0, en: 0 }, { bytes: 125_000, en: 1000 })).toBe(1000);
    expect(caudalKbps(null, { bytes: 5, en: 1 })).toBeNull();
    expect(caudalKbps({ bytes: 10, en: 5 }, { bytes: 5, en: 9 })).toBeNull();
  });
  it("buena por red local y cifrada", () => {
    const r = resumirCalidadLlamada({ ruta: "misma-red-local", rttMs: 12, bitrateKbps: 48, perdidaPct: 0, jitterMs: 3, codec: "opus", cifrado: "cifrado" });
    expect(r.calidad).toBe("buena");
    expect(r.barras).toBe(4);
    expect(r.filas.find((f) => f.clave === "medio")?.valor).toBe("misma red local");
    expect(r.filas.find((f) => f.clave === "cifrado")).toMatchObject({ valor: "cifrado de extremo a extremo", nivel: "ok" });
    expect(r.texto).toMatch(/cifrada/);
  });
  it("sin medidas: todo «sin medir», sin inventar", () => {
    const r = resumirCalidadLlamada({ ruta: null, rttMs: null, bitrateKbps: null, perdidaPct: null, jitterMs: null, codec: null, cifrado: null });
    expect(r.calidad).toBe("desconocida");
    expect(r.filas.every((f) => f.valor === "sin medir")).toBe(true);
  });
  it("TURN con pérdida alta avisa y sin cifrar es mal", () => {
    const r = resumirCalidadLlamada({ ruta: "reenviado-turn", rttMs: 420, bitrateKbps: 20, perdidaPct: 12, jitterMs: 80, codec: "opus", cifrado: "sin-cifrar" });
    expect(r.calidad).toBe("mala");
    expect(r.filas.find((f) => f.clave === "perdida")?.nivel).toBe("mal");
    expect(r.filas.find((f) => f.clave === "medio")?.nivel).toBe("aviso");
    expect(r.filas.find((f) => f.clave === "cifrado")?.nivel).toBe("mal");
  });
});
