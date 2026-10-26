// Protomolécula · «próximamente» visto desde la LIBRERÍA (nivel item real).
// El puente de la nube (rama nube/40254797821) trajo dos casos que main no tenía:
// el contrato de los items `proto-*` de la Biblioteca para las herramientas
// «próximamente» del catálogo REAL (no sintético). Rescata RTOPS1024B.
//
// Módulos puros: fichasProtomolecula + listProtoLibraryItems (sin disco).

import { describe, it, expect } from "vitest";
import { listProtoLibraryItems } from "@/lib/library/oss-catalog-bridge";
import {
  CATALOGO_PROTOMOLECULA,
  CATEGORIAS_PROTOMOLECULA,
} from "../catalogo-herramientas";

describe("«próximamente» en la Librería (contrato de items proto-*)", () => {
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
