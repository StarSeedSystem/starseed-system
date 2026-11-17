import { describe, expect, it } from "vitest";
import { SKILL_CAPABILITIES } from "@/ai/astraura/skills";
import {
  HERRAMIENTA_TRADUCTOR,
  HERRAMIENTAS_ASTRAURA_VIVO,
  alternarHerramienta,
} from "@/lib/astraura/chat-herramientas";

describe("herramienta Traductor universal", () => {
  it("está en el catálogo de herramientas vivo una sola vez", () => {
    const ids = HERRAMIENTAS_ASTRAURA_VIVO.map((h) => h.id);
    expect(ids).toContain("traductor-universal");
    expect(ids.filter((id) => id === "traductor-universal")).toHaveLength(1);
  });

  it("tiene los campos pedidos y no choca con las capacidades", () => {
    expect(HERRAMIENTA_TRADUCTOR).toMatchObject({
      id: "traductor-universal",
      label: "Traductor universal",
      defaultOn: true,
      packageIds: ["app-traductor"],
    });
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("otro idioma");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("traducir");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt).toContain("varias personas");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt.toLowerCase()).toContain("fall");
    expect(HERRAMIENTA_TRADUCTOR.systemPrompt.toLowerCase()).toContain("invent");

    const idsCapacidades = new Set(SKILL_CAPABILITIES.map((c) => c.id));
    expect(idsCapacidades.has(HERRAMIENTA_TRADUCTOR.id)).toBe(false);
  });

  it("se puede activar y desactivar con alternarHerramienta", () => {
    const catalogo = HERRAMIENTAS_ASTRAURA_VIVO.map((h) => h.id);
    const sinTraductor = alternarHerramienta(undefined, catalogo, "traductor-universal");
    expect(sinTraductor).not.toBeUndefined();
    expect(sinTraductor).not.toContain("traductor-universal");

    const conTraductor = alternarHerramienta(sinTraductor, catalogo, "traductor-universal");
    expect(conTraductor).toBeUndefined();
  });
});
