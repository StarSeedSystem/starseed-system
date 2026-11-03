import { describe, it, expect } from "vitest";
import {
  CLAVE_DIRECTIVAS,
  EVENTO_DIRECTIVAS,
  debeGuardarDirectiva,
  normalizarArchivoDirectivas,
  normalizarRegistroDirectivas,
} from "../directivas-almacen";
import type { ArchivoDirectivas } from "../directivas";

describe("constantes del almacén de directivas", () => {
  it("clave y evento son las del contrato MTN1027C", () => {
    expect(CLAVE_DIRECTIVAS).toBe("starseed.capas.directivas.v1");
    expect(EVENTO_DIRECTIVAS).toBe("starseed:capas-directivas");
  });
});

describe("normalizarArchivoDirectivas", () => {
  it("basura → null; registro roto → {}", () => {
    expect(normalizarArchivoDirectivas("reversible")).toBe(null);
    expect(normalizarArchivoDirectivas({ v: 2 })).toBe(null);
    expect(normalizarRegistroDirectivas(null)).toEqual({});
    expect(normalizarRegistroDirectivas("nada")).toEqual({});
    expect(normalizarRegistroDirectivas({ capa_: "rara sin camino" })).toEqual({});
  });
});
