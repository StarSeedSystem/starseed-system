import { describe, it, expect } from "vitest";

import {
  EstadoPaso,
  nivelesDe,
  pasosListos,
  repartirPasos,
  progreso,
} from "../reparto";
import type { Paso, Plan } from "../encargo";

describe("nivelesDe", () => {
  it("should return empty array for empty plan", () => {
    const plan: Plan = { encargoId: "e1", pasos: [] };
    expect(nivelesDe(plan)).toEqual([]);
  });

  it("should return single level for steps with no dependencies", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    expect(nivelesDe(plan)).toEqual([["p1", "p2"]]); // sorted
  });

  it("should return multiple levels for dependencies", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: ["p1"], salida: { formato: "f" }, depende: ["p1"], criterios: [] },
        { id: "p3", atomo: "a3", titulo: "", entradas: ["p2"], salida: { formato: "f" }, depende: ["p2"], criterios: [] },
      ],
    };
    expect(nivelesDe(plan)).toEqual([["p1"], ["p2"], ["p3"]]);
  });

  it("should handle independent steps in same level", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p3", atomo: "a3", titulo: "", entradas: ["p1"], salida: { formato: "f" }, depende: ["p1"], criterios: [] },
        { id: "p4", atomo: "a4", titulo: "", entradas: ["p2"], salida: { formato: "f" }, depende: ["p2"], criterios: [] },
      ],
    };
    expect(nivelesDe(plan)).toEqual([["p1", "p2"], ["p3", "p4"]]);
  });
});

describe("pasosListos", () => {
  it("should return empty list if no steps are pendiente", () => {
    const plan: Plan = { encargoId: "e1", pasos: [{ id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] }] };
    const estados: Record<string, EstadoPaso> = { p1: "hecho" };
    expect(pasosListos(plan, estados)).toHaveLength(0);
  });

  it("should return steps that are pendiente and all dependencies hecho", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: ["p1"], salida: { formato: "f" }, depende: ["p1"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = { p1: "hecho", p2: "pendiente" };
    expect(pasosListos(plan, estados)).toEqual([plan.pasos[1]]); // p2
  });

  it("should not return step if dependencies not hecho", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: ["p1"], salida: { formato: "f" }, depende: ["p1"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = { p1: "pendiente", p2: "pendiente" };
    expect(pasosListos(plan, estados)).toHaveLength(0);
  });
});

describe("repartirPasos", () => {
  it("should assign steps to free agents respecting puede and tope", () => {
    const listos: Paso[] = [
      { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "p2", atomo: "a2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "p3", atomo: "a3", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "ag1", ocupado: false, puede: ["a1", "a2"] },
      { id: "ag2", ocupado: false, puede: ["a2", "a3"] },
      { id: "ag3", ocupado: true, puede: ["a1", "a2", "a3"] }, // occupied
      { id: "ag4", ocupado: false, puede: [] }, // can do any
    ];
    const result = repartirPasos(listos, agentes, 2);
    // Expect two assignments: p1 to ag1 (first able), p2 to ag2 (first able)
    // Note: deterministic order: listos sorted by id: p1, p2, p3
    // agentes sorted by id: ag1, ag2, ag3, ag4
    // p1: ag1 can do a1 -> assign
    // p2: ag2 can do a2 -> assign
    // p3: not processed because tope=2 reached
    expect(result).toEqual([
      { paso: "p1", agente: "ag1" },
      { paso: "p2", agente: "ag2" },
    ]);
  });

  it("should not assign more than tope steps", () => {
    const listos: Paso[] = [
      { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "p2", atomo: "a2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "p3", atomo: "a3", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "ag1", ocupado: false, puede: [] },
      { id: "ag2", ocupado: false, puede: [] },
      { id: "ag3", ocupado: false, puede: [] },
    ];
    const result = repartirPasos(listos, agentes, 2);
    expect(result).toHaveLength(2);
  });

  it("should skip occupied agents", () => {
    const listos: Paso[] = [
      { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "ag1", ocupado: true, puede: [] },
      { id: "ag2", ocupado: false, puede: [] },
    ];
    const result = repartirPasos(listos, agentes, 1);
    expect(result).toEqual([{ paso: "p1", agente: "ag2" }]);
  });

  it("should respect puede restrictions", () => {
    const listos: Paso[] = [
      { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "p2", atomo: "b2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "ag1", ocupado: false, puede: ["a1"] }, // can only do a1
      { id: "ag2", ocupado: false, puede: ["b2"] }, // can only do b2
    ];
    const result = repartirPasos(listos, agentes, 2);
    expect(result).toEqual([
      { paso: "p1", agente: "ag1" },
      { paso: "p2", agente: "ag2" },
    ]);
  });
});

describe("progreso", () => {
  it("should count hechos, enCurso, bloqueados correctly", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: ["p1"], salida: { formato: "f" }, depende: ["p1"], criterios: [] },
        { id: "p3", atomo: "a3", titulo: "", entradas: ["p2"], salida: { formato: "f" }, depende: ["p2"], criterios: [] },
        { id: "p4", atomo: "a4", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      p1: "hecho",
      p2: "en-curso",
      p3: "pendiente", // waiting for p2 (not hecho)
      p4: "verificando",
    };
    const result = progreso(plan, estados);
    expect(result.hechos).toBe(1); // p1
    expect(result.total).toBe(4);
    expect(result.enCurso).toBe(2); // p2 (en-curso) and p4 (verificando)
    expect(result.bloqueados).toBe(1); // p3 is pendiente and depends on p2 which is not hecho
  });

  it("should treat fallido and necesita-mano as not counted in any category", () => {
    const plan: Plan = {
      encargoId: "e1",
      pasos: [
        { id: "p1", atomo: "a1", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "p2", atomo: "a2", titulo: "", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = { p1: "fallido", p2: "necesita-mano" };
    const result = progreso(plan, estados);
    expect(result.hechos).toBe(0);
    expect(result.total).toBe(2);
    expect(result.enCurso).toBe(0);
    expect(result.bloqueados).toBe(0);
  });
});