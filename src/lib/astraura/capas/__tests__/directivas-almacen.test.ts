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

  it("un archivo bueno pasa intacto y el malo se cae del registro", () => {
    const bueno: ArchivoDirectivas = {
      v: 1, capa: "ral", activa: 2, historial: [
        { capa: "ral", version: 1, texto: "antes", sha256: "a".repeat(64), acierto: 0.5, base: 0.6, n: 30, fecha: "2026-10-26", origen: "meta-n", estado: "anterior" },
        { capa: "ral", version: 2, texto: "ahora", sha256: "b".repeat(64), acierto: 0.7, base: 0.6, n: 40, fecha: "2026-10-27", origen: "meta-n", estado: "activa" },
      ],
    };
    expect(normalizarArchivoDirectivas(bueno)).toEqual(bueno);
    expect(normalizarRegistroDirectivas({ ral: bueno, rota: { v: 7 } })).toEqual({ ral: bueno });
  });

  it("una directiva con versión infinita o estado ajeno se cae del historial", () => {
    const rota = { v: 1, capa: "ral", activa: null, historial: [
      { version: Number.POSITIVE_INFINITY, texto: "x", estado: "activa", fecha: "f", origen: "o" },
      "no soy objeto",
      { version: 1, texto: "buena", estado: "activa", fecha: "f", origen: "o" },
    ] };
    const saneado = normalizarArchivoDirectivas(rota);
    expect(saneado?.historial).toHaveLength(1);
    expect(saneado?.historial[0]?.texto).toBe("buena");
    expect(saneado?.activa).toBe(null);
  });
});

describe("debeGuardarDirectiva · puerta de llegada", () => {
  const archivo = (activa: number | null, estados: string[] = ["activa"]): ArchivoDirectivas => ({
    v: 1, capa: "ral", activa,
    historial: estados.map((estado, i) => ({
      capa: "ral", version: i + 1, texto: `pauta ${i + 1}`, sha256: "c".repeat(64),
      acierto: 0.8, base: 0.75, n: 40, fecha: "2026-10-27", origen: "meta-n", estado,
    })) as ArchivoDirectivas["historial"],
  });

  it("sin actual llega siempre; nulo no guarda nada", () => {
    expect(debeGuardarDirectiva(undefined, archivo(1))).toBe(true);
    expect(debeGuardarDirectiva(archivo(1), null)).toBe(false);
  });

  it("la versión activa más nueva entra; la vieja y la igual no (sin cambios de historial)", () => {
    const dos = archivo(2, ["anterior", "activa"]);
    expect(debeGuardarDirectiva(archivo(1), dos)).toBe(true);
    expect(debeGuardarDirectiva(dos, archivo(1, ["anterior", "activa"]))).toBe(false);
  });

  it("con la misma activa, un historial distinto entra y uno gemelo no", () => {
    const conPropuesta = archivo(2, ["anterior", "activa", "propuesta"]);
    expect(debeGuardarDirectiva(archivo(2, ["anterior", "activa"]), conPropuesta)).toBe(true);
    expect(debeGuardarDirectiva(conPropuesta, archivo(2, ["anterior", "activa", "propuesta"]))).toBe(false);
  });

  it("de vacío a con activa entra; una idéntica no repite escritura", () => {
    expect(debeGuardarDirectiva(archivo(null), archivo(3, ["anterior", "anterior", "activa"]))).toBe(true);
    expect(debeGuardarDirectiva(archivo(3, ["anterior", "anterior", "activa"]), archivo(3, ["anterior", "anterior", "activa"]))).toBe(false);
  });

  it("la retirada que llega de otro medio entra porque cambió el historial", () => {
    const retirada = archivo(null, ["anterior", "anterior", "retirada"]);
    expect(debeGuardarDirectiva(archivo(3, ["anterior", "anterior", "activa"]), retirada)).toBe(true);
  });
});
