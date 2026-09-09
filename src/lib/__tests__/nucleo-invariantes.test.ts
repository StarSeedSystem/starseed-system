/**
 * TESTS DEL NÚCLEO INTOCABLE (Ola 307 · tarea zN1)
 *
 * Comprueban la promesa que hace posible editar el OS sin miedo: por muy
 * libre que sea una edición o un paquete compartido, la salida, la identidad,
 * los permisos, la navegación, el voto, la honestidad de los datos y el
 * deshacer siguen ahí.
 */

import { describe, expect, it } from "vitest";

import {
  INVARIANTES,
  esCambioSeguro,
  invariantePorId,
  validarContraInvariantes,
} from "@/lib/nucleo/invariantes";

describe("INVARIANTES", () => {
  it("cada invariante explica de qué protege y en qué superficies vive", () => {
    expect(INVARIANTES.length).toBeGreaterThan(0);
    for (const inv of INVARIANTES) {
      expect(inv.id.trim()).not.toBe("");
      expect(inv.titulo.trim()).not.toBe("");
      expect(inv.porque.trim()).not.toBe("");
      expect(inv.superficies.length).toBeGreaterThan(0);
    }
  });

  it("contiene las siete del rumbo de Alex y no duplica identificadores", () => {
    const ids = INVARIANTES.map((inv) => inv.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "salida-siempre",
        "identidad-soberana",
        "permisos-visibles",
        "navegacion-fundamental",
        "voto-integro",
        "datos-honestos",
        "deshacer",
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("invariantePorId encuentra las conocidas y no inventa las demás", () => {
    expect(invariantePorId("deshacer")?.titulo).toBe("Deshacer garantizado");
    expect(invariantePorId("inexistente")).toBeUndefined();
  });
});

describe("validarContraInvariantes", () => {
  it("ocultar Ajustes viola «salida-siempre» y dice cómo arreglarlo", () => {
    const violaciones = validarContraInvariantes({ ocultaAjustes: true });
    expect(violaciones).toHaveLength(1);
    expect(violaciones[0]?.invariante).toBe("salida-siempre");
    expect(violaciones[0]?.comoArreglarlo.trim()).not.toBe("");
  });

  it("esconder la ruta de Ajustes (o su alias en español) también la viola", () => {
    const porRuta = validarContraInvariantes({ rutasOcultas: ["/settings"] });
    const porAlias = validarContraInvariantes({ rutasOcultas: ["/ajustes"] });
    expect(porRuta.map((v) => v.invariante)).toEqual(["salida-siempre"]);
    expect(porAlias.map((v) => v.invariante)).toEqual(["salida-siempre"]);
  });

  it("quitar el lanzador viola «navegacion-fundamental»", () => {
    const violaciones = validarContraInvariantes({
      superficiesQuitadas: ["src/components/layout/omni-dock.tsx"],
    });
    expect(violaciones.map((v) => v.invariante)).toContain("navegacion-fundamental");
    expect(violaciones).toHaveLength(1);
  });

  it("un cambio inocuo no viola nada", () => {
    const violaciones = validarContraInvariantes({
      rutasOcultas: ["/laboratorio"],
      superficiesQuitadas: ["src/components/backgrounds/aurora.tsx"],
      permisosPedidos: ["leer-tema", "ui:cambiar-colores"],
    });
    expect(violaciones).toEqual([]);
    expect(esCambioSeguro({})).toBe(true);
  });
});

describe("varias violaciones a la vez", () => {
  const paqueteHostil = {
    rutasOcultas: ["/seguridad", "/decisiones"],
    superficiesQuitadas: ["/library"],
    permisosPedidos: ["DESACTIVAR_DESHACER", "ui:datos-simulados-como-reales"],
    ocultaAjustes: true,
  };

  it("las devuelve todas juntas, no solo la primera", () => {
    const violaciones = validarContraInvariantes(paqueteHostil);
    const rotas = new Set(violaciones.map((v) => v.invariante));
    expect(rotas).toEqual(
      new Set([
        "salida-siempre",
        "permisos-visibles",
        "navegacion-fundamental",
        "voto-integro",
        "datos-honestos",
        "deshacer",
      ]),
    );
    expect(esCambioSeguro(paqueteHostil)).toBe(false);
  });

  it("cada violación llega con su reparación y sin repetirse", () => {
    const violaciones = validarContraInvariantes(paqueteHostil);
    for (const v of violaciones) {
      expect(v.que.trim()).not.toBe("");
      expect(v.comoArreglarlo.trim()).not.toBe("");
    }
    const claves = violaciones.map((v) => `${v.invariante}::${v.que}`);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("sigue el orden de INVARIANTES, para que dos revisiones se lean igual", () => {
    const orden = INVARIANTES.map((inv) => inv.id);
    const violaciones = validarContraInvariantes(paqueteHostil);
    const posiciones = violaciones.map((v) => orden.indexOf(v.invariante));
    const ordenadas = [...posiciones].sort((a, b) => a - b);
    expect(posiciones).toEqual(ordenadas);
  });
});
