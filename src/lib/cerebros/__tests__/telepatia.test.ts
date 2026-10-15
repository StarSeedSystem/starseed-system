import { describe, it, expect } from "vitest";
import { normalizarVinculos, validarVinculo } from "../telepatia";

describe("normalizarVinculos", () => {
  it("devuelve vacío si no hay array válido", () => {
    expect(normalizarVinculos(null)).toEqual([]);
    expect(normalizarVinculos("bad")).toEqual([]);
  });

  it("filtra los inválidos y mantiene los válidos", () => {
    const raw = [
      { id: "v1", destino: { tipo: "cerebro", id: "b2" }, alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] }, direccion: "ambas", acceso: "leer", auto: true, estado: "activo", creadoEn: "2026-01-01" },
      { id: "", destino: { tipo: "grupo", id: "g1" } },
    ];
    const v = normalizarVinculos(raw);
    expect(v).toHaveLength(1);
    expect(v[0].id).toBe("v1");
  });

  it("usa valores por defecto para campos faltantes", () => {
    const v = normalizarVinculos([{ id: "v2", destino: { tipo: "cuenta", id: "c1" } }]);
    expect(v[0].direccion).toBe("ambas");
    expect(v[0].acceso).toBe("leer");
  });
});

describe("validarVinculo", () => {
  it("rechaza lo que no es objeto con id y destino", () => {
    expect(validarVinculo(null)).toBe(false);
    expect(validarVinculo({})).toBe(false);
    expect(validarVinculo({ id: "v", destino: {} })).toBe(true);
  });
});
