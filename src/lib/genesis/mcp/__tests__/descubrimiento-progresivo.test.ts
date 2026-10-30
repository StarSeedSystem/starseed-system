import { describe, it, expect } from "vitest";
import type { HerramientaMcp } from "../protocolo";
import {
  METAHERRAMIENTAS,
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  crearIndiceBm25,
  envolverProgresivo,
  tokenizar,
} from "../descubrimiento-progresivo";

type Salida = { contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean };

function herramienta(
  nombre: string,
  descripcion = `Herramienta ${nombre}`,
  ejecutar?: HerramientaMcp["ejecutar"]
): HerramientaMcp {
  const porDefecto: HerramientaMcp["ejecutar"] = async () => ({
    contenido: [{ tipo: "texto", texto: `ok:${nombre}` }],
  });
  return {
    nombre,
    descripcion,
    esquema: { type: "object", properties: { consulta: { type: "string" } } },
    ejecutar: ejecutar ?? porDefecto,
  };
}

function meta(herramientas: HerramientaMcp[], nombre: string): HerramientaMcp {
  const h = herramientas.find((x) => x.nombre === nombre);
  if (!h) throw new Error(`No existe la metaherramienta ${nombre}`);
  return h;
}

function texto(salida: Salida): string {
  return salida.contenido[0]?.texto ?? "";
}

function cuerpo(salida: Salida): Record<string, unknown> {
  return JSON.parse(texto(salida)) as Record<string, unknown>;
}

const NOMBRES_20 = [
  "tareas_listar", "tareas_crear", "agentes_listar", "agente_detalle",
  "medidores", "estado", "chat", "biblioteca_buscar", "opciones_sugerir", "proposer",
  "proyectos_listar", "proyectos_crear", "salas_listar", "salas_unir", "musica_reproducir",
  "voz_hablar", "imagen_generar", "video_generar", "correo_enviar", "calendario_listar",
];

function veinteHerramientas(): HerramientaMcp[] {
  return NOMBRES_20.map((nombre) => herramienta(nombre));
}

function herramientasTareas(cantidad: number): HerramientaMcp[] {
  return Array.from({ length: cantidad }, (_, i) =>
    herramienta(`tareas_${i}`, `Descripción larga número ${i}. `.repeat(10))
  );
}

describe("tokenizar", () => {
  it("separa camelCase y guion bajo", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });

  it("quita tildes, pasa a minúsculas y descarta palabras vacías", () => {
    expect(tokenizar("Índice de la Gestión")).toEqual(["indice", "gestion"]);
    expect(tokenizar("the list of tasks")).toEqual(["list", "tasks"]);
    expect(tokenizar("a y de la el")).toEqual([]);
  });

  it("descarta tokens de un solo carácter", () => {
    expect(tokenizar("x 1 a bb")).toEqual(["bb"]);
  });
});

describe("crearIndiceBm25", () => {
  it("devuelve tareas_listar primero para «listar tareas»", () => {
    const indice = crearIndiceBm25(
      veinteHerramientas().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` }))
    );
    const resultados = indice.buscar("listar tareas", 20);
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados[0].id).toBe("tareas_listar");
    expect(resultados.every((r) => r.puntuacion > 0)).toBe(true);
  });

  it("consulta vacía devuelve lista vacía", () => {
    const indice = crearIndiceBm25([{ id: "a", texto: "listar tareas" }]);
    expect(indice.buscar("", 10)).toEqual([]);
    expect(indice.buscar("de la el", 10)).toEqual([]);
  });

  it("ordena los empates por id ascendente", () => {
    const indice = crearIndiceBm25([
      { id: "zeta", texto: "misma palabra" },
      { id: "alfa", texto: "misma palabra" },
    ]);
    expect(indice.buscar("palabra", 10).map((r) => r.id)).toEqual(["alfa", "zeta"]);
  });
});

describe("envolverProgresivo · presupuesto", () => {
  it("los perfiles y el umbral respetan lo pedido", () => {
    expect(PERFILES_MEDIO["modelo-pequeno"]).toEqual({
      maxResultados: 3,
      maxDescripcion: 80,
      conEsquema: false,
    });
    expect(PERFILES_MEDIO["modelo-mediano"]).toEqual({
      maxResultados: 5,
      maxDescripcion: 160,
      conEsquema: false,
    });
    expect(PERFILES_MEDIO["modelo-grande"]).toEqual({
      maxResultados: 8,
      maxDescripcion: 400,
      conEsquema: true,
    });
    expect(UMBRAL_PROGRESIVO).toBe(12);
    expect([...METAHERRAMIENTAS]).toEqual([
      "descubrir_herramientas",
      "detalle_herramienta",
      "ejecutar_herramienta",
    ]);
  });

  it("con ≤ umbral devuelve las mismas herramientas sin cambios", () => {
    const herramientas = [
      herramienta("una"),
      herramienta("dos"),
      herramienta("tres"),
      ...Array.from({ length: UMBRAL_PROGRESIVO - 3 }, (_, i) => herramienta(`extra_${i}`)),
    ];
    expect(herramientas).toHaveLength(UMBRAL_PROGRESIVO);
    const envueltas = envolverProgresivo(herramientas);
    expect(envueltas).toHaveLength(UMBRAL_PROGRESIVO);
    expect(envueltas.map((h) => h.nombre)).toEqual(herramientas.map((h) => h.nombre));
    expect(envueltas[0]).toBe(herramientas[0]);
  });

  it("con > umbral devuelve exactamente las tres metaherramientas", () => {
    const herramientas = Array.from({ length: UMBRAL_PROGRESIVO + 1 }, (_, i) =>
      herramienta(`h_${i}`)
    );
    const envueltas = envolverProgresivo(herramientas);
    expect(envueltas.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });
});

describe("descubrir_herramientas", () => {
  it("sin resultados devuelve lista vacía y sugerencia", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15));
    const salida = await meta(envueltas, "descubrir_herramientas").ejecutar({
      consulta: "ornitorrinco",
    });
    const datos = cuerpo(salida);
    expect(datos.resultados).toEqual([]);
    expect(datos.total).toBe(0);
    expect(datos.sugerencia).toBe("prueba con otras palabras");
  });

  it("el perfil pequeño limita a 3, recorta a 80 y omite el esquema", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15), { medio: "modelo-pequeno" });
    const salida = await meta(envueltas, "descubrir_herramientas").ejecutar({
      consulta: "tareas",
      limite: 99,
    });
    const datos = cuerpo(salida);
    const resultados = datos.resultados as Array<Record<string, unknown>>;
    expect(resultados).toHaveLength(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
    for (const r of resultados) {
      expect(String(r.descripcion).length).toBeLessThanOrEqual(80);
      expect("esquema" in r).toBe(false);
    }
    expect(datos.total).toBeGreaterThanOrEqual(resultados.length);
  });

  it("el perfil grande incluye esquema y descripciones hasta 400", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15), { medio: "modelo-grande" });
    const salida = await meta(envueltas, "descubrir_herramientas").ejecutar({
      consulta: "tareas",
      limite: 99,
    });
    const resultados = (cuerpo(salida) as { resultados: Array<Record<string, unknown>> })
      .resultados;
    expect(resultados.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-grande"].maxResultados);
    expect(resultados.length).toBeGreaterThan(0);
    for (const r of resultados) {
      expect("esquema" in r).toBe(true);
      expect(String(r.descripcion).length).toBeLessThanOrEqual(400);
    }
  });
});

describe("detalle_herramienta", () => {
  it("devuelve nombre, descripción y esquema completos", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15), { medio: "modelo-pequeno" });
    const datos = cuerpo(
      await meta(envueltas, "detalle_herramienta").ejecutar({ nombre: "tareas_0" })
    );
    expect(datos.nombre).toBe("tareas_0");
    expect(String(datos.descripcion).length).toBeGreaterThan(80);
    expect(datos.esquema).toBeTruthy();
  });

  it("falla con una herramienta desconocida", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15));
    const salida = await meta(envueltas, "detalle_herramienta").ejecutar({ nombre: "no_existe" });
    expect(salida.esError).toBe(true);
    expect(texto(salida)).toBe("Herramienta desconocida o no permitida: no_existe");
  });
});

describe("permitida", () => {
  function crearConSecreto(): { herramientas: HerramientaMcp[]; llamado: () => boolean } {
    let llamado = false;
    const secreta: HerramientaMcp["ejecutar"] = async () => {
      llamado = true;
      return { contenido: [{ tipo: "texto", texto: "secreto" }] };
    };
    return {
      herramientas: [
        herramienta("visible_uno"),
        herramienta("visible_dos"),
        herramienta("visible_tres"),
        herramienta("secreto", "Herramienta secreta", secreta),
      ],
      llamado: () => llamado,
    };
  }

  it("oculta la herramienta del descubrimiento, del detalle y de la ejecución", async () => {
    const { herramientas, llamado } = crearConSecreto();
    const envueltas = envolverProgresivo(herramientas, {
      umbral: 2,
      permitida: (h) => h.nombre !== "secreto",
    });
    expect(envueltas.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);

    const hallados = (
      cuerpo(
        await meta(envueltas, "descubrir_herramientas").ejecutar({ consulta: "secreto" })
      ) as { resultados: Array<{ nombre: string }> }
    ).resultados;
    expect(hallados.some((r) => r.nombre === "secreto")).toBe(false);

    const detalle = await meta(envueltas, "detalle_herramienta").ejecutar({
      nombre: "secreto",
    });
    expect(detalle.esError).toBe(true);
    expect(texto(detalle)).toBe("Herramienta desconocida o no permitida: secreto");

    const ejecucion = await meta(envueltas, "ejecutar_herramienta").ejecutar({
      nombre: "secreto",
      argumentos: {},
    });
    expect(ejecucion.esError).toBe(true);
    expect(llamado()).toBe(false);
  });
});

describe("ejecutar_herramienta", () => {
  it("no permite llamar a una metaherramienta ni a una desconocida", async () => {
    const envueltas = envolverProgresivo(herramientasTareas(15));
    const ejecutar = meta(envueltas, "ejecutar_herramienta");
    for (const nombre of ["descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta", "no_existe"]) {
      const salida = await ejecutar.ejecutar({ nombre });
      expect(salida.esError).toBe(true);
      expect(texto(salida)).toBe(`Herramienta desconocida o no permitida: ${nombre}`);
    }
  });

  it("pasa el ctx y los argumentos, y devuelve el resultado tal cual", async () => {
    let contextoRecibido: unknown = null;
    let argumentosRecibidos: Record<string, unknown> | null = null;
    const eco = herramienta("eco", "Eco", async (args, ctx) => {
      argumentosRecibidos = args;
      contextoRecibido = ctx;
      return { contenido: [{ tipo: "texto", texto: "respuesta-eco" }] };
    });
    const envueltas = envolverProgresivo([eco, ...herramientasTareas(14)]);
    const contexto = { ambito: "prueba" };
    const salida = await meta(envueltas, "ejecutar_herramienta").ejecutar(
      { nombre: "eco", argumentos: { a: 1 } },
      contexto
    );
    expect(contextoRecibido).toBe(contexto);
    expect(argumentosRecibidos).toEqual({ a: 1 });
    expect(salida.esError).toBeUndefined();
    expect(texto(salida)).toBe("respuesta-eco");
  });

  it("una herramienta que lanza no filtra el mensaje de la excepción", async () => {
    const falla = herramienta("falla", "Falla", async () => {
      throw new Error("secreto-interno-que-no-debe-salir");
    });
    const envueltas = envolverProgresivo([falla, ...herramientasTareas(14)]);
    const salida = await meta(envueltas, "ejecutar_herramienta").ejecutar({ nombre: "falla" });
    expect(salida.esError).toBe(true);
    expect(texto(salida)).toBe("La herramienta falló.");
    expect(texto(salida)).not.toContain("secreto-interno");
  });
});
