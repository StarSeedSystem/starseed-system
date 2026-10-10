import { describe, expect, it } from "vitest";

import { extraerFilasCapaRed } from "@/lib/mando/capas-red";

describe("extraerFilasCapaRed", () => {
  it("extrae filas con estado desconocido cuando faltan datos", () => {
    const catalogo: { capas: Array<{ id: string; version: string; estado: string }>; espejos: Record<string, boolean> } = {
      capas: [
        { id: "reflejo", version: "v1.2", estado: "verificada" },
        { id: "memoria", version: "v0.8", estado: "nueva" },
      ],
      espejos: { reflejo: true },
    };
    const estado: { actualizado: string; capas: Record<string, { dispositivos: number; servidores: number; ultima: string }> } = {
      actualizado: "2026-10-07T00:00:00Z",
      capas: {
        reflejo: { dispositivos: 5, servidores: 2, ultima: "2026-10-06T12:00:00Z" },
        memoria: { dispositivos: 3, servidores: 1, ultima: "2026-10-06T12:00:00Z" },
      },
    };
    const chips: { capa: string; chips: Record<string, { nodoId: string; capas?: string[] }> }[] = [
      {
        capa: "reflejo",
        chips: {
          nodo1: { nodoId: "nodo1", capas: ["reflejo@1.2", "memoria@0.8"] },
          nodo2: { nodoId: "nodo2", capas: ["reflejo@1.2"] },
        },
      },
      {
        capa: "memoria",
        chips: {
          nodo3: { nodoId: "nodo3", capas: ["memoria@0.8"] },
          nodo4: { nodoId: "nodo4", capas: ["reflejo@1.2", "memoria@0.8"] },
        },
      },
    ];
    const resultadosBanco: { capa: string; version: string; resultado: string }[] = [
      { capa: "reflejo", version: "v1.2", resultado: "aprobado" },
      { capa: "memoria", version: "v0.8", resultado: "en prueba" },
    ];

    const filas = extraerFilasCapaRed(catalogo, estado, chips, resultadosBanco);

    expect(filas).toHaveLength(2);

    const filaReflejo = filas.find((f) => f.id === "reflejo");
    expect(filaReflejo).toBeDefined();
    expect(filaReflejo?.version).toBe("v1.2");
    expect(filaReflejo?.estado).toBe("verificada");
    expect(filaReflejo?.dispositivos).toBe(2);
    expect(filaReflejo?.servidores).toBe(2);
    expect(filaReflejo?.espejos).toBe(1);
    expect(filaReflejo?.resultadoBanco).toBe("aprobado");

    const filaMemoria = filas.find((f) => f.id === "memoria");
    expect(filaMemoria).toBeDefined();
    expect(filaMemoria?.version).toBe("v0.8");
    expect(filaMemoria?.estado).toBe("nueva");
    expect(filaMemoria?.dispositivos).toBe(2);
    expect(filaMemoria?.servidores).toBe(1);
    expect(filaMemoria?.espejos).toBe(0);
    expect(filaMemoria?.resultadoBanco).toBe("en prueba");
  });

  it("cuenta espejos para capas", () => {
    const catalogo: { capas: Array<{ id: string; version: string; estado: string }>; espejos: Record<string, boolean> } = {
      capas: [{ id: "reflejo", version: "v1.0", estado: "activa" }],
      espejos: { reflejo: true },
    };
    const estado: { actualizado: string; capas: Record<string, { dispositivos: number; servidores: number; ultima: string }> } = {
      actualizado: "2026-10-07T00:00:00Z",
      capas: {
        reflejo: { dispositivos: 0, servidores: 0, ultima: "" },
      },
    };
    const chips: { capa: string; chips: Record<string, { nodoId: string; capas?: string[] }> }[] = [
      {
        capa: "reflejo",
        chips: { nodo1: { nodoId: "nodo1", capas: ["reflejo@1.0"] } },
      },
    ];
    const resultadosBanco: { capa: string; version: string; resultado: string }[] = [];

    const filas = extraerFilasCapaRed(catalogo, estado, chips, resultadosBanco);

    expect(filas[0].espejos).toBe(1);
  });

  it("devuelve null para resultadoBanco cuando no hay resultado", () => {
    const catalogo: { capas: Array<{ id: string; version: string; estado: string }>; espejos: Record<string, boolean> } = {
      capas: [{ id: "reflejo", version: "v1.0", estado: "activa" }],
      espejos: {},
    };
    const estado: { actualizado: string; capas: Record<string, { dispositivos: number; servidores: number; ultima: string }> } = {
      actualizado: "2026-10-07T00:00:00Z",
      capas: { reflejo: { dispositivos: 0, servidores: 0, ultima: "" } },
    };
    const chips: { capa: string; chips: Record<string, { nodoId: string; capas?: string[] }> }[] = [
      {
        capa: "reflejo",
        chips: { nodo1: { nodoId: "nodo1", capas: ["reflejo@1.0"] } },
      },
    ];
    const resultadosBanco: { capa: string; version: string; resultado: string }[] = [];

    const filas = extraerFilasCapaRed(catalogo, estado, chips, resultadosBanco);

    expect(filas[0].resultadoBanco).toBeNull();
  });

  it("mantiene estado desconocido cuando es undefined", () => {
    const catalogo: { capas: Array<{ id: string; version: string; estado: string }>; espejos: Record<string, boolean> } = {
      capas: [{ id: "reflejo", version: "v1.0", estado: "activa" }],
      espejos: {},
    };
    const estado: { actualizado: string; capas: Record<string, { dispositivos: number; servidores: number; ultima: string }> } = {
      actualizado: "2026-10-07T00:00:00Z",
      capas: { reflejo: { dispositivos: 0, servidores: 0, ultima: "" } },
    };
    const chips: { capa: string; chips: Record<string, { nodoId: string; capas?: string[] }> }[] = [
      {
        capa: "reflejo",
        chips: { nodo1: { nodoId: "nodo1", capas: ["reflejo@1.0"] } },
      },
    ];
    const resultadosBanco: { capa: string; version: string; resultado: string }[] = [];

    const filas = extraerFilasCapaRed(catalogo, estado, chips, resultadosBanco);

    expect(filas[0].estado).toBe("activa");
  });
});