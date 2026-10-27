import { describe, it, expect } from "vitest";
import {
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
} from "../descubrimiento-progresivo";
import { type HerramientaMcp } from "../protocolo";

type RespuestaHerramienta = { contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean };

function crearHerramienta(
  nombre: string,
  descripcion: string,
  ejecutar?: (args: Record<string, unknown>, ctx?: unknown) => Promise<RespuestaHerramienta>
): HerramientaMcp {
  const esquema = { type: "object", properties: { limite: { type: "number" } } };
  return {
    nombre,
    descripcion,
    esquema,
    ejecutar: ejecutar ?? (async () => ({ contenido: [{ tipo: "texto", texto: `hecho con ${nombre}` }] })),
  };
}

/** Veinte herramientas falsas, con nombres y descripciones variadas. */
function hornearVeinte(): HerramientaMcp[] {
  const nombres = [
    ["tareas_listar", "Lista tareas del enjambre con su estado y cola"],
    ["tareas_crear", "Crea una tarea nueva en la cola indicada"],
    ["estado_sistema", "Obtiene el estado del sistema y sus puertas"],
    ["memoria_buscar", "Busca recuerdos por palabras clave"],
    ["memoria_guardar", "Guarda un recuerdo nuevo con etiquetas"],
    ["voz_sintetizar", "Sintetiza voz a partir de un texto"],
    ["voz_transcribir", "Transcribe un audio a texto"],
    ["imagen_generar", "Genera una imagen desde un texto descriptivo"],
    ["notificar_aleta", "Añade una fila a la aleta del control"],
    ["notificar_marea", "Añade una fila a la marea sonora"],
    ["credenciales_estado", "Verifica claves y créditos en tinta"],
    ["sabor_receta", "Gestión de recetas y sabor de kitchen"],
    ["depuracion_receta", "Depuración de recetas y cruza de salud"],
    ["juego_puntuacion", "Puntuación de la galería de juegos"],
    ["salud_pulsos", "Pulsos y calorías de salud"],
    ["materiales_crear", "Crea materiales diuréticos"],
    ["asistentes_crear", "Crea asistentes y sus temas"],
    ["galeria_publicar", "Publica la galería de los quedados"],
    ["kitchen_simular", "Simula la cocina con fuego y cocinar"],
    ["kitchen_asimular", "Desimula la cocina, a settlements"],
  ];
  return nombres.map(([nombre, descripcion]) => crearHerramienta(nombre, descripcion));
}

describe("tokenizar", () => {
  it("separa camelCase, guion bajo y quita tildes", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("Canción Eólica")).toEqual(["cancion", "eolica"]);
    expect(tokenizar("anilla-LimaConHielo")).toEqual(["anilla", "lima", "con", "hielo"]);
  });

  it("descarta tokens de un carácter y palabras vacías", () => {
    expect(tokenizar("a de la el los las un una y en the of to for and")).toEqual([]);
    expect(tokenizar("hola o")).toEqual(["hola"]);
  });
});

describe("índice BM25", () => {
  const indice = crearIndiceBm25(
    hornearVeinte().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` }))
  );

  it("«listar tareas» devuelve tareas_listar primero", () => {
    const resultados = indice.buscar("listar tareas", 5);
    expect(resultados[0].id).toBe("tareas_listar");
  });

  it("la consulta vacía no devuelve nada", () => {
    expect(indice.buscar("", 5)).toEqual([]);
    expect(indice.buscar("de la el y and", 5)).toEqual([]);
  });

  it("el empate es estable por id ascendente", () => {
    const plano = crearIndiceBm25([
      { id: "zebra_zulu", texto: "igual" },
      { id: "alpha_undo", texto: "igual" },
      { id: "mango_igual", texto: "igual" },
    ]);
    expect(plano.buscar("igual", 10).map((r) => r.id)).toEqual([
      "alpha_undo",
      "mango_igual",
      "zebra_zulu",
    ]);
  });

  it("respeta el límite pedido", () => {
    expect(indice.buscar("kitchen", 2)).toHaveLength(2);
  });
});

describe("envolverProgresivo · umbral", () => {
  const veinte = hornearVeinte();
  const pocas = veinte.slice(0, UMBRAL_PROGRESIVO);

  it("con ≤ umbral devuelve la misma lista, sin envolver", () => {
    const envueltas = envolverProgresivo(pocas);
    expect(envueltas).toBe(pocas);
  });

  it("con > umbral devuelve exactamente las tres metaherramientas", () => {
    const envueltas = envolverProgresivo(veinte);
    expect(envueltas.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });
});

describe("descubrir_herramientas · perfiles por medio", () => {
  const veinte = hornearVeinte();

  it("el perfil pequeño da como mucho 3 resultados, descripciones ≤ 80 y sin esquema", async () => {
    const [descubrir] = envolverProgresivo(veinte, { medio: "modelo-pequeno" });
    const respuesta = await descubrir.ejecutar({ consulta: "kitchen cocina" });
    const datos = JSON.parse(respuesta.contenido[0].texto) as { resultados: unknown[] };
    expect(datos.resultados).toHaveLength(3);
    for (const r of datos.resultados) {
      const item = r as { descripcion: string; esquema?: unknown };
      expect(item.descripcion.length).toBeLessThanOrEqual(80);
      expect(item.esquema).toBeUndefined();
    }
  });

  it("el perfil grande sí incluye el esquema", async () => {
    const [descubrir] = envolverProgresivo(veinte, { medio: "modelo-grande" });
    const respuesta = await descubrir.ejecutar({ consulta: "kitchen cocina" });
    const datos = JSON.parse(respuesta.contenido[0].texto) as {
      resultados: Array<{ esquema?: unknown }>;
    };
    expect(datos.resultados[0].esquema).toBeDefined();
  });

  it("sin resultados devuelve sugerencia y el límite nunca pasa del del medio", async () => {
    const [descubrir] = envolverProgresivo(veinte, { medio: "modelo-pequeno" });
    const vacia = await descubrir.ejecutar({ consulta: "zzz" });
    expect(JSON.parse(vacia.contenido[0].texto)).toEqual({
      resultados: [],
      sugerencia: "prueba con otras palabras",
    });
    const mucha = await descubrir.ejecutar({ consulta: "kitchen", limite: 99 });
    const datos = JSON.parse(mucha.contenido[0].texto) as { resultados: unknown[] };
    expect(datos.resultados.length).toBe(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
  });
});

describe("detalle_herramienta y ejecutar_herramienta", () => {
  const veinte = hornearVeinte();
  const conEco = [
    ...veinte,
    crearHerramienta("eco_probar", "Devuelve lo recibido", async (args, ctx) => ({
      contenido: [{ tipo: "texto", texto: `eco ${String(ctx)} ${JSON.stringify(args)}` }],
    })),
  ];

  it("detalle da nombre, descripción y esquema completos de una visible", async () => {
    const [, detalle] = envolverProgresivo(conEco);
    const respuesta = await detalle.ejecutar({ nombre: "eco_probar" });
    const datos = JSON.parse(respuesta.contenido[0].texto) as Record<string, unknown>;
    expect(datos.nombre).toBe("eco_probar");
    expect(datos.descripcion).toBe("Devuelve lo recibido");
    expect(datos.esquema).toBeDefined();
  });

  it("detalle de una desconocida falla con el texto del contrato", async () => {
    const [, detalle] = envolverProgresivo(conEco);
    const respuesta = await detalle.ejecutar({ nombre: "secreta_oculta" });
    expect(respuesta.esError).toBe(true);
    expect(respuesta.contenido[0].texto).toBe("Herramienta desconocida o no permitida: secreta_oculta");
  });

  it("ejecutar delega los argumentos y el ctx recibido a la herramienta", async () => {
    const contexto = { cuenta: "prueba" };
    const envueltas = envolverProgresivo(conEco);
    const ejecutar = envueltas.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar?.ejecutar(
      { nombre: "eco_probar", argumentos: { limite: 4 } },
      contexto
    );
    expect(respuesta?.contenido[0].texto).toContain("eco prueba");
    expect(respuesta?.contenido[0].texto).toContain("limite");
  });

  it("ejecutar no puede llamar a una metaherramienta ni a una desconocida", async () => {
    const [descubrir, detalle, ejecutar] = envolverProgresivo(conEco);
    for (const meta of [descubrir, detalle, ejecutar]) {
      const respuesta = await ejecutar.ejecutar({ nombre: meta.nombre });
      expect(respuesta.esError).toBe(true);
      expect(respuesta.contenido[0].texto).toBe(
        "Herramienta desconocida o no permitida: " + meta.nombre
      );
    }
  });
});

describe("permitida · el ámbito manda antes de descubrir", () => {
  const veinte = hornearVeinte();
  const opciones = { medio: "modelo-pequeno" as const, permitida: (h: HerramientaMcp) => !h.nombre.includes("kitchen") };

  it("oculta las excluidas del descubrimiento", async () => {
    const [descubrir] = envolverProgresivo(veinte, opciones);
    const respuesta = await descubrir.ejecutar({ consulta: "kitchen cocina" });
    const datos = JSON.parse(respuesta.contenido[0].texto) as { resultados: Array<{ nombre: string }> };
    for (const r of datos.resultados) {
      expect(r.nombre).not.toContain("kitchen");
    }
  });

  it("oculta las excluidas del detalle y de la ejecución", async () => {
    const [, detalle] = envolverProgresivo(veinte, opciones);
    const respuestaDetalle = await detalle.ejecutar({ nombre: "kitchen_simular" });
    expect(respuestaDetalle.esError).toBe(true);
    expect(respuestaDetalle.contenido[0].texto).toBe(
      "Herramienta desconocida o no permitida: kitchen_simular"
    );
    const envueltas = envolverProgresivo(veinte, opciones);
    const ejecutar = envueltas.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar?.ejecutar({ nombre: "kitchen_simular" });
    expect(respuesta?.esError).toBe(true);
    expect(respuesta?.contenido[0].texto).toContain("no permitida");
  });
});

describe("herramienta que lanza · sin filtrar la excepción", () => {
  /** Cadena con forma de clave, montada en tiempo de ejecución para no empujarla al repo. */
  const claveEjemplo = ["sk", "-", "a".repeat(24)].join("");

  const llena = Array.from({ length: 14 }, (_, i) =>
    crearHerramienta(`llena_${i}`, "Relleno para pasar el umbral")
  );
  const conFallona = [
    crearHerramienta("fallona_prueba", "Siempre lanza", async () => {
      throw new Error(claveEjemplo);
    }),
    ...llena,
  ];

  it("el error que sale es «La herramienta falló.», sin pila ni detalles", async () => {
    const envueltas = envolverProgresivo(conFallona);
    const ejecutar = envueltas.find((h) => h.nombre === "ejecutar_herramienta");
    const respuesta = await ejecutar?.ejecutar({ nombre: "fallona_prueba" });
    expect(respuesta?.esError).toBe(true);
    expect(respuesta?.contenido[0].texto).toBe("La herramienta falló.");
    expect(respuesta?.contenido[0].texto).not.toContain(claveEjemplo);
  });
});
