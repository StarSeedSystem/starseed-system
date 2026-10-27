import { describe, it, expect } from "vitest";
import {
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  METAHERRAMIENTAS,
  tokenizar,
  crearIndiceBm25,
  envolverProgresivo,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

interface Resultado {
  contenido: Array<{ tipo: "texto"; texto: string }>;
  esError?: boolean;
}

function crear(
  nombre: string,
  descripcion = `Acción ${nombre}`,
  ejecutar?: HerramientaMcp["ejecutar"],
): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema: { type: "object", properties: { [nombre]: { type: "string" } } },
    ejecutar:
      ejecutar ??
      (async () => ({ contenido: [{ tipo: "texto" as const, texto: `ok:${nombre}` }] })),
  };
}

function texto(resultado: Resultado): string {
  return resultado.contenido[0].texto;
}

function meta(lista: HerramientaMcp[], nombre: string): HerramientaMcp {
  const encontrada = lista.find((h) => h.nombre === nombre);
  if (!encontrada) throw new Error(`Falta la metaherramienta ${nombre}`);
  return encontrada;
}

function json<T>(cadena: string): T {
  return JSON.parse(cadena) as T;
}

function veinte(): HerramientaMcp[] {
  return [
    crear("tareas_listar", "Lista las tareas pendientes del sistema"),
    ...Array.from({ length: 19 }, (_, i) => crear(`accion_${i}`, `Acción número ${i}`)),
  ];
}

describe("tokenizar", () => {
  it("separa camelCase y guion bajo y quita tildes", () => {
    expect(tokenizar("TareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("canción de la mañana")).toEqual(["cancion", "manana"]);
  });

  it("descarta palabras vacías y tokens de un carácter", () => {
    expect(tokenizar("the a of to for and de la el los las un una y en")).toEqual([]);
    expect(tokenizar("a b c acción")).toEqual(["accion"]);
  });
});

describe("índice BM25", () => {
  it("pone primero la herramienta que casa con la consulta", () => {
    const indice = crearIndiceBm25(
      veinte().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` })),
    );
    expect(indice.buscar("listar tareas", 5)[0]?.id).toBe("tareas_listar");
  });

  it("devuelve vacío con consulta vacía", () => {
    const indice = crearIndiceBm25([{ id: "uno", texto: "listar tareas" }]);
    expect(indice.buscar("", 5)).toEqual([]);
  });

  it("rompe empates por id ascendente", () => {
    const indice = crearIndiceBm25([
      { id: "b", texto: "comun" },
      { id: "a", texto: "comun" },
      { id: "c", texto: "comun" },
    ]);
    expect(indice.buscar("comun", 5).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("envolverProgresivo", () => {
  it("no toca la lista si no pasa del umbral", () => {
    const pocas = veinte().slice(0, UMBRAL_PROGRESIVO);
    const salida = envolverProgresivo(pocas);
    expect(salida).toHaveLength(UMBRAL_PROGRESIVO);
    expect(salida[0]).toBe(pocas[0]);
  });

  it("sustituye muchas herramientas por las tres metaherramientas", () => {
    const salida = envolverProgresivo(veinte());
    expect(salida.map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("ajusta resultados y esquema al presupuesto de cada medio", async () => {
    const largo = "descripción muy larga ".repeat(20);
    const herramientas = Array.from({ length: 20 }, (_, i) => crear(`accion_${i}`, largo));

    const pequeno = meta(
      envolverProgresivo(herramientas, { medio: "modelo-pequeno" }),
      "descubrir_herramientas",
    );
    const datosPequeno = json<{
      resultados: Array<{ descripcion: string; esquema?: unknown }>;
    }>(texto(await pequeno.ejecutar({ consulta: "accion", limite: 99 })));
    expect(datosPequeno.resultados.length).toBeLessThanOrEqual(
      PERFILES_MEDIO["modelo-pequeno"].maxResultados,
    );
    for (const ficha of datosPequeno.resultados) {
      expect(ficha.descripcion.length).toBeLessThanOrEqual(80);
      expect(ficha.esquema).toBeUndefined();
    }

    const grande = meta(
      envolverProgresivo(herramientas, { medio: "modelo-grande" }),
      "descubrir_herramientas",
    );
    const datosGrande = json<{ resultados: Array<{ esquema?: unknown }> }>(
      texto(await grande.ejecutar({ consulta: "accion" })),
    );
    expect(datosGrande.resultados[0]?.esquema).toBeDefined();
  });
});

describe("permisos y ejecución", () => {
  it("oculta lo no permitido al descubrir, detallar y ejecutar", async () => {
    let ejecutada = false;
    const secreta = crear("secreto", "Acción reservada", async () => {
      ejecutada = true;
      return { contenido: [{ tipo: "texto" as const, texto: "no debería" }] };
    });
    const herramientas = [
      secreta,
      ...Array.from({ length: 19 }, (_, i) => crear(`accion_${i}`, `Acción ${i}`)),
    ];
    const salida = envolverProgresivo(herramientas, {
      permitida: (h) => h.nombre !== "secreto",
    });

    const descubrir = meta(salida, "descubrir_herramientas");
    const datos = json<{ resultados: unknown[]; sugerencia?: string }>(
      texto(await descubrir.ejecutar({ consulta: "secreto" })),
    );
    expect(datos.resultados).toEqual([]);
    expect(datos.sugerencia).toBe("prueba con otras palabras");

    const detallar = meta(salida, "detalle_herramienta");
    expect((await detallar.ejecutar({ nombre: "secreto" })).esError).toBe(true);

    const ejecutar = meta(salida, "ejecutar_herramienta");
    expect((await ejecutar.ejecutar({ nombre: "secreto" })).esError).toBe(true);
    expect(ejecutada).toBe(false);
  });

  it("no deja ejecutar metaherramientas ni nombres desconocidos", async () => {
    const ejecutar = meta(envolverProgresivo(veinte()), "ejecutar_herramienta");
    for (const nombre of ["descubrir_herramientas", "no_existe"]) {
      const resultado = await ejecutar.ejecutar({ nombre });
      expect(resultado.esError).toBe(true);
      expect(texto(resultado)).toBe(`Herramienta desconocida o no permitida: ${nombre}`);
    }
  });

  it("pasa el contexto y no filtra el mensaje de la excepción", async () => {
    const conCtx = crear("con_ctx", "Acción con contexto", async (_args, ctx) => ({
      contenido: [{ tipo: "texto" as const, texto: JSON.stringify(ctx) }],
    }));
    const salida = envolverProgresivo([
      ...Array.from({ length: 19 }, (_, i) => crear(`relleno_${i}`, `Relleno ${i}`)),
      conCtx,
    ]);
    const ctx = { usuario: "alex" };
    const resultado = await meta(salida, "ejecutar_herramienta").ejecutar(
      { nombre: "con_ctx", argumentos: { x: 1 } },
      ctx,
    );
    expect(json<{ usuario: string }>(texto(resultado))).toEqual(ctx);

    const clave = ["sk", "-", "a".repeat(24)].join("");
    const falla = crear("falla", "Acción que falla", async () => {
      throw new Error(`secreto interno ${clave}`);
    });
    const salidaFalla = envolverProgresivo([
      ...Array.from({ length: 19 }, (_, i) => crear(`t_${i}`, `T ${i}`)),
      falla,
    ]);
    const roto = await meta(salidaFalla, "ejecutar_herramienta").ejecutar({ nombre: "falla" });
    expect(roto.esError).toBe(true);
    expect(texto(roto)).toBe("La herramienta falló.");
    expect(texto(roto)).not.toContain(clave);
  });
});
