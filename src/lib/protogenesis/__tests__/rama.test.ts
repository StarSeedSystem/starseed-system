/**
 * TESTS DE Rama · ProtoGenesis PG1013E
 * Cubren las reglas definidas en architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import { describe, it, expect } from "vitest";

import { Molecula, Capa, Parametro, Operacion, Cambio } from "@/lib/protomolecula/tipos";

import { abrirRama, aplicarEnRama, anadirCapa, fusionar, deshacerFusion } from "../rama";

describe("abrirRama", () => {
  it("debe crear una copia, nunca una referencia, de los valores de la molécula", () => {
    const m: Molecula = {
      id: "M001",
      titulo: "Molécula de prueba",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: { "atom1::param1": 10 },
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    const rama = abrirRama(m, "E001");

    expect(rama.encargoId).toBe("E001");
    expect(rama.base).toEqual({ "atom1::param1": 10 });
    expect(rama.valores).toEqual({ "atom1::param1": 10 });
    expect(rama.baseVersion).toBe(1);
    expect(rama.cambios).toEqual([]);
    expect(rama.capasNuevas).toEqual([]);

    rama.valores["atom1::param1"] = 20;

    expect(m.valores["atom1::param1"]).toBe(10);
  });
});

describe("aplicarEnRama", () => {
  it("debe aplicar una operación exacta sobre una rama", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: { "atom1::param1": 10 }, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const p: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };

    const op: Operacion = {
      id: "op1",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "exacta", valor: 20 },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p, op);

    expect(result.ok).toBe(true);
    expect(result.rama.valores).toEqual({ "atom1::param1": 20 });
    expect(result.rama.cambios).toHaveLength(1);
    expect(result.rama.cambios[0].antes).toBe(10);
    expect(result.rama.cambios[0].despues).toBe(20);
  });

  it("debe aplicar una operación relativa sobre una rama", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: { "atom1::param1": 10 }, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const p: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };

    const op: Operacion = {
      id: "op2",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "relativa", cantidad: 5, modo: "delta" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p, op);

    expect(result.ok).toBe(true);
    expect(result.rama.valores).toEqual({ "atom1::param1": 15 });
  });

  it("debe aplicar una operación alternar sobre un booleano", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: { "atom1::param1": true }, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const p: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "booleano" };

    const op: Operacion = {
      id: "op3",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "alternar" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p, op);

    expect(result.ok).toBe(true);
    expect(result.rama.valores).toEqual({ "atom1::param1": false });
  });

  it("debe manejar operaciones de disparo", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: { "atom1::param1": false }, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const p: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "disparo" };

    const op: Operacion = {
      id: "op4",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "disparo" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p, op);

    expect(result.ok).toBe(true);
    expect(result.rama.valores).toEqual({ "atom1::param1": false });
    expect(result.rama.cambios).toHaveLength(1);
    expect(result.rama.cambios[0].antes).toBe(false);
    expect(result.rama.cambios[0].despues).toBe(false);
    expect(result.rama.cambios[0].reversible).toBe(false);
  });

  it("debe rechazar una operación con acción desconocida", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const p: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };

    const op: Operacion = {
      id: "op5",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "desconocido" } as any,
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p, op);

    expect(result.ok).toBe(false);
    expect(result.motivo).toContain("acción de operación no soportada");
  });
});

describe("anadirCapa", () => {
  it("debe añadir una nueva capa a una rama", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const capa: Capa = {
      id: "capa1",
      tipo: "codigo",
      titulo: "Capa de código",
      formato: "javascript",
      referencia: null,
      orden: 1,
      visible: true,
      bloqueada: false,
    };

    const ramaNueva = anadirCapa(rama, capa);

    expect(ramaNueva.capasNuevas).toHaveLength(1);
    expect(ramaNueva.capasNuevas[0].id).toBe("capa1");
    expect(ramaNueva.capasNuevas[0].tipo).toBe("codigo");
    expect(ramaNueva.capasNuevas[0].titulo).toBe("Capa de código");

    expect(rama.capasNuevas).toHaveLength(0);
  });

  it("debe generar un id si no se proporciona uno", () => {
    const rama = abrirRama(
      { id: "", titulo: "", ambito: "personal", capas: [], atomos: [], valores: {}, version: 1, creadaEn: 0, actualizadaEn: 0 },
      "E001"
    );

    const capa: Capa = {
      tipo: "codigo",
      titulo: "Capa sin id",
      formato: "javascript",
      referencia: null,
      orden: 1,
      visible: true,
      bloqueada: false,
    };

    const ramaNueva = anadirCapa(rama, capa);

    expect(ramaNueva.capasNuevas[0].id).toContain("capa-");
  });
});

describe("fusionar", () => {
  it("debe fusionar cambios sin conflictos", () => {
    const m: Molecula = {
      id: "M001",
      titulo: "Molécula",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: { "atom1::param1": 10, "atom2::param2": 20 },
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    const rama = abrirRama(m, "E001");

    const p1: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };
    const p2: Parametro = { id: "param2", nombre: "Parámetro 2", tipo: "numero" };

    const op1: Operacion = {
      id: "op1",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "exacta", valor: 15 },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const op2: Operacion = {
      id: "op2",
      objetivo: { atomoId: "atom2", parametroId: "param2" },
      accion: { tipo: "relativa", cantidad: 5, modo: "delta" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result1 = aplicarEnRama(rama, p1, op1);
    expect(result1.ok).toBe(true);

    const result2 = aplicarEnRama(result1.rama, p2, op2);
    expect(result2.ok).toBe(true);

    const ramaFinal = result2.rama;

    const fusion = fusionar(m, ramaFinal);

    expect(fusion.ok).toBe(true);
    expect(fusion.molecula.valores).toEqual({ "atom1::param1": 15, "atom2::param2": 25 });
    expect(fusion.molecula.version).toBe(2);
    expect(fusion.conflictos).toHaveLength(0);
  });

  it("debe detectar conflictos cuando otra persona cambió un valor", () => {
    const m: Molecula = {
      id: "M001",
      titulo: "Molécula",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: { "atom1::param1": 15 }, // Ya cambiado por otra persona
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    const rama = abrirRama(m, "E001");
    expect(rama.base).toEqual({ "atom1::param1": 15 });
    expect(rama.valores).toEqual({ "atom1::param1": 15 });

    const p1: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };

    const op1: Operacion = {
      id: "op1",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "exacta", valor: 20 }, // Quiere cambiar a 20, pero ya está a 15
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result = aplicarEnRama(rama, p1, op1);
    expect(result.ok).toBe(true);
    expect(result.rama.valores).toEqual({ "atom1::param1": 20 });
    expect(result.rama.cambios).toHaveLength(1);
    expect(result.rama.cambios[0].antes).toBe(15);
    expect(result.rama.cambios[0].despues).toBe(20);

    const fusion = fusionar(m, result.rama);

    expect(fusion.ok).toBe(true);
    expect(fusion.conflictos).toHaveLength(1);
    expect(fusion.conflictos[0]).toContain("conflicto en atom1::param1");
    expect(fusion.molecula.valores).toEqual({ "atom1::param1": 15 }); // No cambió
    expect(fusion.molecula.version).toBe(1); // No incrementó
  });

  it("debe ignorar operaciones de disparo en la fusión", () => {
    const m: Molecula = {
      id: "M001",
      titulo: "Molécula",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: { "atom1::param1": 10 },
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    const rama = abrirRama(m, "E001");

    const p1: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };
    const p2: Parametro = { id: "param2", nombre: "Parámetro 2", tipo: "disparo" };

    const op1: Operacion = {
      id: "op1",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "exacta", valor: 20 },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const op2: Operacion = {
      id: "op2",
      objetivo: { atomoId: "atom1", parametroId: "param2" },
      accion: { tipo: "disparo" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result1 = aplicarEnRama(rama, p1, op1);
    expect(result1.ok).toBe(true);

    const result2 = aplicarEnRama(result1.rama, p2, op2);
    expect(result2.ok).toBe(true);

    const fusion = fusionar(m, result2.rama);

    expect(fusion.ok).toBe(true);
    expect(fusion.conflictos).toHaveLength(0);
    expect(fusion.molecula.valores).toEqual({ "atom1::param1": 20 });
    expect(fusion.molecula.version).toBe(2);
  });
});

describe("deshacerFusion", () => {
  it("debe deshacer una fusión con cambios múltiples", () => {
    const m: Molecula = {
      id: "M001",
      titulo: "Molécula original",
      ambito: "personal",
      capas: [],
      atomos: [],
      valores: { "atom1::param1": 10, "atom2::param2": 20 },
      version: 1,
      creadaEn: Date.now(),
      actualizadaEn: Date.now(),
    };

    const rama = abrirRama(m, "E001");

    const p1: Parametro = { id: "param1", nombre: "Parámetro 1", tipo: "numero" };
    const p2: Parametro = { id: "param2", nombre: "Parámetro 2", tipo: "numero" };

    const op1: Operacion = {
      id: "op1",
      objetivo: { atomoId: "atom1", parametroId: "param1" },
      accion: { tipo: "exacta", valor: 15 },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const op2: Operacion = {
      id: "op2",
      objetivo: { atomoId: "atom2", parametroId: "param2" },
      accion: { tipo: "relativa", cantidad: 5, modo: "delta" },
      autor: { tipo: "persona", id: "U001" },
      origen: "mano",
      t: Date.now(),
    };

    const result1 = aplicarEnRama(rama, p1, op1);
    expect(result1.ok).toBe(true);

    const result2 = aplicarEnRama(result1.rama, p2, op2);
    expect(result2.ok).toBe(true);

    const fusion = fusionar(m, result2.rama);
    expect(fusion.ok).toBe(true);
    expect(fusion.molecula.version).toBe(2);

    const mDeshecha = deshacerFusion(fusion.molecula, result2.rama.cambios);

    expect(mDeshecha.valores).toEqual({ "atom1::param1": 10, "atom2::param2": 20 });
    expect(mDeshecha.version).toBe(1);
  });
});
