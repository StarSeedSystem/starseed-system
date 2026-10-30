/**
 * Puerta de regresión (2026-10-30): añadir un `PermisoMcp` nuevo a `herramientas.ts`
 * sin actualizar `CAPACIDAD_POR_PERMISO` de `ruta.ts` rompía `tsc` en CI (falló el
 * run 41014341072) y, integrado por fuera de la puerta, se colaba en `main`. Aquí se
 * comprueba que TODO permiso de las herramientas de Genesis tiene capacidad asignada.
 */
import { describe, it, expect } from "vitest";
import { HERRAMIENTAS_MCP, type PermisoMcp } from "../herramientas";
import { CAPACIDAD_POR_PERMISO } from "../ruta";
import { CAPACIDADES_AMBITO, type CapacidadAmbito } from "@/lib/mando/ambito";

describe("CAPACIDAD_POR_PERMISO", () => {
  it("cubre TODOS los permisos de las herramientas de Genesis", () => {
    const permisos = new Set<string>(HERRAMIENTAS_MCP.map((h) => h.permiso));
    const declarados = Object.keys(CAPACIDAD_POR_PERMISO);
    for (const permiso of permisos) {
      expect(declarados, `falta capacidad para «${permiso}»`).toContain(permiso);
    }
    expect(declarados.length).toBe(permisos.size);
  });

  it("cada valor es una capacidad de ámbito real (los 12)", () => {
    for (const [permiso, capacidad] of Object.entries(CAPACIDAD_POR_PERMISO)) {
      expect(CAPACIDADES_AMBITO, `«${permiso}» usa «${capacidad}»`).toContain(capacidad);
    }
  });

  it("el permiso nuevo paga con una capacidad de lectura (ver-detalle)", () => {
    expect(CAPACIDAD_POR_PERMISO["variaciones:buscar" as PermisoMcp]).toBe<CapacidadAmbito>("ver-detalle");
  });
});
