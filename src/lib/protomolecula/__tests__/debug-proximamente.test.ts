// Protomolécula · Puente catálogo → Biblioteca sobre el catálogo REAL.
// Contrato de honestidad radical: lo que no corre todavía nunca se anuncia
// como verificado, y su ficha dice por qué («próximamente: <motivo>»).

import { describe, it, expect } from "vitest";
import { listProtoLibraryItems } from "@/lib/library/oss-catalog-bridge";
import { CATALOGO_PROTOMOLECULA, CATEGORIAS_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";
import type { HerramientaProto } from "@/lib/protomolecula/catalogo-herramientas";

describe("puente a la Biblioteca · herramientas «proximamente»", () => {
  it("ninguna herramienta «proximamente» se anuncia como verificada", () => {
    const proximas = CATALOGO_PROTOMOLECULA.filter((h) => h.estado === "proximamente");
    expect(proximas.length).toBeGreaterThan(0);

    const items = listProtoLibraryItems();
    for (const herramienta of proximas) {
      const item = items.find((i) => i.id === `proto-${herramienta.id}`);
      expect(item, `sin ficha en la Biblioteca: ${herramienta.id}`).toBeDefined();
      expect(item?.verified).toBe(false);
      expect(item?.description).toContain(`próximamente: ${herramienta.motivo}`);
    }
  });
});

describe("puente a la Biblioteca · ficha completa de una herramienta", () => {
  it("una herramienta del catálogo llega con su licencia, su grupo y sus enlaces", () => {
    const herramienta = CATALOGO_PROTOMOLECULA.find(
      (h): h is HerramientaProto => h.estado === "proximamente" && h.web !== null && h.codigo !== null,
    );
    expect(herramienta).toBeDefined();

    const item = listProtoLibraryItems().find((i) => i.id === `proto-${herramienta!.id}`);
    expect(item).toBeDefined();
    expect(item!.title).toBe(herramienta!.nombre);
    expect(item!.category).toBe("protomolecula");
    expect(item!.license).toBe(herramienta!.licencia);

    const grupo = CATEGORIAS_PROTOMOLECULA.find((c) => c.id === herramienta!.categoria)?.grupo;
    expect(grupo).toBeDefined();
    expect(item!.tags).toContain("protomolecula");
    expect(item!.tags).toContain(grupo);
    expect(item!.links?.find((l) => l.label === "Web oficial")?.url).toBe(herramienta!.web);
    expect(item!.links?.find((l) => l.label === "Repositorio")?.url).toBe(herramienta!.codigo);
  });
});