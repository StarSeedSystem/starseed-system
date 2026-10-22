// Prueba de src/lib/variaciones/claves-protomolecula.ts — módulo puro, sin red
// ni disco. El registro de átomos es un Map en memoria: se siembra un átomo
// propio y se limpia en cada caso para que la prueba no dependa de nada vivo.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  claveDeHerramienta,
  claveDeAtomo,
  claveDeMolecula,
  claveDeAtomoPorNombre,
  atributosClave,
} from "../claves-protomolecula";
import type { DefinicionAtomo } from "../../protomolecula/registro-atomos";
import { registrarAtomo, limpiarRegistro } from "../../protomolecula/registro-atomos";

// Herramienta segura del catálogo real (el catálogo no debe vaciarse nunca).
const ID_HERRAMIENTA = "photocraft";

// Definición mínima válida: control «ventana» admite una lista vacía de parámetros.
const ATOMO: DefinicionAtomo = {
  herramientaId: "video-html",
  nombre: "Vídeo HTML",
  categoria: "video",
  integracion: "libreria-js",
  control: "ventana",
  parametros: [],
  entradas: [],
  salidas: [],
};

beforeEach(() => {
  limpiarRegistro();
  expect(registrarAtomo(ATOMO).ok).toBe(true);
});

afterEach(() => {
  limpiarRegistro();
});

describe("claveDeHerramienta", () => {
  it("devuelve null para un id vacío o no registrado", () => {
    expect(claveDeHerramienta("")).toBeNull();
    expect(claveDeHerramienta("fotografia-mental")).toBeNull();
  });

  it("devuelve la clave canónica de una herramienta del catálogo", () => {
    expect(claveDeHerramienta(ID_HERRAMIENTA)).toBe(`herramienta:${ID_HERRAMIENTA}`);
  });
});

describe("claveDeAtomo", () => {
  it("devuelve null para un id vacío o no registrado", () => {
    expect(claveDeAtomo("")).toBeNull();
    expect(claveDeAtomo("video-dream")).toBeNull();
  });

  it("devuelve la clave canónica de un átomo del registro", () => {
    expect(claveDeAtomo(ATOMO.herramientaId)).toBe(`atomo:${ATOMO.herramientaId}`);
  });
});

describe("claveDeMolecula", () => {
  it("devuelve null para un id vacío o sin pieza registrada", () => {
    expect(claveDeMolecula("")).toBeNull();
    expect(claveDeMolecula("molecula-inventada")).toBeNull();
  });

  it("acepta el id de una herramienta del catálogo", () => {
    expect(claveDeMolecula(ID_HERRAMIENTA)).toBe(`molecula:${ID_HERRAMIENTA}`);
  });

  it("acepta el id de un átomo del registro", () => {
    expect(claveDeMolecula(ATOMO.herramientaId)).toBe(`molecula:${ATOMO.herramientaId}`);
  });
});

describe("claveDeAtomoPorNombre", () => {
  it("resuelve la clave por el nombre visible de la definición", () => {
    expect(claveDeAtomoPorNombre(ATOMO.nombre)).toBe(`atomo:${ATOMO.herramientaId}`);
  });

  it("resuelve la clave si el nombre es ya el id de herramienta", () => {
    expect(claveDeAtomoPorNombre(ATOMO.herramientaId)).toBe(`atomo:${ATOMO.herramientaId}`);
  });

  it("devuelve null para un nombre que el registro no conoce", () => {
    expect(claveDeAtomoPorNombre("")).toBeNull();
    expect(claveDeAtomoPorNombre("Vídeo Imaginado")).toBeNull();
  });
});

describe("atributosClave", () => {
  it("devuelve objeto vacío con una clave ausente o mal formada", () => {
    expect(atributosClave(null)).toEqual({});
    expect(atributosClave(undefined)).toEqual({});
    expect(atributosClave("")).toEqual({});
    expect(atributosClave("widgetclima")).toEqual({});
    expect(atributosClave("widget:")).toEqual({});
    expect(atributosClave(":clima")).toEqual({});
    expect(atributosClave("Widget:clima")).toEqual({});
    expect(atributosClave("widget:cl ima")).toEqual({});
    expect(atributosClave("widget:clima#")).toEqual({});
  });

  it("expone data-ss-elemento para una clave válida", () => {
    expect(atributosClave(`herramienta:${ID_HERRAMIENTA}`)).toEqual({
      "data-ss-elemento": `herramienta:${ID_HERRAMIENTA}`,
    });
    expect(atributosClave("atomo:video-html#panel")).toEqual({
      "data-ss-elemento": "atomo:video-html#panel",
    });
  });

  it("nunca rompe una expansión en JSX: siempre devuelve un objeto", () => {
    const attrs = atributosClave(claveDeHerramienta(ID_HERRAMIENTA));
    expect(attrs).toHaveProperty("data-ss-elemento");
    expect(Object.keys(atributosClave("no-es-clave"))).toHaveLength(0);
  });
});
