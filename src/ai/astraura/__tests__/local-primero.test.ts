import { describe, it, expect } from "vitest";
import { EMPUJON_LOCAL, localPrimeroDelta, migrarLocalPrimero } from "../local-primero";

const base = {
  tier: "local",
  sourceId: "ollama",
  difficulty: 0.2,
  needsVision: false,
  strongThreshold: 0.6,
  preferirLocal: true,
};

describe("localPrimeroDelta", () => {
  it("empuja +4 a una fuente local normal", () => {
    expect(localPrimeroDelta(base)).toEqual({ delta: EMPUJON_LOCAL, note: "local primero" });
  });

  it("da 0 a una fuente de nube", () => {
    expect(localPrimeroDelta({ ...base, tier: "free" }).delta).toBe(0);
  });

  it("da 0 a las fuentes del sistema 1.58 (ya tienen su boost propio)", () => {
    expect(localPrimeroDelta({ ...base, sourceId: "astraura-158-local" }).delta).toBe(0);
  });

  it("da 0 en tareas de visión", () => {
    expect(localPrimeroDelta({ ...base, needsVision: true }).delta).toBe(0);
  });

  it("da 0 en tareas difíciles (>= strongThreshold)", () => {
    expect(localPrimeroDelta({ ...base, difficulty: 0.6 }).delta).toBe(0);
  });

  it("da 0 con preferirLocal apagado", () => {
    expect(localPrimeroDelta({ ...base, preferirLocal: false }).delta).toBe(0);
  });
});

describe("migrarLocalPrimero", () => {
  it("apaga omniRoute una sola vez y conserva el endpoint", () => {
    const p = { omniRoute: { enabled: true, endpoint: "http://localhost:20128", compressionHint: true } };
    const m = migrarLocalPrimero(p);
    expect(m.migracionLocal).toBe(1);
    expect(m.omniRoute).toEqual({ enabled: false, endpoint: "http://localhost:20128", compressionHint: true });
    expect(p.omniRoute.enabled).toBe(true); // no muta el original
  });

  it("funciona sin omniRoute previo", () => {
    const m = migrarLocalPrimero({});
    expect(m.omniRoute).toEqual({ enabled: false });
    expect(m.migracionLocal).toBe(1);
  });

  it("es idempotente con migracionLocal 1", () => {
    const p = { migracionLocal: 1, omniRoute: { enabled: true } };
    expect(migrarLocalPrimero(p)).toBe(p);
  });
});
