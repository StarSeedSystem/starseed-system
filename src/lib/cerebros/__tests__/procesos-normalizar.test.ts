import { describe, expect, it } from "vitest";
import {
  desdeAgentesMac,
  desdeLatidos,
  desdeNodos,
  desdePoligenesis,
  desdeSuenos,
  desdeImaginacion,
  desdeInstalaciones,
  desdeActualizaciones,
  desdeVentanas,
  desdePresencia,
  unirProcesos,
  agruparPorTipo,
} from "../procesos-normalizar";

describe("unirProcesos", () => {
  it("elimina duplicados por id y mantiene en-marcha primero", () => {
    const p1 = {
      id: "a",
      tipo: "genesis" as const,
      nombre: "Proceso A",
      estado: "en-marcha" as const,
      progreso: null,
      donde: "mac",
      desde: null,
      fuente: "prueba",
    };
    const p2 = {
      id: "b",
      tipo: "genesis" as const,
      nombre: "Proceso B",
      estado: "pausado" as const,
      progreso: null,
      donde: "mac",
      desde: null,
      fuente: "prueba",
    };
    const p3 = {
      id: "a",
      tipo: "genesis" as const,
      nombre: "Duplicado A",
      estado: "en-marcha" as const,
      progreso: null,
      donde: "mac",
      desde: null,
      fuente: "prueba",
    };
    const resultado = unirProcesos([p1, p2], [p3]);
    expect(resultado).toHaveLength(2);
    expect(resultado[0].id).toBe("a");
    expect(resultado[0].estado).toBe("en-marcha");
    expect(resultado[1].id).toBe("b");
    expect(resultado[1].estado).toBe("pausado");
  });
});

describe("agruparPorTipo", () => {
  it("agrupa procesos por su tipo", () => {
    const genesis = {
      id: "g1",
      tipo: "genesis" as const,
      nombre: "Proceso Genesis",
      estado: "en-marcha" as const,
      progreso: null,
      donde: "mac",
      desde: null,
      fuente: "prueba",
    };
    const sueno = {
      id: "s1",
      tipo: "sueno" as const,
      nombre: "Proceso Sueño",
      estado: "esperando" as const,
      progreso: null,
      donde: "mac",
      desde: null,
      fuente: "prueba",
    };
    const procesos = [genesis, sueno];
    const grupos = agruparPorTipo(procesos);
    expect(Object.keys(grupos)).toEqual(["genesis", "sueno"]);
    expect(grupos.genesis).toHaveLength(1);
    expect(grupos.genesis[0].id).toBe("g1");
    expect(grupos.sueno).toHaveLength(1);
    expect(grupos.sueno[0].id).toBe("s1");
  });
});

describe("desdeAgentesMac", () => {
  it("devuelve procesos a partir de datos de agentes", () => {
    const datos = {
      agentes: [
        {
          id: "agente-1",
          nombre: "Agente Uno",
          estado: "en-marcha",
          procesos: [
            {
              id: "proc-1",
              tipo: "genesis",
              nombre: "Proceso del Agente Uno",
              estado: "en-marcha",
            },
            {
              id: "proc-2",
              tipo: "sueno",
              nombre: "Proceso del Sueño Uno",
              estado: "esperando",
            },
          ],
        },
        {
          id: "agente-2",
          nombre: "Agente Dos",
          estado: "pausado",
          procesos: [],
        },
      ],
    };
    const procesos = desdeAgentesMac(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("proc-1");
    expect(procesos[0].tipo).toBe("genesis");
    expect(procesos[1].id).toBe("proc-2");
    expect(procesos[1].tipo).toBe("sueno");
  });

  it("devuelve vacío para entrada inválida", () => {
    expect(desdeAgentesMac(null)).toEqual([]);
    expect(desdeAgentesMac({})).toEqual([]);
    expect(desdeAgentesMac([])).toEqual([]);
  });
});

describe("desdeLatidos", () => {
  it("normaliza datos de latidos a procesos", () => {
    const datos = {
      latidos: [
        {
          tarea: "task-1",
          modelo: "model-a",
          fase: "en-marcha",
          minutos: 30,
        },
        {
          id: "task-2",
          fase: "pausado",
          modelo: "model-b",
        },
      ],
    };
    const procesos = desdeLatidos(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("task-1");
    expect(procesos[0].tipo).toBe("genesis");
    expect(procesos[0].donde).toBe("model-a");
    expect(procesos[1].id).toBe("task-2");
    expect(procesos[1].tipo).toBe("servicio");
    expect(procesos[1].estado).toBe("pausado");
  });

  it("devuelve vacío para entrada inválida", () => {
    expect(desdeLatidos(null)).toEqual([]);
    expect(desdeLatidos({})).toEqual([]);
  });
});

describe("desdeNodos", () => {
  it("normaliza datos de nodos a procesos", () => {
    const datos = {
      nodos: [
        {
          id: "node-1",
          nombre: "Nodo Uno",
          tipo: "mac",
          estado: "en-marcha",
        },
        {
          nodo: "node-2",
          estado: "pausado",
        },
      ],
    };
    const procesos = desdeNodos(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("node-1");
    expect(procesos[0].tipo).toBe("mac");
    expect(procesos[1].id).toBe("node-2");
    expect(procesos[1].tipo).toBe("servicio");
  });
});

describe("desdePoligenesis", () => {
  it("normaliza datos de poligenesis a procesos", () => {
    const datos = {
      historial: {
        operaciones: [
          {
            id: "prop-1",
            accion: "crear",
            estado: "esperando",
            origen: "cuenta-a",
            creado_en: "2024-01-01T00:00:00Z",
            descripcion: "Primera propuesta",
          },
          {
            _id: "prop-2",
            accion: "actualizar",
            estado: "en-marcha",
            descripcion: "Segunda propuesta",
          },
        ],
      },
    };
    const procesos = desdePoligenesis(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("prop-1");
    expect(procesos[0].tipo).toBe("poligenesis");
    expect(procesos[0].estado).toBe("esperando");
    expect(procesos[1].id).toBe("prop-2");
    expect(procesos[1].tipo).toBe("poligenesis");
    expect(procesos[1].estado).toBe("en-marcha");
  });
});

describe("desdeSuenos", () => {
  it("normaliza datos de sueños a procesos", () => {
    const datos = {
      suenos: [
        {
          id: "dream-1",
          titulo: "Primer Sueño",
          estado: "esperando",
          modelo: "model-x",
          creado_en: "2024-01-01T00:00:00Z",
        },
        {
          run_id: "dream-2",
          name: "Segundo Sueño",
          estado: "en-marcha",
        },
      ],
    };
    const procesos = desdeSuenos(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("dream-1");
    expect(procesos[0].tipo).toBe("sueno");
    expect(procesos[1].id).toBe("dream-2");
    expect(procesos[1].tipo).toBe("sueno");
  });
});

describe("desdeImaginacion", () => {
  it("normaliza datos de imaginación a procesos", () => {
    const datos = {
      imaginacion: {
        ejecuciones: [
          {
            id: "imag-1",
            titulo: "Primera Imaginación",
            estado: "en-marcha",
            modelo: "model-im",
            creado_en: "2024-01-01T00:00:00Z",
          },
          {
            run_id: "imag-2",
            name: "Segunda Imaginación",
            estado: "pausado",
          },
        ],
      },
    };
    const procesos = desdeImaginacion(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("imag-1");
    expect(procesos[0].tipo).toBe("imaginacion");
    expect(procesos[1].id).toBe("imag-2");
    expect(procesos[1].tipo).toBe("imaginacion");
  });
});

describe("desdeInstalaciones", () => {
  it("normaliza datos de instalaciones a procesos", () => {
    const datos = {
      instalaciones: [
        {
          id: "inst-1",
          nombre: "Instalación Uno",
          estado: "pedida",
          aplicacion: "App A",
          creado_en: "2024-01-01T00:00:00Z",
          descripcion: "Primera descarga",
        },
        {
          instalacion_id: "inst-2",
          nombre: "Instalación Dos",
          estado: "descargada",
          aplicacion: "App B",
        },
      ],
    };
    const procesos = desdeInstalaciones(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("inst-1");
    expect(procesos[0].tipo).toBe("descarga");
    expect(procesos[0].estado).toBe("esperando");
    expect(procesos[1].id).toBe("inst-2");
    expect(procesos[1].tipo).toBe("instalacion");
    expect(procesos[1].estado).toBe("en-marcha");
  });
});

describe("desdeActualizaciones", () => {
  it("normaliza datos de actualizaciones a procesos", () => {
    const datos = {
      actualizaciones: [
        {
          id: "upd-1",
          nombre: "Actualización Uno",
          estado: "esperando",
          aplicacion: "App A",
          version: "v1.0.0",
          creado_en: "2024-01-01T00:00:00Z",
          descripcion: "Primera versión",
        },
        {
          nombre: "Actualización Dos",
          estado: "en-marcha",
          aplicacion: "App B",
          version: "v2.0.0",
        },
      ],
    };
    const procesos = desdeActualizaciones(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("upd-1");
    expect(procesos[0].tipo).toBe("actualizacion");
    expect(procesos[1].nombre).toBe("Actualización Dos");
    expect(procesos[1].id).toBe("v2.0.0");
  });
});

describe("desdeVentanas", () => {
  it("normaliza datos de ventanas a procesos", () => {
    const datos = {
      ventanas: [
        {
          id: "win-1",
          titulo: "Ventana Uno",
          aplicacion: "App A",
          minimizada: false,
        },
        {
          ventana_id: "win-2",
          titulo: "Ventana Dos",
          aplicacion: "App B",
          minimizada: true,
          minimizada_desde: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const procesos = desdeVentanas(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("win-1");
    expect(procesos[0].tipo).toBe("app-fondo");
    expect(procesos[0].estado).toBe("en-marcha");
    expect(procesos[0].detalle).toBeUndefined();
    expect(procesos[1].id).toBe("win-2");
    expect(procesos[1].tipo).toBe("app-fondo");
    expect(procesos[1].estado).toBe("pausado");
    expect(procesos[1].detalle).toBe("Minimizada");
  });
});

describe("desdePresencia", () => {
  it("normaliza datos de presencia a procesos", () => {
    const datos = {
      presencia: [
        {
          id: "neuron-1",
          nombre: "Neurona Uno",
          visible: true,
          neurona_id: "n1",
        },
        {
          neurona_id: "n2",
          titulo: "Neurona Dos",
          visible: false,
          oculta_desde: "2024-01-01T00:00:00Z",
        },
      ],
    };
    const procesos = desdePresencia(datos);
    expect(procesos).toHaveLength(2);
    expect(procesos[0].id).toBe("neuron-1");
    expect(procesos[0].tipo).toBe("app-fondo");
    expect(procesos[0].estado).toBe("en-marcha");
    expect(procesos[1].id).toBe("n2");
    expect(procesos[1].tipo).toBe("app-fondo");
    expect(procesos[1].estado).toBe("pausado");
    expect(procesos[1].detalle).toBe("Neurona minimizada o invisible");
  });
});

describe("datos vacíos o rotos", () => {
  it("devuelve [] para datos vacíos o rotos", () => {
    expect(desdeAgentesMac(null)).toEqual([]);
    expect(desdeAgentesMac({})).toEqual([]);
    expect(desdeLatidos(null)).toEqual([]);
    expect(desdeLatidos({})).toEqual([]);
    expect(desdeNodos(null)).toEqual([]);
    expect(desdeNodos({})).toEqual([]);
    expect(desdePoligenesis(null)).toEqual([]);
    expect(desdePoligenesis({})).toEqual([]);
    expect(desdeSuenos(null)).toEqual([]);
    expect(desdeSuenos({})).toEqual([]);
    expect(desdeImaginacion(null)).toEqual([]);
    expect(desdeImaginacion({})).toEqual([]);
    expect(desdeInstalaciones(null)).toEqual([]);
    expect(desdeInstalaciones({})).toEqual([]);
    expect(desdeActualizaciones(null)).toEqual([]);
    expect(desdeActualizaciones({})).toEqual([]);
    expect(desdeVentanas(null)).toEqual([]);
    expect(desdeVentanas({})).toEqual([]);
    expect(desdePresencia(null)).toEqual([]);
    expect(desdePresencia({})).toEqual([]);
  });
});
