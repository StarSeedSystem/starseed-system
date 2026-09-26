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
import { debeSaltarTrasTimeout, minutosDeEnfriamiento, viaDeRespuesta158 } from "@/ai/astraura/router";
import {
  ASTRAURA_158_CLOUD_SOURCE_ID,
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

describe("catálogo de la nube 1.58 (G3 · 2026-09-26)", () => {
  it("la nube tiene timeout ≥ 200 s y gracia de primer token ≥ 120 s", () => {
    const src = findSource(ASTRAURA_158_CLOUD_SOURCE_ID) as {
      timeoutMs?: number;
      firstTokenGraceMs?: number;
    };
    expect(src).toBeDefined();
    expect(src.timeoutMs ?? 0).toBeGreaterThanOrEqual(200_000);
    expect(src.firstTokenGraceMs ?? 0).toBeGreaterThanOrEqual(120_000);
  });

  it("un timeout de la NUBE también cuenta para el salto (antes solo el local)", () => {
    const fallos = new Map<string, number>([[ASTRAURA_158_CLOUD_SOURCE_ID, 1]]);
    expect(debeSaltarTrasTimeout(ASTRAURA_158_CLOUD_SOURCE_ID, fallos)).toBe(true);
    expect(debeSaltarTrasTimeout(ASTRAURA_158_LOCAL_SOURCE_ID, fallos)).toBe(false);
  });
});

describe("viaDeRespuesta158 (G6 · 2026-09-26)", () => {
  it("extrae la vía honesta de una fuente 1.58 con `raw.via`", () => {
    expect(viaDeRespuesta158(ASTRAURA_158_CLOUD_SOURCE_ID, { raw: { via: "nube" } })).toBe("nube");
    expect(viaDeRespuesta158(ASTRAURA_158_CLOUD_SOURCE_ID, { raw: { via: "local-respaldo" } })).toBe("local-respaldo");
    expect(viaDeRespuesta158(ASTRAURA_158_LOCAL_SOURCE_ID, { raw: { via: "local" } })).toBe("local");
  });

  it("ninguna otra fuente (no-1.58) devuelve vía, aunque el `raw` la traiga", () => {
    expect(viaDeRespuesta158("openrouter-free", { raw: { via: "nube" } })).toBeUndefined();
  });

  it("defensiva: sin `raw`, con `raw` vacío o con un valor desconocido → undefined", () => {
    expect(viaDeRespuesta158(ASTRAURA_158_CLOUD_SOURCE_ID, null)).toBeUndefined();
    expect(viaDeRespuesta158(ASTRAURA_158_CLOUD_SOURCE_ID, {})).toBeUndefined();
    expect(viaDeRespuesta158(ASTRAURA_158_CLOUD_SOURCE_ID, { raw: { via: "otra-cosa" } })).toBeUndefined();
  });
});

describe("minutosDeEnfriamiento (G10 · 2026-09-26)", () => {
  it("le hace caso EXACTO al `retry after N s/m/h` del proveedor", () => {
    expect(minutosDeEnfriamiento("429: retry after 90 seconds")).toBe(2); // ceil(90/60)
    expect(minutosDeEnfriamiento("retry in 4m")).toBe(4);
    expect(minutosDeEnfriamiento("retry after 2h")).toBe(120);
  });

  it("cupo diario (`per-day`/`daily`) → minutos hasta ~medianoche UTC, con suelo de 10", () => {
    // 23:50 UTC del 2026-09-26 → 10 min hasta medianoche.
    const ahora = Date.UTC(2026, 8, 26, 23, 50, 0);
    expect(minutosDeEnfriamiento("free-models-per-day quota exceeded", ahora)).toBe(10);
    // A medianoche justa faltan las 24h enteras hasta la SIGUIENTE medianoche.
    const medianoche = Date.UTC(2026, 8, 26, 0, 0, 0);
    expect(minutosDeEnfriamiento("daily limit", medianoche)).toBe(24 * 60);
  });

  it("«ocupado» SIEMPRE topa a 5 min, aunque el mensaje no traiga una pista", () => {
    expect(minutosDeEnfriamiento("Astraura 1.58 ocupado (cola): retry after 3000s")).toBe(5);
    expect(minutosDeEnfriamiento("Astraura 1.58 ocupado (memoria): retry after 30s")).toBe(1);
    expect(minutosDeEnfriamiento("Astraura 1.58 ocupado: sin pista de tiempo")).toBe(5);
  });

  it("sin ninguna pista → undefined (el llamador usa el cooldown del catálogo)", () => {
    expect(minutosDeEnfriamiento("HTTP 429: too many requests")).toBeUndefined();
  });
});