// Decisión pura de auto-actualización (Adenda 111 · pendiente «Auto-actualización efectiva»):
// qué se aplica sola cuando `autoUpdate` está ON y qué NO se toca nunca (lo que la persona fijó
// a mano). Solo funciones puras: sin red, sin disco, sin procesos.
import { describe, expect, it } from "vitest";

import { queAplicar, type EntradaAutoActualizar } from "@/lib/astraura/auto-actualizar-modelos";

function entrada(extra: Partial<EntradaAutoActualizar> = {}): EntradaAutoActualizar {
  return {
    autoUpdate: true,
    seleccionActual: { id: "kokoro", manual: false, label: "Kokoro" },
    topNuevo: { id: "webllm", label: "WebLLM (Llama/Qwen 3B)" },
    vistos: [],
    ...extra,
  };
}

describe("queAplicar", () => {
  it("con la auto-actualización apagada no cambia nada", () => {
    const d = queAplicar(entrada({ autoUpdate: false }));
    expect(d.aplicar).toBe(false);
    expect(d.id).toBeNull();
    expect(d.motivo).toBe("auto-desactivado");
  });

  it("aplica el top nuevo sin intervención cuando está encendida", () => {
    const d = queAplicar(entrada());
    expect(d.aplicar).toBe(true);
    expect(d.id).toBe("webllm");
    expect(d.motivo).toBe("mejora");
    expect(d.detalle).toContain("WebLLM");
  });

  it("nunca cambia lo que la persona fijó a mano", () => {
    const d = queAplicar(
      entrada({ seleccionActual: { id: "openvoice", manual: true, label: "OpenVoice" } }),
    );
    expect(d.aplicar).toBe(false);
    expect(d.id).toBeNull();
    expect(d.motivo).toBe("fijado-a-mano");
    expect(d.detalle).toContain("OpenVoice");
  });

  it("no hace nada si el top ya es la selección vigente", () => {
    const d = queAplicar(
      entrada({ seleccionActual: { id: "webllm", manual: false }, topNuevo: { id: "webllm" } }),
    );
    expect(d.aplicar).toBe(false);
    expect(d.id).toBeNull();
    expect(d.motivo).toBe("ya-seleccionado");
  });

  it("no repite un top que ya se había visto", () => {
    const d = queAplicar(entrada({ vistos: ["webllm"] }));
    expect(d.aplicar).toBe(false);
    expect(d.id).toBeNull();
    expect(d.motivo).toBe("ya-visto");
  });

  it("sin recomendación nueva no hay nada que aplicar", () => {
    expect(queAplicar(entrada({ topNuevo: null })).motivo).toBe("sin-recomendacion");
    expect(queAplicar(entrada({ topNuevo: { id: "  " } })).motivo).toBe("sin-recomendacion");
  });

  it("sin selección vigente aplica el top (primera configuración)", () => {
    const d = queAplicar(entrada({ seleccionActual: null }));
    expect(d.aplicar).toBe(true);
    expect(d.id).toBe("webllm");
  });

  it("es pura: no muta la lista de vistos", () => {
    const vistos = ["kokoro"];
    const d = queAplicar(entrada({ vistos }));
    expect(d.aplicar).toBe(true);
    expect(vistos).toEqual(["kokoro"]);
  });

  it("sin autoUpdate explícito se comporta como encendida (defecto del OS)", () => {
    const d = queAplicar(entrada({ autoUpdate: undefined }));
    expect(d.aplicar).toBe(true);
    expect(d.motivo).toBe("mejora");
  });

  it("compara los ids sin distinguir mayúsculas ni espacios", () => {
    const d = queAplicar(
      entrada({ seleccionActual: { id: " WebLLM " }, topNuevo: { id: "webllm" } }),
    );
    expect(d.aplicar).toBe(false);
    expect(d.motivo).toBe("ya-seleccionado");
  });
});
