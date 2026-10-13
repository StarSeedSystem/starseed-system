import { describe, expect, it } from "vitest";
import {
  leerAjustes,
  conAjustes,
  ajustesEfectivos,
  AJUSTES_POR_DEFECTO,
  CAPACIDADES,
  APLICACION,
  type AjustesObjetivo,
  type AjustesCerebro,
  type Capacidad,
} from "../ajustes";

describe("ajustes del cerebro", () => {
  describe("CAPACIDADES", () => {
    it("tiene todas las capacidades con etiquetas en español", () => {
      expect(CAPACIDADES.texto).toBe("Texto");
      expect(CAPACIDADES.imagen).toBe("Imagen");
      expect(CAPACIDADES.voz).toBe("Voz");
      expect(CAPACIDADES.video).toBe("Video");
      expect(CAPACIDADES.embeddings).toBe("Embeddings");
      expect(CAPACIDADES.agentes).toBe("Agentes");
    });
  });

  describe("APLICACION", () => {
    it("tiene los valores correctos según §8", () => {
      expect(APLICACION["medios.almacenamiento"]).toBe("se-aplica");
      expect(APLICACION.privacidad).toBe("se-aplica");
      expect(APLICACION.acceso).toBe("solo-se-guarda");
      expect(APLICACION.cifradoLocal).toBe("solo-se-guarda");
      expect(APLICACION.sync).toBe("se-aplica");
      expect(APLICACION["medios.capacidades"]).toBe("solo-se-guarda");
    });
  });

  describe("leerAjustes", () => {
    it("devuelve ajustes con privacidad privado para account y profile", () => {
      const cerebroAccount = leerAjustes({ scope: "account" });
      const cerebroProfile = leerAjustes({ scope: "profile" });
      expect(cerebroAccount.cerebro.privacidad).toBe("privado");
      expect(cerebroProfile.cerebro.privacidad).toBe("privado");
    });

    it("devuelve ajustes con privacidad grupo para group, community y page", () => {
      const cerebroGroup = leerAjustes({ scope: "group" });
      const cerebroCommunity = leerAjustes({ scope: "community" });
      const cerebroPage = leerAjustes({ scope: "page" });
      expect(cerebroGroup.cerebro.privacidad).toBe("grupo");
      expect(cerebroCommunity.cerebro.privacidad).toBe("grupo");
      expect(cerebroPage.cerebro.privacidad).toBe("grupo");
    });

    it("devuelve ajustes con privacidad privado para alcance desconocido o vacío", () => {
      const cerebroVacio = leerAjustes({ scope: "" });
      const cerebroNulo = leerAjustes({ scope: null });
      const cerebroRaro = leerAjustes({ scope: "desconocido" });
      expect(cerebroVacio.cerebro.privacidad).toBe("privado");
      expect(cerebroNulo.cerebro.privacidad).toBe("privado");
      expect(cerebroRaro.cerebro.privacidad).toBe("privado");
    });

    it("usa los ajustes guardados en config cuando existen", () => {
      const config = {
        ajustes: {
          privacidad: "publico",
          cifradoLocal: true,
          medios: {
            capacidades: { texto: "servidor-texto" },
            almacenamiento: ["almacenamiento-1"],
          },
          sync: { direccion: "enviar", auto: false, destinos: ["destino-1"] },
          acceso: [{ quien: "usuario-1", nivel: "leer" }],
        },
      };
      const cerebro = leerAjustes({ scope: "account", config });
      expect(cerebro.cerebro.privacidad).toBe("publico");
      expect(cerebro.cerebro.cifradoLocal).toBe(true);
      expect(cerebro.cerebro.medios.capacidades.texto).toBe("servidor-texto");
      expect(cerebro.cerebro.medios.almacenamiento).toEqual([
        "almacenamiento-1",
      ]);
      expect(cerebro.cerebro.sync.direccion).toBe("enviar");
      expect(cerebro.cerebro.sync.auto).toBe(false);
      expect(cerebro.cerebro.sync.destinos).toEqual(["destino-1"]);
      expect(cerebro.cerebro.acceso).toEqual([
        { quien: "usuario-1", nivel: "leer" },
      ]);
    });

    it("combina ajustes guardados con valores por defecto", () => {
      const config = {
        ajustes: {
          privacidad: "grupo",
          // cifradoLocal no especificado, debería usar el por defecto (false)
          medios: {
            capacidades: { imagen: "servidor-imagen" },
            // almacenamiento no especificado, debería usar el por defecto ([])
          },
          sync: {
            // direccion no especificada, debería usar el por defecto ("ambas")
            auto: true,
            // destinos no especificado, debería usar el por defecto ([])
          },
          // acceso no especificado, debería usar el por defecto ([])
        },
      };
      const cerebro = leerAjustes({ scope: "group", config });
      expect(cerebro.cerebro.privacidad).toBe("grupo");
      expect(cerebro.cerebro.cifradoLocal).toBe(false); // valor por defecto
      expect(cerebro.cerebro.medios.capacidades.imagen).toBe("servidor-imagen");
      expect(cerebro.cerebro.medios.capacidades.texto).toBe("auto"); // valor por defecto
      expect(cerebro.cerebro.medios.almacenamiento).toEqual([]); // valor por defecto
      expect(cerebro.cerebro.sync.direccion).toBe("ambas"); // valor por defecto
      expect(cerebro.cerebro.sync.auto).toBe(true);
      expect(cerebro.cerebro.sync.destinos).toEqual([]); // valor por defecto
      expect(cerebro.cerebro.acceso).toEqual([]); // valor por defecto
    });
  });

  describe("conAjustes", () => {
    it("actualiza los ajustes del cerebro", () => {
      const configInicial = {};
      const parcial: Partial<AjustesObjetivo> = {
        privacidad: "publico",
        cifradoLocal: true,
      };
      const configNuevo = conAjustes(configInicial, { tipo: "cerebro" }, parcial);
      expect(configNuevo.config?.ajustes.privacidad).toBe("publico");
      expect(configNuevo.config?.ajustes.cifradoLocal).toBe(true);
    });

    it("guarda solo las diferencias para memorias", () => {
      // Primero establecemos los ajustes del cerebro
      const configConAjustesCerebro = {
        config: {
          ajustes: AJUSTES_POR_DEFECTO,
        },
      };
      // Luego actualizamos una memoria con algunos cambios
      const parcial: Partial<AjustesObjetivo> = {
        privacidad: "publico", // Diferente del cerebro (que es privado por defecto)
        cifradoLocal: false,   // Igual que el cerebro (por defecto)
      };
      const configConMemoria = conAjustes(
        configConAjustesCerebro,
        { tipo: "memoria", id: "memoria-1" },
        parcial
      );
      // Solo debería guardar lo que difiere (privacidad)
      expect(
        configConMemoria.config?.ajustes.memorias["memoria-1"]
      ).toEqual({ privacidad: "publico" });
      // No debería guardar cifradoLocal porque es igual al cerebro
      expect(
        configConMemoria.config?.ajustes.memorias["memoria-1"]
          ?.cifradoLocal
      ).toBeUndefined();
    });

    it("guarda solo las diferencias para carpetas", () => {
      // Primero establecemos los ajustes del cerebro
      const configConAjustesCerebro = {
        config: {
          ajustes: AJUSTES_POR_DEFECTO,
        },
      };
      // Luego actualizamos una carpeta con algunos cambios
      const parcial: Partial<AjustesObjetivo> = {
        privacidad: "grupo", // Diferente del cerebro (que es privado por defecto)
        cifradoLocal: false, // Igual que el cerebro (por defecto)
      };
      const configConCarpeta = conAjustes(
        configConAjustesCerebro,
        { tipo: "carpeta", id: "carpeta-1" },
        parcial
      );
      // Solo debería guardar lo que difiere (privacidad)
      expect(
        configConCarpeta.config?.ajustes.carpetas["carpeta-1"]
      ).toEqual({ privacidad: "grupo" });
      // No debería guardar cifradoLocal porque es igual al cerebro
      expect(
        configConCarpeta.config?.ajustes.carpetas["carpeta-1"]
          ?.cifradoLocal
      ).toBeUndefined();
    });
  });

  describe("ajustesEfectivos", () => {
    it("devuelve los ajustes del cerebro cuando no hay memoria ni carpeta", () => {
      const ajustesCerebro: AjustesCerebro = {
        cerebro: AJUSTES_POR_DEFECTO,
        memorias: {},
        carpetas: {},
      };
      const efectivos = ajustesEfectivos(ajustesCerebro, {
        tipo: "memoria",
        id: "memoria-inexistente",
      });
      expect(efectivos).toEqual(AJUSTES_POR_DEFECTO);
    });

    it("aplica los ajustes de memoria cuando existen", () => {
      const ajustesConMemoria: AjustesCerebro = {
        cerebro: {
          ...AJUSTES_POR_DEFECTO,
          privacidad: "privado",
        },
        memorias: {
          "memoria-1": {
            privacidad: "publico", // Debe pisar al cerebro
            cifradoLocal: true,    // Debe pisar al cerebro
          },
        },
        carpetas: {},
      };
      const efectivos = ajustesEfectivos(ajustesConMemoria, {
        tipo: "memoria",
        id: "memoria-1",
      });
      expect(efectivos.privacidad).toBe("publico");
      expect(efectivos.cifradoLocal).toBe(true);
    });

    it("aplica los ajustes de carpeta cuando existen", () => {
      const ajustesConCarpeta: AjustesCerebro = {
        cerebro: {
          ...AJUSTES_POR_DEFECTO,
          privacidad: "privado",
        },
        memorias: {},
        carpetas: {
          "carpeta-1": {
            privacidad: "grupo", // Debe pisar al cerebro
            cifradoLocal: true,  // Debe pisar al cerebro
          },
        },
      };
      const efectivos = ajustesEfectivos(ajustesConCarpeta, {
        tipo: "carpeta",
        id: "carpeta-1",
      });
      expect(efectivos.privacidad).toBe("grupo");
      expect(efectivos.cifradoLocal).toBe(true);
    });

    it("combina múltiples campos de memoria", () => {
      const ajustesConMemoria: AjustesCerebro = {
        cerebro: {
          ...AJUSTES_POR_DEFECTO,
          privacidad: "privado",
          cifradoLocal: false,
          medios: {
            capacidades: { texto: "auto" },
            almacenamiento: [],
          },
          sync: { direccion: "ambas", auto: true, destinos: [] },
          acceso: [],
        },
        memorias: {
          "memoria-1": {
            privacidad: "publico",
            cifradoLocal: true,
            medios: {
              capacidades: { imagen: "servidor-imagen" },
              almacenamiento: ["almacenamiento-1"],
            },
            sync: { direccion: "enviar", auto: false, destinos: ["destino-1"] },
            acceso: [{ quien: "usuario-1", nivel: "leer" }],
          },
        },
        carpetas: {},
      };
      const efectivos = ajustesEfectivos(ajustesConMemoria, {
        tipo: "memoria",
        id: "memoria-1",
      });
      expect(efectivos.privacidad).toBe("publico");
      expect(efectivos.cifradoLocal).toBe(true);
      expect(efectivos.medios.capacidades.texto).toBe("auto"); // Del cerebro
      expect(efectivos.medios.capacidades.imagen).toBe(
        "servidor-imagen"
      ); // De la memoria
      expect(efectivos.medios.almacenamiento).toEqual([
        "almacenamiento-1",
      ]);
      expect(efectivos.sync.direccion).toBe("enviar");
      expect(efectivos.sync.auto).toBe(false);
      expect(efectivos.sync.destinos).toEqual(["destino-1"]);
      expect(efectivos.acceso).toEqual([
        { quien: "usuario-1", nivel: "leer" },
      ]);
    });
  });
});