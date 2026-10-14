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
  type ProcesoActivo,
  type TipoProceso
} from "../procesos-normalizar";

describe("desdeAgentesMac", () => {
  it("devuelve un array de ProcesoActivo tipo génesis a partir de sesiones y procesos", () => {
    const input = {
      sesiones: [
        { id: "s1", titulo: "Sesión 1", activa: true, ultimaAccion: "accion" },
        { id: "s2", titulo: "Sesión 2", activa: false },
      ],
      procesos: [
        { pid: 1, tipo: "orquestador", detalle: "detalle" },
        { pid: 2, tipo: "agente", detalle: "detalle2" },
      ],
      generadoEn: new Date().toISOString(),
    };
    const result = desdeAgentesMac(input);
    expect(result.length).toBe(4);
    // Check first session
    expect(result[0]).toMatchObject({
      id: "s1",
      tipo: "genesis",
      nombre: "Sesión 1",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "accion",
      fuente: "/api/mando/agentes",
    });
    // Check second session
    expect(result[1]).toMatchObject({
      id: "s2",
      tipo: "genesis",
      nombre: "Sesión 2",
      estado: "esperando",
      progreso: null,
      donde: "",
      detalle: undefined,
      fuente: "/api/mando/agentes",
    });
    // Check first process
    expect(result[2]).toMatchObject({
      id: "proc-1",
      tipo: "genesis",
      nombre: "orquestador",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "detalle",
      fuente: "/api/mando/agentes",
    });
    // Check second process
    expect(result[3]).toMatchObject({
      id: "proc-2",
      tipo: "genesis",
      nombre: "agente",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "detalle2",
      fuente: "/api/mando/agentes",
    });
  });
});

describe("desdeLatidos", () => {
  it("devuelve un array de ProcesoActivo tipo génesis a partir de latidos", () => {
    const input = {
      latidos: [
        {
          tarea: "tarea1",
          fase: "fase1",
          modelo: "modelo1",
          minutos: 5,
          donde: "donde1",
          titulo: "Título 1",
        },
        {
          tarea: "tarea2",
          fase: "fase2",
          modelo: "modelo2",
          minutos: 10,
          donde: "donde2",
        },
      ],
    };
    const result = desdeLatidos(input);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "tarea1",
      tipo: "genesis",
      nombre: "Título 1",
      estado: "en-marcha",
      progreso: null,
      donde: "donde1",
      detalle: "fase1 modelo1",
      fuente: "/api/mando/medidores",
    });
    expect(result[1]).toMatchObject({
      id: "tarea2",
      tipo: "genesis",
      nombre: "tarea2",
      estado: "en-marcha",
      progreso: null,
      donde: "donde2",
      detalle: "fase2 modelo2",
      fuente: "/api/mando/medidores",
    });
  });
});

describe("desdeNodos", () => {
  it("devuelve un array de ProcesoActivo tipo génesis a partir de leerEstadoAutonomo", () => {
    const input = {
      modo: "bus",
      lider: "nodo1",
      termino: 1000,
      autonomia: true,
      nodos: [
        {
          nodo: "nodo1",
          medio: "medio1",
          orquestadores: ["orq1", "orq2"],
          vivo: true,
          lider: true,
        },
        {
          nodo: "nodo2",
          medio: "medio2",
          orquestadores: ["orq3"],
          vivo: false,
          lider: false,
        },
        {
          nodo: "nodo3",
          medio: "medio3",
          orquestadores: [],
          vivo: true,
          lider: false,
        },
      ],
      medidores: {},
      decisiones: [],
      ordenes: [],
      fotoHaceMs: null,
      liderSeco: false,
    };
    const result = desdeNodos(input);
    expect(result.length).toBe(2); // Only nodo1 and nodo3 are vivos, and nodo1 has two orquestadores, nodo3 has none
    // Check first orquestador of nodo1
    expect(result[0]).toMatchObject({
      id: "nodo1:orq1",
      tipo: "genesis",
      nombre: "orq1",
      estado: "en-marcha",
      progreso: null,
      donde: "nodo1",
      detalle: "medio1",
      fuente: "leerEstadoAutonomo",
    });
    // Check second orquestador of nodo1
    expect(result[1]).toMatchObject({
      id: "nodo1:orq2",
      tipo: "genesis",
      nombre: "orq2",
      estado: "en-marcha",
      progreso: null,
      donde: "nodo1",
      detalle: "medio1",
      fuente: "leerEstadoAutonomo",
    });
    // Check nodo3 (no orquestadores, so no procesos)
    // Actually, nodo3 has no orquestadores, so it should not contribute any procesos.
    // So we expect only two procesos from nodo1.
    // Let's adjust the test: nodo3 has an empty orquestadores array, so it should not add any procesos.
    // Therefore, we expect only 2 procesos.
    expect(result.length).toBe(2);
  });
});

describe("desdePoligenesis", () => {
  it("devuelve un array de ProcesoActivo tipo poligénesis a partir de operaciones propuesta", () => {
    const input = {
      entradas: [
        {
          id: "e1",
          titulo: "Título 1",
          estado: "propuesta",
          resultado: "resultado",
          donde: "cuenta",
        },
        {
          id: "e2",
          titulo: "Título 2",
          estado: "aplicada",
          resultado: "resultado",
          donde: "aparato",
        },
        {
          id: "e3",
          titulo: "Título 3",
          estado: "propuesta",
          resultado: "resultado",
          donde: "cuenta",
        },
      ],
    };
    const result = desdePoligenesis(input);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "e1",
      tipo: "poligenesis",
      nombre: "Título 1",
      estado: "esperando",
      progreso: null,
      donde: "cuenta",
      detalle: "resultado",
      fuente: "leerHistorial",
    });
    expect(result[1]).toMatchObject({
      id: "e3",
      tipo: "poligenesis",
      nombre: "Título 3",
      estado: "esperando",
      progreso: null,
      donde: "cuenta",
      detalle: "resultado",
      fuente: "leerHistorial",
    });
  });
});

describe("desdeSuenos", () => {
  it("devuelve un array de ProcesoActivo tipo sueño a partir de datos de suenos y dream status", () => {
    const input = {
      suenos: {
        sesion: {
          sesion: "sesion1",
          total: 2,
          cuentas: {},
          filas: [
            {
              id: "f1",
              area: "area1",
              lente: "lente1",
              estado: "analizando",
              privado: false,
              modelo: "modelo1",
              proveedor: "proveedor1",
              subfase: "subfase1",
              tokens: 10,
              llamadas: 5,
              segundos: 100,
              hallazgos: 2,
              por: "por1",
              nota: "nota1",
            },
            {
              id: "f2",
              area: "area2",
              lente: "lente2",
              estado: "pendiente",
              privado: true,
              modelo: "modelo2",
              proveedor: "proveedor2",
              subfase: "subfase2",
              tokens: 5,
              llamadas: 2,
              segundos: 50,
              hallazgs: 1,
              por: "por2",
              nota: "nota2",
            },
          ],
          tokens: 15,
          completa: false,
          orquestadorVivo: true,
          informeFinal: false,
          informeMd: null,
          propuesta: null,
          consolidado: null,
          ultimoLanzamiento: null,
        },
        sesiones: ["sesion1"],
        areas: [],
        lentes: [],
      },
      dreamStatus: {
        is_dreaming: true,
        is_always_on: false,
        operation_mode: "mode",
        next_cycle_seconds_left: 100,
        cycles_completed: 5,
      },
    };
    const result = desdeSuenos(input);
    // We expect two procesos: one from the fila in estado "analizando" and one from the dream status
    expect(result.length).toBe(2);
    // Check the fila process
    expect(result[0]).toMatchObject({
      id: "f1",
      tipo: "sueno",
      nombre: "area1 -- lente1",
      estado: "en-marcha",
      progreso: null,
      donde: "area1",
      detalle: "lente1 modelo1 subfase1",
      fuente: "/api/mando/suenos",
    });
    // Check the dream status process
    expect(result[1]).toMatchObject({
      id: "sueño-general",
      tipo: "sueno",
      nombre: "Sueño en curso",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "Sueño profundo activo",
      fuente: "fetchAstraura158DreamStatus",
    });
  });
});

describe("desdeImaginacion", () => {
  it("devuelve un array de ProcesoActivo tipo imaginación a partir de imagination status y runs en curso", () => {
    const input = {
      imaginationStatus: {
        active_processes_count: 2,
        active_agents_count: 3,
        is_paused_due_to_threshold: false,
      },
      runs: [
        {
          id: "r1",
          title: "Run 1",
          status: "running",
          mode: "juntos",
          server: "propio",
          imagine_id: "i1",
          ai_config: {},
          steps: [],
          result: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "r2",
          title: "Run 2",
          status: "paused",
          mode: "fondo",
          server: "starseed",
          imagine_id: "i2",
          ai_config: {},
          steps: [],
          result: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: "r3",
          title: "Run 3",
          status: "running",
          mode: "juntos",
          server: "auto",
          imagine_id: "i3",
          ai_config: {},
          steps: [],
          result: null,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ],
    };
    const result = desdeImaginacion(input);
    // We expect two procesos from the runs with status "running" (r1 and r3)
    // Plus one optional process from the imagination status (since active_processes_count > 0)
    expect(result.length).toBe(3);
    // Check the first run process
    expect(result[0]).toMatchObject({
      id: "r1",
      tipo: "imaginacion",
      nombre: "Run 1",
      estado: "en-marcha",
      progreso: null,
      donde: "propio",
      detalle: "Modo: juntos",
      fuente: "imagine_runs",
    });
    // Check the second run process
    expect(result[1]).toMatchObject({
      id: "r3",
      tipo: "imaginacion",
      nombre: "Run 3",
      estado: "en-marcha",
      progreso: null,
      donde: "auto",
      detalle: "Modo: juntos",
      fuente: "imagine_runs",
    });
    // Check the optional process from imagination status
    expect(result[2]).toMatchObject({
      id: "imaginacion-general",
      tipo: "imaginacion",
      nombre: "Imaginación en curso",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "Proceso de imaginación activo",
      fuente: "fetchAstraura158ImaginationStatus",
    });
  });
});

describe("desdeInstalaciones", () => {
  it("devuelve un array de ProcesoActivo de tipo descarga e instalación a partir de estados de instalaciones", () => {
    const input = [
      {
        id: "inst1",
        appNombre: "App 1",
        estado: "pedida",
        neuronaNombre: "Neurona 1",
        medio: "descarga",
        pedidaDesde: "desde1",
      },
      {
        id: "inst2",
        appNombre: "App 2",
        estado: "descargada",
        neuronaNombre: "Neurona 2",
        medio: "pwa",
        pedidaDesde: "desde2",
      },
      {
        id: "inst3",
        appNombre: "App 3",
        estado: "instalada",
        neuronaNombre: "Neurona 3",
        medio: "web",
        pedidaDesde: "desde3",
      },
    ];
    const result = desdeInstalaciones(input);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "inst1",
      tipo: "descarga",
      nombre: "App 1",
      estado: "en-marcha",
      progreso: null,
      donde: "Neurona 1",
      detalle: "descarga",
      fuente: "instalaciones",
    });
    expect(result[1]).toMatchObject({
      id: "inst2",
      tipo: "instalacion",
      nombre: "App 2",
      estado: "en-marcha",
      progreso: null,
      donde: "Neurona 2",
      detalle: "pwa",
      fuente: "instalaciones",
    });
  });
});

describe("desdeActualizaciones", () => {
  it("devuelve un array de ProcesoActivo tipo actualización a partir de capas pendientes", () => {
    const input = [
      {
        capa: "datos",
        tiene: "1.0.0",
        deberia: "2.0.0",
        como: {
          gesto: "en-caliente",
          interrumpe: false,
          reinstala: false,
          pesada: false,
          texto: "Se aplica en caliente, sin recargar.",
        },
      },
      {
        capa: "modelos",
        tiene: null,
        deberia: "3.0.0",
        como: {
          gesto: "descarga-verificada",
          interrumpe: false,
          reinstala: false,
          pesada: true,
          texto: "Descarga verificada por su huella y cambio en caliente.",
        },
      },
      {
        capa: "interfaz",
        tiene: "1.5.0",
        deberia: "1.5.0",
        como: {
          gesto: "recarga-suave",
          interrumpe: true,
          reinstala: false,
          pesada: false,
          texto: "Recarga suave cuando no estás escribiendo, en una llamada ni en un directo.",
        },
      },
    ];
    const result = desdeActualizaciones(input);
    // We expect two procesos: one for datos (pendiente) and one for modelos (pendiente)
    // The interfaz layer is not pendiente because tiene == deberia, so it should be skipped.
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "datos:2.0.0",
      tipo: "actualizacion",
      nombre: "datos",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "Debería: 2.0.0, Tiene: 1.0.0",
      fuente: "actualizaciones",
    });
    expect(result[1]).toMatchObject({
      id: "modelos:3.0.0",
      tipo: "actualizacion",
      nombre: "modelos",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "Debería: 3.0.0, Tiene: ",
      fuente: "actualizaciones",
    });
  });
});

describe("desdeVentanas", () => {
  it("devuelve un array de ProcesoActivo tipo app-fondo a partir de ventanas minimizadas", () => {
    const input = {
      desktops: [
        {
          activeId: "d1",
          windows: [
            {
              id: "w1",
              contentRef: { type: "app", name: "Ventana 1", ref: "ref1" },
              minimized: true,
              maximized: false,
              fullscreen: false,
              z: 1,
              x: 0,
              y: 0,
              w: 100,
              h: 100,
            },
            {
              id: "w2",
              contentRef: { type: "file", name: "Ventana 2", ref: "ref2" },
              minimized: false,
              maximized: true,
              fullscreen: false,
              z: 2,
              x: 100,
              y: 100,
              w: 100,
              h: 100,
            },
            {
              id: "w3",
              contentRef: { type: "widget", name: "Ventana 3", ref: "ref3" },
              minimized: true,
              maximized: false,
              fullscreen: false,
              z: 3,
              x: 200,
              y: 200,
              w: 100,
              h: 100,
            },
          ],
        },
        {
          activeId: "d2",
          windows: [
            {
              id: "w4",
              contentRef: { type: "app", name: "Ventana 4", ref: "ref4" },
              minimized: false,
              maximized: false,
              fullscreen: false,
              z: 4,
              x: 0,
              y: 0,
              w: 100,
              h: 100,
            },
          ],
        },
      ],
    };
    const result = desdeVentanas(input);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "w1",
      tipo: "app-fondo",
      nombre: "Ventana 1",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "app",
      fuente: "readDesktopsSnapshot",
    });
    expect(result[1]).toMatchObject({
      id: "w3",
      tipo: "app-fondo",
      nombre: "Ventana 3",
      estado: "en-marcha",
      progreso: null,
      donde: "",
      detalle: "widget",
      fuente: "readDesktopsSnapshot",
    });
  });
});

describe("desdePresencia", () => {
  it("devuelve un array de ProcesoActivo tipo app-fondo a partir de neuronas con visible === false", () => {
    const input = {
      conectado: true,
      medios: [
        {
          n: "neuron1",
          m: "medio1",
          tipo: "tipo1",
          etiqueta: "Etiqueta 1",
          visible: true,
          desde: "desde1",
          t: 1000,
          s: {},
          v: {},
        },
        {
          n: "neuron2",
          m: "medio2",
          tipo: "tipo2",
          etiqueta: "Etiqueta 2",
          visible: false,
          desde: "desde2",
          t: 2000,
          s: {},
          v: {},
        },
        {
          n: "neuron3",
          m: "medio3",
          tipo: "tipo3",
          etiqueta: "Etiqueta 3",
          visible: false,
          desde: "desde3",
          t: 3000,
          s: {},
          v: {},
        },
        {
          n: "neuron4",
          m: "medio4",
          tipo: "tipo4",
          etiqueta: "Etiqueta 4",
          visible: true,
          desde: "desde4",
          t: 4000,
          s: {},
          v: {},
        },
      ],
    };
    const result = desdePresencia(input);
    expect(result.length).toBe(2);
    expect(result[0]).toMatchObject({
      id: "medio2",
      tipo: "app-fondo",
      nombre: "Etiqueta 2",
      estado: "en-marcha",
      progreso: null,
      donde: "neuron2",
      detalle: "tipo2",
      fuente: "presenciaActual",
    });
    expect(result[1]).toMatchObject({
      id: "medio3",
      tipo: "app-fondo",
      nombre: "Etiqueta 3",
      estado: "en-marcha",
      progreso: null,
      donde: "neuron3",
      detalle: "tipo3",
      fuente: "presenciaActual",
    });
  });
});

describe("unirProcesos", () => {
  it("une listas de procesos sin duplicar por id, priorizando los que están en marcha", () => {
    const lista1: ProcesoActivo[] = [
      {
        id: "p1",
        tipo: "genesis",
        nombre: "Proceso 1",
        estado: "esperando",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
      {
        id: "p2",
        tipo: "genesis",
        nombre: "Proceso 2",
        estado: "en-marcha",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
    ];
    const lista2: ProcesoActivo[] = [
      {
        id: "p1",
        tipo: "genesis",
        nombre: "Proceso 1",
        estado: "en-marcha",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
      {
        id: "p3",
        tipo: "genesis",
        nombre: "Proceso 3",
        estado: "pausado",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
    ];
    const result = unirProcesos(lista1, lista2);
    // We expect three procesos: p1 (should be en-marcha from lista2), p2 (en-marcha from lista1), p3 (pausado from lista2)
    // The p1 from lista1 is esperando, but the p1 from lista2 is en-marcha, so we keep the en-marcha one.
    expect(result.length).toBe(3);
    // Check that p1 is en-marcha
    const p1 = result.find((p) => p.id === "p1");
    expect(p1).toBeDefined();
    expect(p1?.estado).toBe("en-marcha");
    // Check that p2 is en-marcha
    const p2 = result.find((p) => p.id === "p2");
    expect(p2).toBeDefined();
    expect(p2?.estado).toBe("en-marcha");
    // Check that p3 is pausado
    const p3 = result.find((p) => p.id === "p3");
    expect(p3).toBeDefined();
    expect(p3?.estado).toBe("pausado");
  });
});

describe("agruparPorTipo", () => {
  it("agrupa procesos por tipo", () => {
    const procesos: ProcesoActivo[] = [
      {
        id: "p1",
        tipo: "genesis",
        nombre: "Proceso 1",
        estado: "en-marcha",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
      {
        id: "p2",
        tipo: "sueno",
        nombre: "Proceso 2",
        estado: "en-marcha",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
      {
        id: "p3",
        tipo: "genesis",
        nombre: "Proceso 3",
        estado: "esperando",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
      {
        id: "p4",
        tipo: "imaginacion",
        nombre: "Proceso 4",
        estado: "en-marcha",
        progreso: null,
        donde: "",
        detalle: "",
        fuente: "test",
      },
    ];
    const result = agruparPorTipo(procesos);
    expect(result.genesis).toHaveLength(2);
    expect(result.sueno).toHaveLength(1);
    expect(result.imaginacion).toHaveLength(1);
    expect(result.poligenesis).toHaveLength(0);
    expect(result.descarga).toHaveLength(0);
    expect(result.instalacion).toHaveLength(0);
    expect(result.actualizacion).toHaveLength(0);
    expect(result["app-fondo"]).toHaveLength(0);
    expect(result.servicio).toHaveLength(0);
  });
});