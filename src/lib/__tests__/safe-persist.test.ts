import { describe, it, expect } from "vitest";
import { razonDeError, safePersist } from "../astraura/safe-persist";

describe("razonDeError", () => {
  it("extrae el mensaje de un Error", () => {
    expect(razonDeError(new Error("cuota llena"))).toBe("cuota llena");
  });
  it("usa el nombre si el Error no tiene mensaje", () => {
    const e = new Error("");
    e.name = "QuotaExceededError";
    expect(razonDeError(e)).toBe("QuotaExceededError");
  });
  it("acepta cadenas y valores raros sin lanzar", () => {
    expect(razonDeError("modo privado")).toBe("modo privado");
    expect(razonDeError(42)).toBe("42");
    expect(razonDeError(undefined)).toBe("undefined");
  });
  it("recorta cadenas largas", () => {
    expect(razonDeError("x".repeat(500))).toHaveLength(160);
  });
});

describe("safePersist", () => {
  it("devuelve { ok: true } y ejecuta la función cuando no falla", () => {
    let llamada = 0;
    const r = safePersist("prueba:ok", () => { llamada += 1; });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(llamada).toBe(1);
  });
  it("devuelve { ok: false, reason } con telemetría cuando falla", () => {
    let eventos = 0;
    const listener = () => { eventos += 1; };
    if (typeof window !== "undefined") {
      window.addEventListener("starseed:diagnostico", listener);
    }
    const r = safePersist("prueba:falla", () => { throw new Error("disco lleno"); });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("disco lleno");
    if (typeof window !== "undefined") {
      expect(eventos).toBe(1);
      window.removeEventListener("starseed:diagnostico", listener);
    }
  });
  it("nunca lanza, aunque lance la función envuelta", () => {
    expect(() => safePersist("prueba:tipo", () => { throw "tipo raro"; })).not.toThrow();
  });
});
