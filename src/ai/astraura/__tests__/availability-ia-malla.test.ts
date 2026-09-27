/**
 * (Ola 368) Disponibilidad de la fuente genérica `ia-malla`: SIEMPRE
 * `ready:false` en el ranking automático — solo se usa como candidato MANUAL
 * en los dos casos que documenta `router.ts` (pin no listo aquí servido por
 * un peer / último recurso). También cubre el snapshot barato que alimenta
 * la ficha de la malla de neuronas (`fuentesServibles`).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { detectAvailability } from "@/ai/astraura/availability";
import { IA_MALLA_SOURCE_ID } from "@/ai/astraura/free-catalog";
import { fuentesListasSnapshot, reiniciarFuentesListasSnapshotParaTests } from "@/ai/astraura/ready-sources-snapshot";

describe("disponibilidad de ia-malla", () => {
  it("nunca aparece lista en el ranking automático, con el motivo honesto", async () => {
    const lista = await detectAvailability(true);
    const ia = lista.find((a) => a.source.id === IA_MALLA_SOURCE_ID);
    expect(ia).toBeTruthy();
    expect(ia!.ready).toBe(false);
    expect(ia!.reason).toBe("Solo se usa como pin de la malla o último recurso (ver capas → mesh).");
  });

  it("el catálogo la conserva (para que la UI y findSource la vean)", async () => {
    const lista = await detectAvailability(true);
    expect(lista.some((a) => a.source.id === IA_MALLA_SOURCE_ID)).toBe(true);
  });
});

describe("fuentesListasSnapshot (Ola 368)", () => {
  beforeEach(() => reiniciarFuentesListasSnapshotParaTests());

  it("empieza vacío antes de cualquier sondeo", () => {
    expect(fuentesListasSnapshot()).toEqual({ ids: [], at: 0 });
  });

  it("detectAvailability publica los ids ready de esta pasada, sin incluir ia-malla", async () => {
    await detectAvailability(true);
    const snap = fuentesListasSnapshot();
    expect(snap.at).toBeGreaterThan(0);
    expect(snap.ids).not.toContain(IA_MALLA_SOURCE_ID);
  });
});
