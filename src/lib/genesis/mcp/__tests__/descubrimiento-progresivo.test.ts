import { describe, it, expect } from "vitest";
import type { HerramientaMcp } from "../protocolo";
import {
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  type MedioIa,
} from "../descubrimiento-progresivo";

const herramientaFalsa = (nombre: string, descripcion: string): HerramientaMcp => ({
  nombre,
  descripcion,
  esquema: {
    type: "object",
    properties: { [nombre.split("_")[0] ?? "dato"]: { type: "string" } },
  },
  ejecutar: async (args, ctx) => ({
    contenido: [{ tipo: "texto", texto: JSON.stringify({ nombre, args, ctx }) }],
  }),
});

const loteVeinte = (): HerramientaMcp[] => {
  const nombres = [
    "tareas_listar", "tareas_crear", "tareas_completar", "usuarios_listar", "usuarios_crear",
    "calendario_hoy", "calendario_semana", "correo_enviar", "correo_leer", "notas_buscar",
    "notas_crear", "archivos_subir", "archivos_descargar", "informes_generar", "informes_enviar",
    "grupos_crear", "grupos_listar", "salas_abrir", "salas_cerrar", "perfiles_actualizar",
  ].map((n) => herramientaFalsa(n, `herramienta de ${n}`));
  nombres[0].descripcion = "listar tareas pendientes del mando con filtro por sala";
  return nombres;
};

describe("tokenizar", () => {
  it("separa camelCase y guion bajo igual", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });

  it("quita tildes con NFD y pasa a minúsculas", () => {
    expect(tokenizar("Creación Órbita")).toEqual(["creacion", "orbita"]);
  });

  it("descarta palabras vacías y tokens de un carácter", () => {
    expect(tokenizar("La creación de un y en the of to for and x")).toEqual(["creacion"]);
  });
});

describe("crearIndiceBm25", () => {
  it("con 20 herramientas, «listar tareas» devuelve tareas_listar primero", () => {
    const indice = crearIndiceBm25(
      loteVeinte().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` }))
    );
    const resultados = indice.buscar("listar tareas", 5);
    expect(resultados[0]?.id).toBe("tareas_listar");
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados.length).toBeLessThanOrEqual(5);
  });

  it("consulta vacía devuelve []", () => {
    const indice = crearIndiceBm25([{ id: "a", texto: "algo" }]);
    expect(indice.buscar("", 5)).toEqual([]);
    expect(indice.buscar("de la y", 5)).toEqual([]);
  });

  it("empate estable por id ascendente", () => {
    const indice = crearIndiceBm25([
      { id: "b", texto: "alfa" },
      { id: "a", texto: "alfa" },
    ]);
    expect(indice.buscar("alfa", 10).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("envolverProgresivo", () => {
  it("umbral superado devuelve exactamente las tres metaherramientas", () => {
    const envuelto = envolverProgresivo(loteVeinte());
    expect(envuelto.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("por debajo del umbral devuelve las mismas herramientas", () => {
    const pocas = loteVeinte().slice(0, UMBRAL_PROGRESIVO);
    expect(envolverProgresivo(pocas).map((h) => h.nombre)).toEqual(pocas.map((h) => h.nombre));
  });

  type RespuestaDescubrir = {
    resultados: Array<{ nombre: string; descripcion: string; esquema?: unknown }>;
    total: number;
    sugerencia?: string;
  };

  const llamarDescubrir = async (envuelto: HerramientaMcp[], consulta: string, limite?: number) => {
    const descubrir = envuelto[0] as HerramientaMcp;
    const args: Record<string, unknown> = { consulta };
    if (limite !== undefined) args.limite = limite;
    const cruda = await descubrir.ejecutar(args, undefined);
    return JSON.parse(cruda.contenido[0]?.texto ?? "{}") as RespuestaDescubrir;
  };

  it("sin resultados devuelve [] y sugerencia", async () => {
    const respuesta = await llamarDescubrir(envolverProgresivo(loteVeinte(), { medio: "modelo-pequeno" }), "de la");
    expect(respuesta.resultados).toEqual([]);
    expect(respuesta.sugerencia).toBe("prueba con otras palabras");
  });

  it("perfil pequeño: 3 como mucho, descripciones ≤ 80 y sin esquema", async () => {
    const herramientas = loteVeinte();
    const respuesta = await llamarDescubrir(envolverProgresivo(herramientas, { medio: "modelo-pequeno" }), "tareas");
    expect(respuesta.resultados[0]?.nombre).toBe("tareas_listar");
    expect(respuesta.total).toBe(herramientas.length);
    for (const r of respuesta.resultados) {
      expect(r.descripcion.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxDescripcion);
      expect("esquema" in r).toBe(false);
    }
  });

  it("limita «limite» al máximo del perfil", async () => {
    const respuesta = await llamarDescubrir(
      envolverProgresivo(loteVeinte(), { medio: "modelo-pequeno" }), "herramienta", 100
    );
    expect(respuesta.resultados.length).toBe(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
  });

  it("perfil grande incluye el esquema de cada resultado", async () => {
    const respuesta = await llamarDescubrir(envolverProgresivo(loteVeinte(), { medio: "modelo-grande" }), "tareas");
    expect(respuesta.resultados.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-grande"].maxResultados);
    for (const r of respuesta.resultados) expect("esquema" in r).toBe(true);
  });

  it("detalle_herramienta devuelve esquema completo o esError con el texto pactado", async () => {
    const envuelto = envolverProgresivo(loteVeinte());
    const detalle = envuelto[1] as HerramientaMcp;
    const buena = await detalle.ejecutar({ nombre: "tareas_listar" }, undefined);
    const respuesta = JSON.parse(buena.contenido[0]?.texto ?? "{}") as { nombre: string; esquema: unknown };
    expect(respuesta.nombre).toBe("tareas_listar");
    expect(respuesta.esquema).toEqual(herramientaFalsa("tareas_listar", "").esquema);
    const mala = await detalle.ejecutar({ nombre: "no_existe" }, undefined);
    expect(mala.esError).toBe(true);
    expect(mala.contenido[0]?.texto).toBe("Herramienta desconocida o no permitida: no_existe");
  });
});

describe("filtrado por permitida y ejecución", () => {
  const lotePermitido = (permitida: (h: HerramientaMcp) => boolean) =>
    envolverProgresivo(loteVeinte(), { permitida, medio: "modelo-grande" });

  it("permitida oculta herramientas del descubrimiento", async () => {
    const envuelto = lotePermitido((h) => !h.nombre.startsWith("correo"));
    const descubrir = envuelto[0] as HerramientaMcp;
    const cruda = await descubrir.ejecutar({ consulta: "correo" }, undefined);
    const respuesta = JSON.parse(cruda.contenido[0]?.texto ?? "{}") as { resultados: unknown[] };
    expect(respuesta.resultados).toEqual([]);
  });

  it("permitida también oculta el detalle y la ejecución", async () => {
    const envuelto = lotePermitido((h) => !h.nombre.startsWith("correo"));
    const detalle = envuelto[1] as HerramientaMcp;
    const ejecutor = envuelto[2] as HerramientaMcp;
    const oculta = "correo_enviar";
    const detalleMalo = await detalle.ejecutar({ nombre: oculta }, undefined);
    expect(detalleMalo.esError).toBe(true);
    const ejecucionMala = await ejecutor.ejecutar({ nombre: oculta }, undefined);
    expect(ejecucionMala.esError).toBe(true);
    expect(ejecucionMala.contenido[0]?.texto).toBe(`Herramienta desconocida o no permitida: ${oculta}`);
  });

  it("ejecutar_herramienta no puede llamar a una metaherramienta ni a una desconocida", async () => {
    const envuelto = envolverProgresivo(loteVeinte());
    const ejecutor = envuelto[2] as HerramientaMcp;
    for (const nombre of METAHERRAMIENTAS) {
      const cruda = await ejecutor.ejecutar({ nombre }, undefined);
      expect(cruda.esError).toBe(true);
    }
    const desconocida = await ejecutor.ejecutar({ nombre: "fantasma" }, undefined);
    expect(desconocida.esError).toBe(true);
  });

  it("el ctx llega a la herramienta ejecutada", async () => {
    const envuelto = envolverProgresivo(loteVeinte());
    const ejecutor = envuelto[2] as HerramientaMcp;
    const ctx = { sala: "mandateste" };
    const cruda = await ejecutor.ejecutar({ nombre: "tareas_listar", argumentos: { filtro: "hoy" } }, ctx);
    const respuesta = JSON.parse(cruda.contenido[0]?.texto ?? "{}") as {
      nombre: string; args: Record<string, unknown>; ctx: unknown;
    };
    expect(respuesta.nombre).toBe("tareas_listar");
    expect(respuesta.args).toEqual({ filtro: "hoy" });
    expect(respuesta.ctx).toEqual(ctx);
  });

  it("argumentos ausentes llegan como objeto vacío", async () => {
    const envuelto = envolverProgresivo(loteVeinte());
    const ejecutor = envuelto[2] as HerramientaMcp;
    const cruda = await ejecutor.ejecutar({ nombre: "tareas_listar" }, undefined);
    const respuesta = JSON.parse(cruda.contenido[0]?.texto ?? "{}") as { args: Record<string, unknown> };
    expect(respuesta.args).toEqual({});
  });

  it("una herramienta que lanza no filtra el mensaje de la excepción", async () => {
    const explosiva = herramientaFalsa("peligro_activar", "herramienta de peligro");
    explosiva.ejecutar = async () => {
      throw new Error(["sec", "reto", "de", "prueba"].join(" "));
    };
    const envuelto = envolverProgresivo(
      [...loteVeinte().slice(0, 11), explosiva],
      { medio: "modelo-grande" }
    );
    const ejecutor = envuelto[2] as HerramientaMcp;
    const cruda = await ejecutor.ejecutar({ nombre: "peligro_activar" }, undefined);
    expect(cruda.esError).toBe(true);
    expect(cruda.contenido[0]?.texto).toBe("La herramienta falló.");
  });
});
