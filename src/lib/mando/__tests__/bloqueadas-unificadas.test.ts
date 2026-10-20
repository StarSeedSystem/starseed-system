import { describe, it, expect } from "vitest";
import { unificarBloqueadas } from "@/lib/mando/bloqueadas-unificadas";
import type { FilaMedidor } from "@/lib/mando/medidores";
import type { FilaContable } from "@/lib/mando/conteo-operativo";

describe("unificarBloqueadas", () => {
  it("separa correctamente las bloqueadas en cadena, problemas y agrega tareas de colas vivas", () => {
    // Simulate filasBloqueadas with grupo assigned
    const filasBloqueadas: FilaMedidor[] = [
      { id: "C1", titulo: "Cadena 1", estado: "bloqueada", porque: "espera a X", acciones: [], historica: false, grupo: "cadena" },
      { id: "C2", titulo: "Cadena 2", estado: "bloqueada", porque: "espera a Y", acciones: [], historica: false, grupo: "cadena" },
      { id: "A1", titulo: "Necesita Alex", estado: "bloqueada", porque: "necesita decision", acciones: [], historica: false, grupo: "alex" },
      { id: "T1", titulo: "Tarea atascada", estado: "bloqueada sin salida", porque: "atascada", acciones: [], historica: false, grupo: "atascada" },
      { id: "B1", titulo: "Bloqueante", estado: "bloqueante", porque: "agotado reintentos", acciones: [], historica: false, grupo: "atascada" },
    ];

    // Simulate progreso (we need it for the function, but we don't use it in our simplified version)
    const progreso: Record<string, { estado: string; t?: string; nota?: string }> = {
      // We don't actually use progreso in our current implementation, but we provide it to avoid errors
      C1: { estado: "bloqueada", t: "2026-10-19 10:00" },
      C2: { estado: "bloqueada", t: "2026-10-19 10:05" },
      A1: { estado: "bloqueada", t: "2026-10-19 10:10" },
      T1: { estado: "bloqueada sin salida", t: "2026-10-19 10:15" },
      B1: { estado: "bloqueante", t: "2026-10-19 10:20" },
    };

    // Simulate colasVivas with some tasks that match the states and some that don't
    const colasVivas: FilaContable[] = [
      { id: "R1", estado: "rechazada", dependenciasPendientes: [] },
      { id: "F1", estado: "fallo_timeout", dependenciasPendientes: [] },
      { id: "S1", estado: "sin_cambios", dependenciasPendientes: [] },
      { id: "I1", estado: "interrumpida", dependenciasPendientes: [] },
      { id: "C1", estado: "bloqueada", dependenciasPendientes: [] }, // duplicate id, should be ignored
      { id: "X1", estado: "pendiente", dependenciasPendientes: [] }, // should not match
    ];

    const result = unificarBloqueadas({ filasBloqueadas, progreso, colasVivas });

    // Check enCadena: should have C1 and C2
    expect(result.enCadena.map(f => f.id)).toEqual(["C1", "C2"]);

    // Check problemas: should have A1, T1, B1 from filasBloqueadas, and R1, F1, S1, I1 from colasVivas
    const problemaIds = result.problemas.map(f => f.id).sort();
    expect(problemaIds).toEqual(["A1", "B1", "T1", "F1", "I1", "R1", "S1"].sort());

    // Check resumen
    expect(result.resumen.valor).toBe(7); // 7 problemas
    expect(result.resumen.enCadena).toBe(2); // 2 en cadena
    expect(result.resumen.pastilla).toContain("en cadena");
    expect(result.resumen.texto).toBe("7 problemas, 2 en cadena");
  });

  it("no duplica IDs entre filasBloqueadas y colasVivas", () => {
    const filasBloqueadas: FilaMedidor[] = [
      { id: "DUP", titulo: "Duplicado", estado: "bloqueada", porque: "test", acciones: [], historica: false, grupo: "atascada" },
    ];
    const progreso: Record<string, { estado: string; t?: string; nota?: string }> = {
      DUP: { estado: "bloqueada", t: "2026-10-19 10:00" },
    };
    const colasVivas: FilaContable[] = [
      { id: "DUP", estado: "rechazada", dependenciasPendientes: [] },
    ];

    const result = unificarBloqueadas({ filasBloqueadas, progreso, colasVivas });
    // The duplicate from colasVivas should be ignored
    expect(result.problemas.map(f => f.id)).toEqual(["DUP"]);
    expect(result.problemas.length).toBe(1);
  });

  it("ignora tareas de colas vivas que no coinciden con los estados objetivo", () => {
    const filasBloqueadas: FilaMedidor[] = [];
    const progreso: Record<string, { estado: string; t?: string; nota?: string }> = {};
    const colasVivas: FilaContable[] = [
      { id: "P1", estado: "pendiente", dependenciasPendientes: [] },
      { id: "C1", estado: "commit", dependenciasPendientes: [] },
      { id: "B2", estado: "bloqueante", dependenciasPendientes: [] }, // bloqueante is not in our target states? Wait, our regex includes falling? Actually, bloqueante does not match the regex because it's not rechazada, fallo*, sin_cambios, or interrumpida. So it should be ignored.
    ];

    const result = unificarBloqueadas({ filasBloqueadas, progreso, colasVivas });
    expect(result.problemas.length).toBe(0);
  });
});