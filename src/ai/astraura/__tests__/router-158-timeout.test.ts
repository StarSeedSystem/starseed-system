/**
 * (Ola 278 · OS2 · 2026-09-08) Tests de la regla «timeout del nativo cuenta
 * como cedido por esta vez»:
 *   · `debeSaltarTrasTimeout` (función pura y exportada del router): devuelve
 *     false la primera vez que una fuente agota su tiempo y true cuando ya hubo
 *     un timeout de esa fuente en la MISMA petición (para que el router pase de
 *     una vez al siguiente candidato sin volver a sondear el nativo 1.58 ni sus
 *     demás modelos).
 *   · El catálogo concede al nativo local el tiempo real que necesita
 *     (medido en la Mac 2026-09-08: 156 s reales ⇒ timeout ≥ 180 s).
 * Sin red: solo importa código puro.
 */
import { describe, expect, it } from "vitest";
import { debeSaltarTrasTimeout } from "@/ai/astraura/router";
import {
  ASTRAURA_158_LOCAL_SOURCE_ID,
  findSource,
} from "@/ai/astraura/free-catalog";

describe("debeSaltarTrasTimeout", () => {
  it("la primera vez devuelve false (aún no agotó su tiempo)", () => {
    expect(debeSaltarTrasTimeout("astraura-158-local", new Map())).toBe(false);
    expect(debeSaltarTrasTimeout("astraura-158-local", {})).toBe(false);
  });

  it("cuando ya hubo un timeout de ESA fuente, devuelve true", () => {
    const conMap = new Map<string, number>([["astraura-158-local", 1]]);
    expect(debeSaltarTrasTimeout("astraura-158-local", conMap)).toBe(true);

    const conRecord: Record<string, number> = { "astraura-158-local": 3 };
    expect(debeSaltarTrasTimeout("astraura-158-local", conRecord)).toBe(true);
  });

  it("un timeout de OTRA fuente no salta esta (fallos por fuente)", () => {
    const fallos = new Map<string, number>([["astraura-158-nube", 2]]);
    expect(debeSaltarTrasTimeout("astraura-158-local", fallos)).toBe(false);
    expect(debeSaltarTrasTimeout("astraura-158-nube", fallos)).toBe(true);
  });
});

describe("catálogo del nativo 1.58 local (Ola 278 · OS2)", () => {
  it("el nativo local tiene un timeout generoso (≥ 180 s)", () => {
    const src = findSource(ASTRAURA_158_LOCAL_SOURCE_ID);
    expect(src).toBeDefined();
    // Medido en la Mac 2026-09-08: una respuesta real tardó 156 s. Con 95 s el
    // nativo perdía siempre y el chat caía a LLM7; ahora le damos tiempo real.
    expect((src as { timeoutMs?: number }).timeoutMs ?? 0).toBeGreaterThanOrEqual(180_000);
  });

  it("el nativo local declara la gracia de primer token", () => {
    const src = findSource(ASTRAURA_158_LOCAL_SOURCE_ID) as {
      firstTokenGraceMs?: number;
    };
    // Si la fuente ya empezó a emitir, el router no la corta por el total:
    // extiende el corte `firstTokenGraceMs` más.
    expect(src.firstTokenGraceMs ?? 0).toBeGreaterThan(0);
  });
});