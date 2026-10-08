/**
 * LOCAL PRIMERO (Ola 1003 · §19 «Local preferente», decisión de Alex
 * 2026-10-03): pruebas de las funciones puras de `local-primero.ts` —
 * el empujón aditivo a las fuentes LOCALES genéricas del catálogo y la
 * migración de una sola vez que apaga OmniRoute por defecto. Sin red ni disco.
 */
import { describe, expect, it } from "vitest";
import {
  EMPUJON_LOCAL,
  localPrimeroDelta,
  migrarLocalPrimero,
} from "@/ai/astraura/local-primero";

/** Caso base: fuente LOCAL genérica en una tarea cotidiana, sin visión. */
const base = {
  sourceId: "ollama-local",
  difficulty: 0.1,
  needsVision: false,
  strongThreshold: 0.6,
  preferirLocal: true,
};

describe("localPrimeroDelta (empujón a las fuentes locales genéricas)", () => {
  it("fuente LOCAL normal: empujón pleno con nota transparente", () => {
    const r = localPrimeroDelta({ ...base, tier: "local" });
    expect(r.delta).toBe(EMPUJON_LOCAL);
    expect(r.delta).toBe(4);
    expect(r.note).toBe("local primero");
  });

  it("fuente de NUBE (tier no local): sin empujón", () => {
    expect(localPrimeroDelta({ ...base, tier: "free-key", sourceId: "openrouter-free" })).toEqual({ delta: 0 });
    expect(localPrimeroDelta({ ...base, tier: "instant", sourceId: "astraura-158-nube" })).toEqual({ delta: 0 });
  });

  it("fuente 1.58: sin empujón (ya tiene su propio boost en local158PriorityDelta)", () => {
    expect(localPrimeroDelta({ ...base, tier: "local", sourceId: "astraura-158-local" })).toEqual({ delta: 0 });
    expect(localPrimeroDelta({ ...base, tier: "local", sourceId: "astraura-158-malla" })).toEqual({ delta: 0 });
  });

  it("tarea de VISIÓN: sin empujón, aunque la fuente sea local y la dificultad baja", () => {
    expect(localPrimeroDelta({ ...base, tier: "local", needsVision: true })).toEqual({ delta: 0 });
  });

  it("tarea DIFÍCIL (difficulty >= strongThreshold): sin empujón, manda la nube fuerte", () => {
    expect(localPrimeroDelta({ ...base, tier: "local", difficulty: 0.6 })).toEqual({ delta: 0 });
    expect(localPrimeroDelta({ ...base, tier: "local", difficulty: 0.9, strongThreshold: 0.7 })).toEqual({ delta: 0 });
  });

  it("preferirLocal apagado por el usuario: sin empujón en ningún caso", () => {
    expect(localPrimeroDelta({ ...base, tier: "local", preferirLocal: false })).toEqual({ delta: 0 });
  });
});

describe("migrarLocalPrimero (migración de una sola vez)", () => {
  it("apaga OmniRoute una sola vez y deja la marca migracionLocal", () => {
    const antes = {
      omniRoute: { enabled: true, endpoint: "http://localhost:20128", compressionHint: true },
    };
    const r = migrarLocalPrimero(antes);
    expect(r.migracionLocal).toBe(1);
    expect(r.omniRoute).toMatchObject({ enabled: false, endpoint: "http://localhost:20128", compressionHint: true });
  });

  it("conserva el endpoint y el resto de ajustes intactos", () => {
    const r = migrarLocalPrimero({
      mode: "auto",
      freeFirst: true,
      omniRoute: { enabled: true, endpoint: "http://192.168.1.50:20128" },
});

  
    expect((r.omniRoute as Record<string, unknown>).endpoint).toBe("http://192.168.1.50:20128");
    expect(r.mode).toBe("auto");
    expect(r.freeFirst).toBe(true);
  });

  it("idempotente: con migracionLocal 1 devuelve los ajustes tal cual (sin copiar)", () => {
    const ya = { migracionLocal: 1, omniRoute: { enabled: true, endpoint: "http://localhost:20128" } };
    expect(migrarLocalPrimero(ya)).toBe(ya);
  });

  it("ajustes sin omniRoute: la migración lo crea ya apagado y con la marca", () => {
    const r = migrarLocalPrimero({ mode: "auto" });
    expect(r.migracionLocal).toBe(1);
    expect(r.omniRoute).toEqual({ enabled: false });
  });
});
