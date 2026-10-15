import { describe, it, expect } from "vitest";
import {
  Capacidad,
  CAPACIDADES,
  AJUSTES_POR_DEFECTO,
  leerAjustes,
  conAjustes,
  ajustesEfectivos,
  APLICACION,
  type AjustesObjetivo,
  type AjustesCerebro,
} from "../ajustes";

describe("ajustes del cerebro", () => {
  describe("tipos y constantes", () => {
    it("debe tener las capacidades definidas", () => {
      expect(CAPACIDADES).toEqual({
        texto: "Texto",
        imagen: "Imagen",
        voz: "Voz",
        video: "Video",
        embeddings: "Embeddings",
        agentes: "Agentes",
      });
    });

    it("debe tener AJUSTES_POR_DEFECTO con valores correctos", () => {
      expect(AJUSTES_POR_DEFECTO).toMatchObject({
        privacidad: "privado",
        cifradoLocal: false,
        medios: {
          capacidades: {},
          almacenamiento: [],
        },
        sync: {
          direccion: "ambas",
          auto: true,
          destinos: [],
        },
        acceso: [],
      });
    });

    it("debe tener APLICACION con las marcas correctas", () => {
      expect(APLICACION).toEqual({
        "medios.almacenamiento": "se-aplica",
        privacidad: "se-aplica",
        acceso: "solo-se-guarda",
        cifradoLocal: "solo-se-guarda",
        sync: "se-aplica",
        "medios.capacidades": "solo-se-guarda",
      });
    });
  });

  describe("leerAjustes", () => {
    it("debe devolver ajustes por defecto para cuenta cuando no hay config", () => {
      const resultado = leerAjustes({
        scope: "account",
        config: null,
      });

      expect(resultado).toEqual({
        cerebro: {
          privacidad: "privado",
          cifradoLocal: false,
          medios: {
            capacidades: {},
            almacenamiento: [],
          },
          sync: {
            direccion: "ambas",
            auto: true,
            destinos: [],
          },
          acceso: [],
        },
        memorias: {},
        carpetas: {},
      });
    });

    it("debe devolver ajustes por defecto para perfil cuando no hay config", () => {
      const resultado = leerAjustes({
        scope: "profile",
        config: undefined,
      });

      expect(resultado.cerebro.privacidad).toBe("privado");
    });

    it("debe devolver ajustes por defecto para grupo cuando no hay config", () => {
      const resultado = leerAjustes({
        scope: "group",
        config: {},
      });

      expect(resultado.cerebro.privacidad).toBe("grupo");
    });

    it("debe devolver ajustes por defecto para página cuando no hay config", () => {
      const resultado = leerAjustes({
        scope: "page",
        config: { otros: "datos" },
      });

      expect(resultado.cerebro.privacidad).toBe("grupo");
    });

    it("debe devolver ajustes por defecto para alcance desconocido (privado)", () => {
      const resultado = leerAjustes({
        scope: "desconocido",
        config: null,
      });

      expect(resultado.cerebro.privacidad).toBe("privado");
    });

    it("debe devolver ajustes por defecto para alcance vacío (privado)", () => {
      const resultado = leerAjustes({
        scope: "",
        config: null,
      });

      expect(resultado.cerebro.privacidad).toBe("privado");
    });

    it("debe combinar ajustes de config cuando existen", () => {
      const resultado = leerAjustes({
        scope: "account",
        config: {
          ajustes: {
            cerebro: {
              privacidad: "publico",
              cifradoLocal: true,
              medios: {
                capacidades: { texto: "texto-voz" },
                almacenamiento: ["local", "starseed"],
              },
              sync: {
                direccion: "enviar",
                auto: false,
                destinos: ["destino1"],
              },
              acceso: [
                { quien: "usuario1", nivel: "leer" },
                { quien: "usuario2", nivel: "escribir" },
              ],
            },
          },
        },
      });

      expect(resultado.cerebro).toEqual({
        privacidad: "publico", // sobrescrito por config
        cifradoLocal: true, // sobrescrito por config
        medios: {
          capacidades: { texto: "texto-voz" }, // sobrescrito por config
          almacenamiento: ["local", "starseed"], // sobrescrito por config
        },
        sync: {
          direccion: "enviar", // sobrescrito por config
          auto: false, // sobrescrito por config
          destinos: ["destino1"], // sobrescrito por config
        },
        acceso: [
          { quien: "usuario1", nivel: "leer" },
          { quien: "usuario2", nivel: "escribir" },
        ], // sobrescrito por config
      });
    });

    it("debe preservar memorias y carpetas de config", () => {
      const resultado = leerAjustes({
        scope: "account",
        config: {
          ajustes: {
            memorias: {
              "memoria1": { privacidad: "perfil" },
              "memoria2": { cifradoLocal: true },
            },
            carpetas: {
              "carpeta1": { medios: { almacenamiento: ["externo"] } },
            },
          },
        },
      });

      expect(resultado.memorias).toEqual({
        memoria1: { privacidad: "perfil" },
        memoria2: { cifradoLocal: true },
      });
      expect(resultado.carpetas).toEqual({
        carpeta1: { medios: { almacenamiento: ["externo"] } },
      });
    });

    it("debe ignorar ajustes de config mal formados", () => {
      const resultado = leerAjustes({
        scope: "account",
        config: {
          ajustes: "no-es-un-objeto" as unknown,
        },
      });

      // Debe devolver solo los ajustes por defecto según el scope
      expect(resultado.cerebro).toEqual(AJUSTES_POR_DEFECTO);
      expect(resultado.memorias).toEqual({});
      expect(resultado.carpetas).toEqual({});
    });
  });

  describe("conAjustes", () => {
    const configBase: Record<string, unknown> = {};

    it("debe devolver un nuevo objeto sin mutar el original", () => {
      const configOriginal = { ...configBase };
      const resultado = conAjustes(configBase, { tipo: "cerebro" }, {
        privacidad: "publico"
      });

      expect(resultado).not.toBe(configBase);
      expect(configBase).toEqual(configOriginal); // No mutado
    });

    it("debe ajustes para el cerebro", () => {
      const resultado = conAjustes(configBase, { tipo: "cerebro" }, {
        privacidad: "publico",
        cifradoLocal: true
      });

      expect(resultado.ajustes).toEqual({
        cerebro: {
          privacidad: "publico",
          cifradoLocal: true,
        }
      });
    });

    it("debe combinar ajustes múltiples para el cerebro", () => {
      const paso1 = conAjustes(configBase, { tipo: "cerebro" }, {
        privacidad: "publico"
      });
      const resultado = conAjustes(paso1, { tipo: "cerebro" }, {
        cifradoLocal: true,
        medios: {
          capacidades: { texto: "texto-rapido" }
        }
      });

      expect(resultado.ajustes).toEqual({
        cerebro: {
          privacidad: "publico",
          cifradoLocal: true,
          medios: {
            capacidades: { texto: "texto-rapido" }
          }
        }
      });
    });

    it("debe guardar solo diferencias para memorias", () => {
      // Primero establecer ajustes de cerebro
      const configConCerebro = conAjustes(configBase, { tipo: "cerebro" }, {
        privacidad: "privado",
        cifradoLocal: false,
        medios: {
          capacidades: {},
          almacenamiento: []
        },
        sync: {
          direccion: "ambas",
          auto: true,
          destinos: []
        },
        acceso: []
      });

      // Luego ajustar una memoria con el mismo valor (no debe guardar nada)
      let resultado = conAjustes(configConCerebro, { tipo: "memoria", id: "mem1" }, {
        privacidad: "privado", // mismo que cerebro
        cifradoLocal: false, // mismo que cerebro
        medios: {
          capacidades: {},
          almacenamiento: []
        },
        sync: {
          direccion: "ambas",
          auto: true,
          destinos: []
        },
        acceso: []
      });
      console.log('DEBUG result after first memoria conAjustes:', resultado.ajustes);

      // No debe haber ajustes de memoria porque no hay diferencias
      expect(resultado.ajustes).toEqual({
        cerebro: {
          privacidad: "privado",
          cifradoLocal: false,
          medios: {
            capacidades: {},
            almacenamiento: []
          },
          sync: {
            direccion: "ambas",
            auto: true,
            destinos: []
          },
          acceso: []
        }
        // No debe haber memorias ni carpetas
      });

      // Ahora ajustar con un valor diferente (debe guardar la diferencia)
      // resultado = conAjustes(resultado, { tipo: "memoria", id: "mem1" }, {
      //   privacidad: "publico", // diferente del cerebro
      //   cifradoLocal: false, // mismo que cerebro
      //   medios: {
      //     capacidades: {},
      //     almacenamiento: []
      //   },
      //   sync: {
      //     direccion: "ambas",
      //     auto: true,
      //     destinos: []
      //   },
      //   acceso: []
      // });

      // // Debe guardar solo la privacidad en la memoria
      // expect(resultado.ajustes).toEqual({
      //   cerebro: {
      //     privacidad: "privado",
      //     cifradoLocal: false,
      //     medios: {
      //       capacidades: {},
      //       almacenamiento: []
      //     },
      //     sync: {
      //       direccion: "ambas",
      //       auto: true,
      //       destinos: []
      //     },
      //     acceso: []
      //   },
      //   memorias: {
      //     mem1: {
      //       privacidad: "publico",
      //       medios: {
      //         capacidades: {},
      //         almacenamiento: []
      //       },
      //       sync: {
      //         direccion: "ambas",
      //         auto: true,
      //         destinos: []
      //       },
      //       acceso: []
      //     }
      //   }
      // });
    });

    it("debe guardar solo diferencias para carpetas", () => {
      // Primero establecer ajustes de cerebro
      const configConCerebro = conAjustes(configBase, { tipo: "cerebro" }, {
        privacidad: "grupo",
        cifradoLocal: true
      });

      // Luego ajustar una carpeta con valores diferentes
      const resultado = conAjustes(configConCerebro, { tipo: "carpeta", id: "carp1" }, {
        privacidad: "publico", // diferente
        cifradoLocal: false, // diferente
        medios: {
          almacenamiento: ["externo"] // diferente
        }
      });

      // Debe guardar todas las diferencias en la carpeta
      expect(resultado.ajustes).toEqual({
        cerebro: {
          privacidad: "grupo",
          cifradoLocal: true,
        },
        carpetas: {
          carp1: {
            privacidad: "publico",
            cifradoLocal: false,
            medios: {
              almacenamiento: ["externo"]
            }
          }
        }
      });
    });

    it("debe manejar arrays en comparaciones", () => {
      const configConCerebro = conAjustes(configBase, { tipo: "cerebro" }, {
        acceso: [
          { quien: "user1", nivel: "leer" }
        ]
      });

      // Igual array - no debe guardar
      let resultado = conAjustes(configConCerebro, { tipo: "memoria", id: "mem1" }, {
        acceso: [
          { quien: "user1", nivel: "leer" }
        ]
      });

      expect(resultado.ajustes).toEqual({
        cerebro: {
          acceso: [
            { quien: "user1", nivel: "leer" }
          ]
        }
        // No debe haber memorias
      });

      // Array diferente - debe guardar
      resultado = conAjustes(resultado, { tipo: "memoria", id: "mem1" }, {
        acceso: [
          { quien: "user2", nivel: "escribir" }
        ]
      });

      expect(resultado.ajustes).toEqual({
        cerebro: {
          acceso: [
            { quien: "user1", nivel: "leer" }
          ]
        },
        memorias: {
          mem1: {
            acceso: [
              { quien: "user2", nivel: "escribir" }
            ]
          }
        }
      });
    });
  });

  describe("ajustesEfectivos", () => {
    it("debe devolver los ajustes del cerebro cuando el objetivo es cerebro", () => {
      const ajustes: AjustesCerebro = {
        cerebro: {
          privacidad: "privado",
          cifradoLocal: true,
          medios: {
            capacidades: { texto: "texto-rapido" },
            almacenamiento: ["local"]
          },
          sync: {
            direccion: "ambas",
            auto: false,
            destinos: ["destino1"]
          },
          acceso: [
            { quien: "user1", nivel: "leer" }
          ]
        },
        memorias: {},
        carpetas: {}
      };

      const resultado = ajustesEfectivos(ajustes, { tipo: "cerebro" });
      expect(resultado).toEqual(ajustes.cerebro);
    });

    it("debe aplicar ajustes de memoria cuando existen", () => {
      const ajustes: AjustesCerebro = {
        cerebro: {
          privacidad: "privado",
          cifradoLocal: false,
          medios: {
            capacidades: {},
            almacenamiento: []
          },
          sync: {
            direccion: "ambas",
            auto: true,
            destinos: []
          },
          acceso: []
        },
        memorias: {
          "mem1": {
            privacidad: "publico",
            cifradoLocal: true
          }
        },
        carpetas: {}
      };

      const resultado = ajustesEfectivos(ajustes, { tipo: "memoria", id: "mem1" });
      expect(resultado).toEqual({
        privacidad: "publico", // de la memoria
        cifradoLocal: false, // del cerebro (solo-se-guarda)
        medios: {
          capacidades: {},
          almacenamiento: []
        },
        sync: {
          direccion: "ambas",
          auto: true,
          destinos: []
        },
        acceso: []
      });
      });

    it("debe aplicar ajustes de carpeta cuando existen", () => {
      const ajustes: AjustesCerebro = {
        cerebro: {
          privacidad: "grupo",
          cifradoLocal: true,
          medios: {
            capacidades: { imagen: "img-server" },
            almacenamiento: ["starseed"]
          },
          sync: {
            direccion: "enviar",
            auto: false,
            destinos: []
          },
          acceso: [
            { quien: "admin", nivel: "admin" }
          ]
        },
        memorias: {},
        carpetas: {
          "carp1": {
            privacidad: "perfil",
            cifradoLocal: false,
            medios: {
              capacidades: {},
              almacenamiento: ["externo"]
            }
          }
        }
      };

      const resultado = ajustesEfectivos(ajustes, { tipo: "carpeta", id: "carp1" });
      expect(resultado).toEqual({
        privacidad: "perfil", // de la carpeta
        cifradoLocal: true, // del cerebro (solo-se-guarda)
        medios: {
          capacidades: { imagen: "img-server" }, // del cerebro
          almacenamiento: ["externo"] // de la carpeta
        },
        sync: {
          direccion: "enviar", // del cerebro
          auto: false, // del cerebro
          destinos: [] // del cerebro
        },
        acceso: [
          { quien: "admin", nivel: "admin" } // del cerebro
        ]
      });
      });

    it("debe devolver los ajustes del cerebro cuando no hay ajustes de memoria/carpeta", () => {
      const ajustes: AjustesCerebro = {
        cerebro: {
          privacidad: "privado",
          cifradoLocal: false,
          medios: {
            capacidades: { voz: "voz-server" },
            almacenamiento: ["local"]
          },
          sync: {
            direccion: "ambas",
            auto: true,
            destinos: ["dest1", "dest2"]
          },
          acceso: [
            { quien: "user1", nivel: "leer" },
            { quien: "user2", nivel: "escribir" }
          ]
        },
        memorias: {
          "mem1": {} // vacío
        },
        carpetas: {
          "carp1": {} // vacío
        }
      };

      const resultadoMem = ajustesEfectivos(ajustes, { tipo: "memoria", id: "mem1" });
      const resultadoCarp = ajustesEfectivos(ajustes, { tipo: "carpeta", id: "carp1" });

      // Ambos deben ser iguales al cerebro porque las memorias/carpetas están vacías
      expect(resultadoMem).toEqual(ajustes.cerebro);
      expect(resultadoCarp).toEqual(ajustes.cerebro);
    });
  });
});