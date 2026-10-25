import { describe, it, expect, beforeAll } from "vitest";
import {
  claveDeHerramienta,
  claveDeAtomo,
  claveDeMolecula,
  atributosClave,
} from "../claves-protomolecula";
import { limpiarRegistro } from "../../protomolecula/registro-atomos";
import { ATOMOS_PROPIOS, registrarAtomosPropios } from "../../protomolecula/atomos";

// Átomos propios de serie: los registramos en memoria para tener ids reales
// que validar (el registro lo llena la sesión en ejecución, no el arranque).
let atomoId = "";

describe("claves-protomolecula", () => {
  beforeAll(() => {
    limpiarRegistro();
    registrarAtomosPropios();
    atomoId = ATOMOS_PROPIOS[0].herramientaId;
  });

  describe("claveDeHerramienta", () => {
    it("acepta una herramienta del catálogo", () => {
      expect(claveDeHerramienta("photocraft")).toBe("herramienta:photocraft");
      expect(claveDeHerramienta("krita")).toBe("herramienta:krita");
    });

    it("rechaza un id vacío o con solo espacios", () => {
      expect(claveDeHerramienta("")).toBeNull();
      expect(claveDeHerramienta("   ")).toBeNull();
    });

    it("rechaza un id que no está en el catálogo", () => {
      expect(claveDeHerramienta("no-existe")).toBeNull();
    });
  });

  describe("claveDeAtomo", () => {
    it("acepta un átomo del registro", () => {
      expect(claveDeAtomo(atomoId)).toBe(`atomo:${atomoId}`);
    });

    it("rechaza un id vacío", () => {
      expect(claveDeAtomo("")).toBeNull();
      expect(claveDeAtomo("  ")).toBeNull();
    });

    it("rechaza un id que no está en el registro", () => {
      expect(claveDeAtomo("atomo-fantasma")).toBeNull();
    });
  });

  describe("claveDeMolecula", () => {
    it("acepta un id que es herramienta del catálogo", () => {
      expect(claveDeMolecula("photocraft")).toBe("molecula:photocraft");
    });

    it("acepta un id que es átomo del registro", () => {
      expect(claveDeMolecula(atomoId)).toBe(`molecula:${atomoId}`);
    });

    it("rechaza un id que no es ni herramienta ni átomo", () => {
      expect(claveDeMolecula("molecula-fantasma")).toBeNull();
    });

    it("rechaza un id vacío", () => {
      expect(claveDeMolecula("")).toBeNull();
    });
  });

  describe("atributosClave", () => {
    it("devuelve el atributo para una clave válida", () => {
      expect(atributosClave("herramienta:photocraft")).toEqual({
        "data-ss-elemento": "herramienta:photocraft",
      });
    });

    it("devuelve el atributo para una clave con parte", () => {
      expect(atributosClave("widget:clima#hora")).toEqual({
        "data-ss-elemento": "widget:clima#hora",
      });
    });

    it("devuelve null para una clave con formato inválido", () => {
      expect(atributosClave("widget:")).toBeNull();
      expect(atributosClave(":clima")).toBeNull();
      expect(atributosClave("widget clima")).toBeNull();
      expect(atributosClave("WIDGET:clima")).toBeNull();
      expect(atributosClave("widget:clima#")).toBeNull();
    });

    it("devuelve null para una clave nula", () => {
      expect(atributosClave(null)).toBeNull();
    });
  });
});
