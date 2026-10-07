import { describe, it, expect } from "vitest";
import { safePersist, PERSIST_DIAGNOSTIC_EVENT } from "../user-context";

// Rescate RSC1006B: casos de la rama nube/SP09299 adaptados a la API de main
// (safePersist vive en user-context.ts; el motivo es error.name, no el mensaje,
// y el evento de diagnóstico es PERSIST_DIAGNOSTIC_EVENT).

describe("safePersist", () => {
  it("devuelve { ok: true, value } y ejecuta la función cuando no falla", () => {
    let llamada = 0;
    const r = safePersist("prueba:ok", () => {
      llamada += 1;
      return "hecho";
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("hecho");
    expect(llamada).toBe(1);
  });

  it("devuelve { ok: false, reason } con el nombre del Error y emite diagnóstico", () => {
    let eventos = 0;
    const listener = () => {
      eventos += 1;
    };
    if (typeof window !== "undefined") {
      window.addEventListener(PERSIST_DIAGNOSTIC_EVENT, listener);
    }
    try {
      const r = safePersist("prueba:falla", () => {
        throw new Error("disco lleno");
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("Error");
      if (typeof window !== "undefined") expect(eventos).toBe(1);
    } finally {
      if (typeof window !== "undefined") {
        window.removeEventListener(PERSIST_DIAGNOSTIC_EVENT, listener);
      }
    }
  });

  it("nunca lanza, aunque la función envuelta lance un valor que no es Error", () => {
    expect(() =>
      safePersist("prueba:tipo", () => {
        throw "tipo raro";
      }),
    ).not.toThrow();
    const r = safePersist("prueba:tipo", () => {
      throw "tipo raro";
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("Error desconocido");
  });

  it("resuelve promesas: { ok: true, value } cuando la función asíncrona funciona", async () => {
    const r = await safePersist("prueba:async-ok", async () => 42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it("rechazo de promesa: { ok: false, reason } sin lanzar", async () => {
    const r = await safePersist("prueba:async-falla", async () => {
      throw new Error("red caída");
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("Error");
  });
});
