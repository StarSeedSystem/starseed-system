// Prueba de src/lib/variaciones/claves-ajustes.ts y del componente
// src/components/variaciones/con-clave.tsx — módulo puro y componente sin
// estado: sin red, sin disco, sin DOM (el `ConClave` se invoca como función
// devolviendo el elemento React, que es inspeccionable sin renderizador).
import { describe, it, expect } from "vitest";

import {
  idNormalizadoDeAjuste,
  claveDeAjuste,
  idsDeAjustes,
  clavesDeAjustes,
} from "../claves-ajustes";
import { ConClave } from "@/components/variaciones/con-clave";
import { leerClave } from "../clave-elemento";

// Ajustes reales de los dos registros: el buscador de Ajustes y el lienzo.
const DEL_BUSCADOR = "tema-apariencia";
const DEL_LIENZO_CAMEL = "displacementScale";
const DEL_LIENZO_KEBAP = "stitch-prompt";

describe("idNormalizadoDeAjuste", () => {
  it("devuelve null para un id vacío o mal formado", () => {
    expect(idNormalizadoDeAjuste("")).toBeNull();
    expect(idNormalizadoDeAjuste(" ")).toBeNull();
    expect(idNormalizadoDeAjuste("estilo con espacios")).toBeNull();
    expect(idNormalizadoDeAjuste("estilo/con-barra")).toBeNull();
  });
  it("conserva los ids ya canónicos", () => {
    expect(idNormalizadoDeAjuste(DEL_BUSCADOR)).toBe(DEL_BUSCADOR);
    expect(idNormalizadoDeAjuste(DEL_LIENZO_KEBAP)).toBe(DEL_LIENZO_KEBAP);
  });

  it("pasa los ids camelCase del lienzo a kebab-case", () => {
    expect(idNormalizadoDeAjuste(DEL_LIENZO_CAMEL)).toBe("displacement-scale");
    expect(idNormalizadoDeAjuste("buttonRadius")).toBe("button-radius");
    expect(idNormalizadoDeAjuste("chromaticAberration")).toBe(
      "chromatic-aberration",
    );
  });
});

describe("claveDeAjuste", () => {
  it("devuelve null para un id que no llega o mal formado", () => {
    expect(claveDeAjuste("")).toBeNull();
    expect(claveDeAjuste("estilo con espacios")).toBeNull();
  });

  it("devuelve la clave canónica de un ajuste de cualquiera de los dos registros", () => {
    expect(claveDeAjuste(DEL_BUSCADOR)).toBe(`ajuste:${DEL_BUSCADOR}`);
    expect(claveDeAjuste(DEL_LIENZO_KEBAP)).toBe(`ajuste:${DEL_LIENZO_KEBAP}`);
  });

  it("acepta el id camelCase del lienzo y lo normaliza en la clave", () => {
    expect(claveDeAjuste(DEL_LIENZO_CAMEL)).toBe("ajuste:displacement-scale");
  });

  it("es estable: el mismo id da siempre la misma clave, sea camelCase o kebab", () => {
    expect(claveDeAjuste(DEL_LIENZO_CAMEL)).toBe(
      claveDeAjuste(idNormalizadoDeAjuste(DEL_LIENZO_CAMEL) ?? ""),
    );
  });
});

describe("idsDeAjustes", () => {
  it("devuelve una lista sin duplicados ni ids mal formados", () => {
    const ids = idsDeAjustes();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(leerClave(`ajuste:${id}`)).toBe(`ajuste:${id}`);
    }
  });

  it("cubre a los dos registros: buscador de Ajustes y lienzo de diseño", () => {
    const ids = idsDeAjustes();
    expect(ids).toContain(DEL_BUSCADOR);
    expect(ids).toContain(DEL_LIENZO_KEBAP);
    expect(ids).toContain("displacement-scale");
  });
});

describe("clavesDeAjustes", () => {
  it("genera claves ajuste:<id> válidas para los dos registros", () => {
    const claves = clavesDeAjustes();
    expect(claves.length).toBe(idsDeAjustes().length);
    for (const clave of claves) {
      expect(clave.startsWith("ajuste:")).toBe(true);
      expect(leerClave(clave)).toBe(clave);
    }
    expect(claves).toContain(`ajuste:${DEL_BUSCADOR}`);
    expect(claves).toContain("ajuste:displacement-scale");
  });
});

describe("ConClave", () => {
  it("pone data-ss-elemento en el elemento React", () => {
    const elemento = ConClave({ clave: `ajuste:${DEL_BUSCADOR}` });
    expect(elemento.type).toBe("div");
    expect(elemento.props["data-ss-elemento"]).toBe(`ajuste:${DEL_BUSCADOR}`);
  });

  it("conserva la etiqueta pedida y la clase", () => {
    const elemento = ConClave({
      clave: `ajuste:${DEL_BUSCADOR}`,
      elemento: "section",
      className: "borde-cristal",
    });
    expect(elemento.type).toBe("section");
    expect(elemento.props.className).toBe("borde-cristal");
    expect(elemento.props["data-ss-elemento"]).toBe(`ajuste:${DEL_BUSCADOR}`);
  });

  it("sale sin el atributo si la clave no valida: degrada en silencio", () => {
    const sinClave = ConClave({ clave: undefined });
    const claveMala = ConClave({ clave: "Ajuste Sin Clave" });
    expect(sinClave.props).not.toHaveProperty("data-ss-elemento");
    expect(claveMala.props).not.toHaveProperty("data-ss-elemento");
  });
});
