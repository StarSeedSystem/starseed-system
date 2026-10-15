/**
 * TESTS DE validarEncargo y validarPlan · ProtoGenesis PG1013A
 * Cubren todas las reglas definidas en architecture/protogenesis.md §2
 * y architecture/protomolecula.md §3·7·8.
 */

import { describe, it, expect } from "vitest";

import {
  validarEncargo,
  validarPlan,
  TIPOS_CRITERIO,
  Criterio,
  Encargo,
  Paso,
  Plan,
  LIMITES,
} from "../encargo";

import type { Ambito } from "@/lib/protomolecula/tipos";

describe("validarEncargo", () => {
  it("debe aceptar un encargo válido con criterios", () => {
    const encargo: Encargo = {
      id: "E001",
      moleculaId: "M001",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [
        { tipo: "formato", texto: "formato de salida" },
      ],
      autor: { tipo: "persona", id: "U001" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(true);
  });

  it("debe errorar cuando no tiene criterios", () => {
    const encargoSinCriterios = {
      id: "E002",
      moleculaId: "M002",
      ambito: "personal",
      intencion: "crear una molécula",
      autor: { tipo: "persona", id: "U002" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargoSinCriterios);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("sin criterios comprobables no hay encargo");
  });

  it("debe errorar cuando el tipo de criterio es inválido", () => {
    const encargo = {
      id: "E003",
      moleculaId: "M003",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [
        { tipo: "invalido", texto: "criterio malo" } as unknown as Criterio,
      ],
      autor: { tipo: "persona", id: "U003" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("tipo de criterio inválido: invalido");
  });

  it("debe errorar cuando el criterio no tiene texto string", () => {
    const encargo = {
      id: "E004",
      moleculaId: "M004",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [
        { tipo: "formato", valor: 1 } as Criterio,
      ],
      autor: { tipo: "persona", id: "U004" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("cada criterio debe tener una propiedad texto string");
  });

  it("debe errorar cuando el ambito es inválido", () => {
    const encargo = {
      id: "E005",
      moleculaId: "M005",
      ambito: "invalido" as Ambito,
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "f" }],
      autor: { tipo: "persona", id: "U005" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("ambito inválido: invalido");
  });

  it("debe errorar cuando el autor falta tipo", () => {
    const encargo = {
      id: "E006",
      moleculaId: "M006",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "f" }],
      autor: { id: "U006" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("autor debe tener tipo e id");
  });

  it("debe errorar cuando el autor falta id", () => {
    const encargo = {
      id: "E007",
      moleculaId: "M007",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "f" }],
      autor: { tipo: "persona" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("autor debe tener tipo e id");
  });

  it("deve errorar cuando el origen es inválido", () => {
    const encargo = {
      id: "E008",
      moleculaId: "M008",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [{ tipo: "formato", texto: "f" }],
      autor: { tipo: "persona", id: "U008" },
      origen: "invalido",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("origen inválido: invalido");
  });

  it("debe aceptar todos los tipos de criterio válidos", () => {
    const encargo = {
      id: "E009",
      moleculaId: "M009",
      ambito: "personal",
      intencion: "crear una molécula",
      criterios: [
        { tipo: "formato", texto: "f" },
        { tipo: "duracion-max", texto: "d" },
        { tipo: "tamano-max", texto: "t" },
        { tipo: "sin-secretos", texto: "s" },
        { tipo: "capas-presentes", texto: "c" },
        { tipo: "persona", texto: "p" },
      ],
      autor: { tipo: "persona", id: "U009" },
      origen: "texto",
      creadoEn: Date.now(),
    };
    const result = validarEncargo(encargo);
    expect(result.ok).toBe(true);
  });
});

describe("validarPlan", () => {
  const ctx = {
    existeAtomo: (id: string) => "si",
    hayConversion: (de: string, a: string) => true,
    formatoDe: (entrada: string) => entrada,
  };

  it("debe aceptar un plan válido con un paso", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(true);
    expect(result.errores).toHaveLength(0);
  });

  it("debe errorar cuando hay más de 24 pasos", () => {
    const pasosExtras = Array(25)
      .fill(0)
      .map((_, i) => ({
        id: `P${i}`,
        atomo: "herramienta",
        titulo: `Paso ${i}`,
        entradas: [],
        salida: { formato: "json" },
        depende: [],
        criterios: [{ tipo: "formato", texto: "json" }],
      }));

    const plan: Plan = {
      encargoId: "E001",
      pasos: pasosExtras,
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain(`máximo 24 pasos, recibieron ${pasosExtras.length}`);
  });

  it("deve errorar cuando hay ids de paso duplicados", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
        {
          id: "P1", // duplicado
          atomo: "herramienta2",
          titulo: "Paso 2",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("id de paso duplicado: P1");
  });

  it("debe errorar cuando un paso depende de un paso inexistente", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: ["P999"], // paso inexistente
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("paso P1: depende de paso inexistente: P999");
  });

  it("debe detectar ciclos en el plan", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: ["P2"],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
        {
          id: "P2",
          atomo: "herramienta2",
          titulo: "Paso 2",
          entradas: [],
          salida: { formato: "json" },
          depende: ["P1"], // ciclo: P1 → P2 → P1
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("plan tiene un ciclo en los pasos");
  });

  it("debe errorar cuando el átomo es 'no'", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "no",
          titulo: "Paso prohibido",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(false);
    expect(result.errores).toContain("paso P1: átomo 'no' no es válido");
  });

  it("debe avisar cuando el átomo es 'solo-enlace'", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "solo-enlace",
          titulo: "Paso solo enlace",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(true);
    expect(result.avisos).toContain("paso P1: átomo 'solo-enlace' — próximamente");
  });

  it("debe avisar cuando la entrada no tiene conversor disponible", () => {
    const ctxSinConversion = {
      existeAtomo: (id: string) => "si",
      hayConversion: (de: string, a: string) => false,
      formatoDe: (entrada: string) => null,
    };

    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
        {
          id: "P2",
          atomo: "herramienta2",
          titulo: "Paso 2",
          entradas: ["json"], // entrada es la salida de P1, formato json
          salida: { formato: "wav" },
          depende: ["P1"],
          criterios: [{ tipo: "formato", texto: "wav" }],
        },
      ],
    };
    const result = validarPlan(plan, ctxSinConversion);
    expect(result.avisos).toContain("falta conversor de json a json");
  });

  it("no debe avisar cuando hay conversor disponible", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P2",
          atomo: "herramienta2",
          titulo: "Paso 2",
          entradas: ["salidaDeP1"],
          salida: { formato: "wav" },
          depende: ["P1"],
          criterios: [{ tipo: "formato", texto: "wav" }],
        },
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.avisos).toHaveLength(0);
  });

  it("debe validar entradas que son salidas de otros pasos correctamente", () => {
    const plan: Plan = {
      encargoId: "E001",
      pasos: [
        {
          id: "P1",
          atomo: "herramienta1",
          titulo: "Paso 1",
          entradas: [],
          salida: { formato: "json" },
          depende: [],
          criterios: [{ tipo: "formato", texto: "json" }],
        },
        {
          id: "P2",
          atomo: "herramienta2",
          titulo: "Paso 2",
          entradas: ["json"], // entrada es la salida de P1, formato coincide
          salida: { formato: "datos" },
          depende: ["P1"],
          criterios: [{ tipo: "formato", texto: "datos" }],
        },
      ],
    };
    const result = validarPlan(plan, ctx);
    expect(result.ok).toBe(true);
    expect(result.errores).toHaveLength(0);
  });
});