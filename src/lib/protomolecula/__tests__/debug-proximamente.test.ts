// Protomolécula · Contrato de las fichas «próximamente» en la Biblioteca.
// Rescate de la rama nube/40254797821 (OPS1024B): lo que aún no corre no
// puede anunciarse como verificado, y toda ficha llega con licencia, grupo
// y enlaces tal como están en el catálogo.

import { describe, it, expect } from "vitest";
import {
  CATALOGO_PROTOMOLECULA,
  CATEGORIAS_PROTOMOLECULA,
} from "@/lib/protomolecula/catalogo-herramientas";
import { listProtoLibraryItems } from "@/lib/library/oss-catalog-bridge";

describe("catálogo de la Protomolécula en la Biblioteca", () => {
  it("ninguna herramienta «próximamente» se anuncia como verificada", () => {
    const proximas = CATALOGO_PROTOMOLECULA.filter((h) => h.estado === "proximamente");
    expect(proximas.length).toBeGreaterThan(0);

    const items = listProtoLibraryItems();
    for (const herramienta of proximas) {
      const item = items.find((i) => i.id === `proto-${herramienta.id}`);
      expect(item).toBeDefined();
      expect(item!.verified).toBe(false);
      expect(item!.description).toContain(`próximamente: ${herramienta.motivo}`);
    }
  });

  it("una herramienta del catálogo llega con su licencia, su grupo y sus enlaces", () => {
    const herramienta = CATALOGO_PROTOMOLECULA.find(
      (h) => h.estado === "proximamente" && h.web !== null && h.codigo !== null,
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
