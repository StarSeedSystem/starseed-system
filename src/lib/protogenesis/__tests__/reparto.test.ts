/**
 * TESTS DE reparto multiagéntico determinista · ProtoGenesis PG1013B
 * Cubren las funciones definidas en el contrato.
 */
import { describe, it, expect } from "vitest";

import {
  EstadoPaso,
  nivelesDe,
  pasosListos,
  repartirPasos,
  progreso,
} from "../reparto";
import type { Paso, Plan } from "../encargo";
import { LIMITES } from "../encargo";

describe("nivelesDe", () => {
  it("devuelve niveles vacíos para plan sin pasos", () => {
    const plan: Plan = { encargoId: "E1", pasos: [] };
    expect(nivelesDe(plan)).toEqual([]);
  });

  it("devuelve un solo nivel para pasos sin dependencias", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "C", atomo: "c", titulo: "C", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    const niveles = nivelesDe(plan);
    expect(niveles.length).toBe(1);
    expect(niveles[0]).toEqual(["A", "B", "C"].sort()); // orden estable por id
  });

  it("devuelve niveles correctos para dependencias en cadena", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
        { id: "C", atomo: "c", titulo: "C", entradas: [], salida: { formato: "f" }, depende: ["B"], criterios: [] },
      ],
    };
    const niveles = nivelesDe(plan);
    expect(niveles).toEqual([["A"], ["B"], ["C"]]);
  });

  it("devuelve niveles correctos para árbol de dependencias", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
        { id: "C", atomo: "c", titulo: "C", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
        { id: "D", atomo: "d", titulo: "D", entradas: [], salida: { formato: "f" }, depende: ["B", "C"], criterios: [] },
      ],
    };
    const niveles = nivelesDe(plan);
    // Nivel 0: A
    // Nivel 1: B, C (pueden ejecutarse en paralelo después de A)
    // Nivel 2: DESPUÉS de B y C
    expect(niveles).toEqual([["A"], ["B", "C"], ["D"]]);
  });
});

describe("pasosListos", () => {
  it("devuelve pasos pendientes cuyas dependencias están hechas", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
        { id: "C", atomo: "c", titulo: "C", entradas: [], salida: { formato: "f" }, depende: ["B"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "hecho",
      B: "pendiente",
      C: "pendiente",
    };
    const listos = pasosListos(plan, estados);
    // Solo B está pendiente y su dependencia A está hecha
    expect(listos.map((p) => p.id)).toEqual(["B"]);
  });

  it("no devuelve pasos que no están pendientes", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "hecho",
      B: "en-curso", // no está pendiente
    };
    const listos = pasosListos(plan, estados);
    expect(listos).toHaveLength(0);
  });

   it("no devuelve pasos pendientes con dependencias no hechas", () => {
     const plan: Plan = {
       encargoId: "E1",
       pasos: [
         { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
         { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
       ],
     };
     const estados: Record<string, EstadoPaso> = {
       A: "pendiente", // no hecho
       B: "pendiente",
     };
     const listos = pasosListos(plan, estados);
     // A está pendiente y no tiene dependencias, así que debería estar listo
     // B está pendiente pero su dependencia A no está hecha, así que no debería estar listo
     expect(listos).toHaveLength(1);
     expect(listos[0].id).toBe("A");
   });

  it("maneja pasos sin dependencias", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "pendiente",
      B: "pendiente",
    };
    const listos = pasosListos(plan, estados);
    // Ambos están pendientes y sin dependencias
    expect(listos.map((p) => p.id).sort()).toEqual(["A", "B"]);
  });
});

describe("repartirPasos", () => {
  const agentesBase = [
    { id: "agente1", ocupado: false, puede: [] }, // puede cualquier cosa
    { id: "agente2", ocupado: false, puede: [] },
    { id: "agente3", ocupado: false, puede: [] },
    { id: "agente4", ocupado: false, puede: ["atomoEspecial"] }, // solo puede atomoEspecial
  ];

  it("asigna tres pasos independientes a tres agentes libres", () => {
    const listos: Paso[] = [
      { id: "P1", atomo: "atomo1", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P2", atomo: "atomo2", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P3", atomo: "atomo3", titulo: "P3", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [...agentesBase];
    const asignaciones = repartirPasos(listos, agentes);
    // Debe asignar exactamente tres pasos, cada uno a un agente distinto
    expect(asignaciones.length).toBe(3);
    const pasosAsignados = asignaciones.map((a) => a.paso).sort();
    expect(pasosAsignados).toEqual(["P1", "P2", "P3"]);
    // Los agentes asignados deben ser distintos
    const agentesAsignados = asignaciones.map((a) => a.agente);
    expect(new Set(agentesAsignados).size).toBe(3);
  });

  it("respeta el tope de agentes", () => {
    const listos: Paso[] = [
      { id: "P1", atomo: "a", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P2", atomo: "b", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P3", atomo: "c", titulo: "P3", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P4", atomo: "d", titulo: "P4", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [...agentesBase]; // 4 agentes libres
    const tope = 2; // solo podemos asignar 2 a la vez
    const asignaciones = repartirPasos(listos, agentes, tope);
    expect(asignaciones.length).toBe(tope);
    // Los pasos asignados deben ser los primeros dos por orden de id (P1, P2)
    const pasosAsignados = asignaciones.map((a) => a.paso).sort();
    expect(pasosAsignados).toEqual(["P1", "P2"]);
  });

  it("respeta la lista `puede` del agente", () => {
    const listos: Paso[] = [
      { id: "P1", atomo: "atomoComun", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P2", atomo: "atomoEspecial", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "agente1", ocupado: false, puede: [] }, // puede cualquier cosa
      { id: "agente2", ocupado: false, puede: ["atomoEspecial"] }, // solo puede atomoEspecial
    ];
    const asignaciones = repartirPasos(listos, agentes);
    // Ambos agentes están libres, pero agente1 solo puede tomar atomoComun (porque puede vacío significa cualquiera, pero vamos a ver)
    // Agente2 solo puede tomar atomoEspecial.
    // Por determinismo, ordenamos por id de agente y luego por id de paso.
    // Paso P1 (atomoComun) -> agente1 (porque agente1 está primero y puede cualquiera)
    // Paso P2 (atomoEspecial) -> agente2 (porque agente2 puede atomoEspecial y agente1 ya no está disponible)
    expect(asignaciones.length).toBe(2);
    // Verificar que cada paso esté asignado al agente correcto
    const mapa = Object.fromEntries(asignaciones.map((a) => [a.paso, a.agente]));
    expect(mapa.P1).toBe("agente1");
    expect(mapa.P2).toBe("agente2");
  });

  it("no asigna dos pasos al mismo agente", () => {
    const listos: Paso[] = [
      { id: "P1", atomo: "a", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      { id: "P2", atomo: "b", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "agente1", ocupado: false, puede: [] },
      { id: "agente2", ocupado: true, puede: [] }, // ocupado
    ];
    const asignaciones = repartirPasos(listos, agentes);
    // Solo agente1 está libre, así que solo puede asignar un paso
    expect(asignaciones.length).toBe(1);
    // El paso asignado debe ser P1 (por orden de id)
    expect(asignaciones[0].paso).toBe("P1");
    expect(asignaciones[0].agente).toBe("agente1");
  });

  it("devuelve el mismo resultado con la lista de pasos barajada", () => {
    const listosOriginal: Paso[] = [
      { id: "P2", atomo: "b", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
       { id: "P1", atomo: "a", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
       { id: "P3", atomo: "c", titulo: "P3", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] }
     ];
    const listosBarajado = [...listosOriginal].sort(() => Math.random() - 0.5); // barajar aleatoriamente
    // Para hacer la prueba determinista, usaremos una barajada fija
    const listosBarajadoFijo: Paso[] = [
       { id: "P3", atomo: "c", titulo: "P3", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
       { id: "P1", atomo: "a", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
       { id: "P2", atomo: "b", titulo: "P2", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] }
     ];
    const agentes = [...agentesBase];
    const asignacionesOriginal = repartirPasos(listosOriginal, agentes);
    const asignacionesBarajado = repartirPasos(listosBarajadoFijo, agentes);
    // Deben ser iguales porque el algoritmo ordena por id
    expect(asignacionesOriginal).toEqual(asignacionesBarajado);
  });

  it("no asigna pasos a agentes ocupados", () => {
    const listos: Paso[] = [
      { id: "P1", atomo: "a", titulo: "P1", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
    ];
    const agentes = [
      { id: "agente1", ocupado: true, puede: [] }, // ocupado
      { id: "agente2", ocupado: false, puede: [] },
    ];
    const asignaciones = repartirPasos(listos, agentes);
    expect(asignaciones.length).toBe(1);
    expect(asignaciones[0].agente).toBe("agente2");
  });
});

describe("progreso", () => {
  it("calcula progreso correcto para pasos en diferentes estados", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
        { id: "C", atomo: "c", titulo: "C", entradas: [], salida: { formato: "f" }, depende: ["B"], criterios: [] },
        { id: "D", atomo: "d", titulo: "D", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "hecho",
      B: "en-curso",
      C: "pendiente", // depende de B que no está hecho
      D: "verificando",
    };
    const result = progreso(plan, estados);
    expect(result.hechos).toBe(1); // A
    expect(result.total).toBe(4);
    expect(result.enCurso).toBe(2); // B (en-curso) y D (verificando)
    expect(result.bloqueados).toBe(1); // C está pendiente y bloqueado porque B no está hecho
  });

  it("devuelve cero bloqueados cuando todas las dependencias de los pendientes están hechas", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "hecho",
      B: "pendiente", // depende de A que está hecho -> no bloqueado
    };
    const result = progreso(plan, estados);
    expect(result.bloqueados).toBe(0);
  });

  it("maneja estados fallido y necesita-mano", () => {
    const plan: Plan = {
      encargoId: "E1",
      pasos: [
        { id: "A", atomo: "a", titulo: "A", entradas: [], salida: { formato: "f" }, depende: [], criterios: [] },
        { id: "B", atomo: "b", titulo: "B", entradas: [], salida: { formato: "f" }, depende: ["A"], criterios: [] },
      ],
    };
    const estados: Record<string, EstadoPaso> = {
      A: "hecho",
      B: "fallido",
    };
    const result = progreso(plan, estados);
    expect(result.hechos).toBe(1);
    expect(result.total).toBe(2);
    expect(result.enCurso).toBe(0); // ninguno en en-curso o verificando
    expect(result.bloqueados).toBe(0); // B no está pendiente
  });
});