import { describe, it, expect } from "vitest";
import {
  ConectorCerebro,
  reunirConectores,
  alternarEnCerebro,
  claveConectores,
  cuentaPorEstado,
} from "../conectores";

describe("conectores del cerebro", () => {
  it("claveConectores usa el prefijo de contrato", () => {
    expect(claveConectores("b123")).toBe("starseed.brain.b123.conectores");
  });

  it("reunirConectores genera ids con prefijo por tipo", () => {
    const lista = reunirConectores(
      {
        conectores: [{ id: "slack", name: "Slack" }],
        integraciones: [{ id: "notion", name: "Notion", configurada: true }],
        mcp: [{ id: "m1", name: "MCP A", enlazada: true }],
        externos: [{ id: "e1", nombre: "Cuenta X", revocado: false, expira_en: null }],
        canales: [{ id: "t1", name: "Terminal", activo: true }],
      },
      ["integracion:notion", "mcp:m1"],
      0,
    );
    // Orden: conectado primero, luego falta-clave, error, disponible; luego alfabético por nombre.
    expect(lista.map((c) => c.id)).toEqual([
      "externo:e1",
      "mcp:m1",
      "integracion:notion",
      "canal:t1",
      "conector:slack",
    ]);
  });

  it("reunirConectores traduce estados correctamente", () => {
    const lista = reunirConectores(
      {
        conectores: [
          { id: "c1", name: "A", status: "connected" },
          { id: "c2", name: "B", status: "needs-auth" },
          { id: "c3", name: "C", status: "available" },
          { id: "c4", name: "D", status: "error" },
        ],
        integraciones: [
          { id: "i1", name: "I", configurada: true, error: null },
          { id: "i2", name: "J", configurada: false, error: "falló" },
        ],
        mcp: [{ id: "m1", name: "M", enlazada: false }],
        externos: [
          { id: "e1", nombre: "E", revocado: true, expira_en: null },
          { id: "e2", nombre: "F", revocado: false, expira_en: new Date(Date.now() - 86400000).toISOString() },
          { id: "e3", nombre: "G", revocado: false, expira_en: new Date(Date.now() + 86400000).toISOString() },
        ],
        canales: [
          { id: "ch1", name: "C1", activo: true },
          { id: "ch2", name: "C2", activo: false },
        ],
      },
      [],
      Date.now(),
    );
    const porEstado = cuentaPorEstado(lista);
    expect(porEstado["conectado"]).toBeGreaterThanOrEqual(1);
    expect(porEstado["falta-clave"]).toBeGreaterThanOrEqual(1);
    expect(porEstado["disponible"]).toBeGreaterThanOrEqual(1);
    expect(porEstado["error"]).toBeGreaterThanOrEqual(2); // revocado + caducado + error de conector + integracion con error
  });

  it("externos revocados o caducados se marcan como error", () => {
    const lista = reunirConectores(
      {
        conectores: [],
        integraciones: [],
        mcp: [],
        externos: [
          { id: "rev", nombre: "Revocado", revocado: true, expira_en: null },
          { id: "cad", nombre: "Caducado", revocado: false, expira_en: new Date(Date.now() - 1).toISOString() },
        ],
        canales: [],
      },
      [],
      Date.now(),
    );
    const estados = lista.map((c) => ({ id: c.id, estado: c.estado }));
    expect(estados.find((e) => e.id === "externo:rev")?.estado).toBe("error");
    expect(estados.find((e) => e.id === "externo:cad")?.estado).toBe("error");
  });

  it("orden es conectado, falta-clave, error, disponible y luego por nombre", () => {
    const lista = reunirConectores(
      {
        conectores: [
          { id: "z", name: "Zeta", status: "available" },
          { id: "a", name: "Alfa", status: "connected" },
          { id: "e", name: "Echo", status: "needs-auth" },
          { id: "x", name: "X-ray", status: "error" },
        ],
        integraciones: [],
        mcp: [],
        externos: [],
        canales: [],
      },
      [],
      0,
    );
    expect(lista.map((c) => c.id)).toEqual([
      "conector:a",
      "conector:e",
      "conector:x",
      "conector:z",
    ]);
  });

  it("enCerebro refleja los ids presentes en la lista de activación", () => {
    const lista = reunirConectores(
      {
        conectores: [{ id: "c1", name: "C" }],
        integraciones: [{ id: "i1", name: "I", configurada: true }],
        mcp: [{ id: "m1", name: "M", enlazada: true }],
        externos: [{ id: "e1", nombre: "E", revocado: false }],
        canales: [{ id: "ch1", name: "Ch", activo: true }],
      },
      ["conector:c1", "mcp:m1"],
      0,
    );
    expect(lista.find((c) => c.id === "conector:c1")?.enCerebro).toBe(true);
    expect(lista.find((c) => c.id === "integracion:i1")?.enCerebro).toBe(false);
  });

  it("alternarEnCerebro añade o quita sin duplicados", () => {
    expect(alternarEnCerebro(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(alternarEnCerebro(["a", "b", "c"], "b")).toEqual(["a", "c"]);
    expect(alternarEnCerebro([], "a")).toEqual(["a"]);
  });

  it("cuentaPorEstado suma correctamente", () => {
    const lista: ConectorCerebro[] = [
      { id: "1", nombre: "A", tipo: "conector", estado: "conectado", enCerebro: true, enlace: "" },
      { id: "2", nombre: "B", tipo: "conector", estado: "conectado", enCerebro: false, enlace: "" },
      { id: "3", nombre: "C", tipo: "integracion", estado: "disponible", enCerebro: false, enlace: "" },
    ];
    expect(cuentaPorEstado(lista)).toEqual({ conectado: 2, disponible: 1 });
  });
});
