/**
 * PRIORIDAD LOCAL de Astraura 1.58-bit (BitNet · Needle · Jev) — pref
 * `prioridadLocal158` (por defecto ON). Cubre:
 *   · `local158PriorityDelta` (función pura): boost por fuente/tarea.
 *   · `rankCandidates`: con/sin la pref, tarea difícil sigue prefiriendo la
 *     nube fuerte, y el override manual por tarea sigue ganando siempre.
 * Sin red: solo código puro sobre el catálogo real (`FREE_CATALOG`).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTELLIGENCE,
  local158PriorityDelta,
  rankCandidates,
  type TaskProfile,
} from "@/ai/astraura/router";
import {
  ASTRAURA_158_CLOUD_SOURCE_ID,
  ASTRAURA_158_LOCAL_SOURCE_ID,
  findSource,
} from "@/ai/astraura/free-catalog";
import type { SourceAvailability } from "@/ai/astraura/availability";

function profile(overrides: Partial<TaskProfile> = {}): TaskProfile {
  return { kind: "chat", needsVision: false, chars: 40, difficulty: 0.1, ...overrides };
}

function ready(sourceId: string): SourceAvailability {
  const source = findSource(sourceId);
  if (!source) throw new Error(`fuente de prueba desconocida: ${sourceId}`);
  return { source, ready: true };
}

describe("local158PriorityDelta (función pura)", () => {
  it("no toca fuentes que NO son Astraura 1.58", () => {
    expect(local158PriorityDelta("openrouter-free", 0.1, false, 0.6)).toEqual({ delta: 0 });
    expect(local158PriorityDelta("groq-free", 0.1, false, 0.6)).toEqual({ delta: 0 });
  });

  it("boost fuerte para el 1.58 LOCAL en tarea normal, con nota transparente", () => {
    const r = local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.1, false, 0.6);
    expect(r.delta).toBe(6);
    expect(r.note).toMatch(/Astraura 1\.58 local primero/);
  });

  it("boost menor para el 1.58 NUBE en tarea normal (por debajo del local)", () => {
    const r = local158PriorityDelta(ASTRAURA_158_CLOUD_SOURCE_ID, 0.1, false, 0.6);
    expect(r.delta).toBe(3);
    expect(r.delta).toBeLessThan(local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.1, false, 0.6).delta);
  });

  it("SIN boost en tareas difíciles (difficulty >= strongThreshold): cede a la nube fuerte", () => {
    expect(local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.6, false, 0.6)).toEqual({ delta: 0 });
    expect(local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.9, false, 0.6)).toEqual({ delta: 0 });
    expect(local158PriorityDelta(ASTRAURA_158_CLOUD_SOURCE_ID, 0.75, false, 0.6)).toEqual({ delta: 0 });
  });

  it("SIN boost en tareas de VISIÓN, aunque la dificultad sea baja: el 1.58 no ve imágenes", () => {
    expect(local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.1, true, 0.6)).toEqual({ delta: 0 });
    expect(local158PriorityDelta(ASTRAURA_158_CLOUD_SOURCE_ID, 0.1, true, 0.6)).toEqual({ delta: 0 });
  });

  it("respeta un strongThreshold distinto (clamp 0.3..0.95)", () => {
    // Con un umbral muy bajo (0), CUALQUIER dificultad > 0 ya es "difícil"
    // salvo que el clamp la suba a 0.3 — comprobamos el clamp real.
    const r = local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.29, false, 0);
    expect(r.delta).toBe(6); // 0.29 < 0.3 (umbral tras el clamp) → sigue siendo "normal"
    const r2 = local158PriorityDelta(ASTRAURA_158_LOCAL_SOURCE_ID, 0.31, false, 0);
    expect(r2.delta).toBe(0); // 0.31 >= 0.3 → ya es "difícil"
  });
});

describe("rankCandidates · prioridad local 1.58 (con catálogo real)", () => {
  it("con la pref ON, Astraura 1.58 local gana un turno de chat normal frente a OpenRouter :free", () => {
    const avail = [ready(ASTRAURA_158_LOCAL_SOURCE_ID), ready("openrouter-free")];
    const p = profile();

    const off = rankCandidates(p, avail, { ...DEFAULT_INTELLIGENCE, prioridadLocal158: false });
    const on = rankCandidates(p, avail, { ...DEFAULT_INTELLIGENCE, prioridadLocal158: true });

    const localOff = off.find((c) => c.source.id === ASTRAURA_158_LOCAL_SOURCE_ID);
    const localOn = on.find((c) => c.source.id === ASTRAURA_158_LOCAL_SOURCE_ID);
    const rivalOff = off.find((c) => c.source.id === "openrouter-free");
    const rivalOn = on.find((c) => c.source.id === "openrouter-free");
    expect(localOff && localOn && rivalOff && rivalOn).toBeTruthy();

    // El boost SOLO toca la puntuación del 1.58: el rival no se mueve.
    expect(rivalOn!.score).toBe(rivalOff!.score);
    // Y el 1.58 local sube EXACTAMENTE el delta declarado por `local158PriorityDelta`.
    expect(localOn!.score - localOff!.score).toBe(6);

    // Con la pref ON, la local pasa por delante del mejor `:free` de la nube
    // (antes competían casi empatados) y encabeza el ranking.
    expect(localOn!.score).toBeGreaterThan(rivalOn!.score);
    expect(on[0].source.id).toBe(ASTRAURA_158_LOCAL_SOURCE_ID);
    expect(on[0].local158Priority).toBe(true);
  });

  it("la nube StarSeed (1.58) también sube sobre la nube gratis genérica cuando la local no está lista", () => {
    const avail = [ready(ASTRAURA_158_CLOUD_SOURCE_ID), ready("openrouter-free")];
    const p = profile();
    const on = rankCandidates(p, avail, { ...DEFAULT_INTELLIGENCE, prioridadLocal158: true });
    expect(on[0].source.id).toBe(ASTRAURA_158_CLOUD_SOURCE_ID);
    expect(on[0].local158Priority).toBe(true);
  });

  it("con la pref OFF, el comportamiento es IDÉNTICO al de antes (delta 0, sin marca de transparencia)", () => {
    const avail = [ready(ASTRAURA_158_LOCAL_SOURCE_ID), ready("openrouter-free")];
    const p = profile();
    const off = rankCandidates(p, avail, { ...DEFAULT_INTELLIGENCE, prioridadLocal158: false });
    const localOff = off.find((c) => c.source.id === ASTRAURA_158_LOCAL_SOURCE_ID)!;
    expect(localOff.local158Priority).toBeUndefined();
  });

  it("tarea DIFÍCIL: la nube fuerte sigue ganando aunque la pref esté ON (no revierte el enrutado por dificultad)", () => {
    const avail = [ready(ASTRAURA_158_LOCAL_SOURCE_ID), ready("nvidia-nim")];
    const p = profile({ kind: "reasoning", difficulty: 0.85 });
    const on = rankCandidates(p, avail, { ...DEFAULT_INTELLIGENCE, prioridadLocal158: true, strongThreshold: 0.6 });
    expect(on[0].source.id).toBe("nvidia-nim");
    expect(on[0].source.id).not.toBe(ASTRAURA_158_LOCAL_SOURCE_ID);
  });

  it("el override manual por tarea sigue ganando SIEMPRE, con la pref ON", () => {
    const avail = [ready(ASTRAURA_158_LOCAL_SOURCE_ID), ready("openrouter-free")];
    const p = profile();
    const on = rankCandidates(p, avail, {
      ...DEFAULT_INTELLIGENCE,
      prioridadLocal158: true,
      perTask: { chat: "openrouter-free::openrouter/free" },
    });
    expect(on[0].source.id).toBe("openrouter-free");
    expect(on[0].model.id).toBe("openrouter/free");
    expect(on[0].reason).toMatch(/Elegido por ti/);
  });
});
