import { describe, it, expect } from "vitest";
import {
  METAHERRAMIENTAS,
  PERFILES_MEDIO,
  UMBRAL_PROGRESIVO,
  crearIndiceBm25,
  envolverProgresivo,
  tokenizar,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

interface CuerpoDescubrir {
  resultados: Array<{ nombre: string; descripcion: string; esquema?: Record<string, unknown> }>;
  total: number;
  sugerencia?: string;
}

interface CuerpoDetalle {
  nombre: string;
  descripcion: string;
  esquema: Record<string, unknown>;
}

function herramienta(nombre: string, descripcion: string, esquema: Record<string, unknown> = {}): HerramientaMcp {
  return {
    nombre,
    descripcion,
    esquema,
    ejecutar: async () => ({ contenido: [{ tipo: "texto", texto: `${nombre} hecha` }] }),
  };
}

function loteLleno(cantidad: number): HerramientaMcp[] {
  return Array.from({ length: cantidad }, (_, i) => herramienta(`lleno_${i}`, `Llenador numero ${i}`));
}

function buscarMeta(envueltas: HerramientaMcp[], nombre: string): HerramientaMcp {
  const h = envueltas.find((x) => x.nombre === nombre);
  if (!h) throw new Error(`falta la metaherramienta ${nombre}`);
  return h;
}

function textoDe(res: { contenido: Array<{ tipo: string; texto: string }> }): string {
  return res.contenido[0].texto;
}

const ESC_TAREAS: Record<string, unknown> = {
  type: "object",
  properties: { limite: { type: "number", paginado: false, maximo: 100 } },
};

const TEMAS: Array<[string, string, Record<string, unknown>?]> = [
  ["tareas_listar", "Listar las tareas abiertas de un proyecto con fechas límite, responsables y estados", ESC_TAREAS],
  ["tareas_crear", "Crear tareas nuevas"],
  ["notas_leer", "Leer notas guardadas"],
  ["notas_escribir", "Escribir notas nuevas"],
  ["calendario_eventos", "Eventos del calendario"],
  ["correo_enviar", "Enviar correos salientes"],
  ["chat_mensajes", "Mensajes de conversación"],
  ["archivos_subir", "Subir archivos compartidos"],
  ["imagenes_convertir", "Convertir imágenes"],
  ["audio_transcribir", "Transcribir audio grabado"],
  ["web_buscar", "Buscar en la web"],
  ["codigo_formatear", "Formatear código fuente"],
  ["tablas_exportar", "Exportar tablas de datos"],
  ["estado_mostrar", "Mostrar el estado del sistema"],
  ["perfil_actualizar", "Actualizar el perfil"],
  ["creditos_consultar", "Consultar créditos"],
  ["salas_reservar", "Reservar salas"],
  ["informes_generar", "Generar informes"],
  ["ajustes_guardar", "Guardar ajustes"],
  ["db_consultar", "Consultar la base de datos"],
];

const FALSAS: HerramientaMcp[] = TEMAS.map(([nombre, descripcion, esquema]) => herramienta(nombre, descripcion, esquema));

describe("tokenizar", () => {
  it("separa camelCase y guion bajo igual", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
  });

  it("quita tildes antes de partir", () => {
    expect(tokenizar("Calibración de Éticos")).toEqual(["calibracion", "eticos"]);
  });

  it("descarta palabras vacías y tokens de un solo carácter", () => {
    expect(tokenizar("De la el los las un una y en")).toEqual([]);
    expect(tokenizar("a 9 b casa")).toEqual(["casa"]);
  });
});

describe("crearIndiceBm25", () => {
  const indice = crearIndiceBm25(FALSAS.map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` })));

  it("«listar tareas» devuelve tareas_listar primero", () => {
    expect(indice.buscar("listar tareas", 5)[0]?.id).toBe("tareas_listar");
  });

  it("consulta vacía no devuelve nada", () => {
    expect(indice.buscar("", 5)).toEqual([]);
  });

  it("términos de la consulta sin repetir", () => {
    expect(indice.buscar("tareas tareas tareas", 20)).toEqual(indice.buscar("tareas", 20));
  });

  it("empate estable por id ascendente", () => {
    const ocupa = crearIndiceBm25([
      { id: "zeta_tema", texto: "texto asignado" },
      { id: "alfa_tema", texto: "texto asignado" },
      { id: "miga_tema", texto: "texto asignado" },
    ]);
    expect(ocupa.buscar("asignado", 3).map((r) => r.id)).toEqual(["alfa_tema", "miga_tema", "zeta_tema"]);
  });

  it("índice vacío devuelve nada", () => {
    expect(crearIndiceBm25([]).buscar("algo", 5)).toEqual([]);
  });
});

describe("envolverProgresivo", () => {
  it("pocas herramientas pasan sin cambios", () => {
    const pocas = FALSAS.slice(0, UMBRAL_PROGRESIVO);
    expect(envolverProgresivo(pocas)).toBe(pocas);
  });

  it("un umbral mayor también pasa sin cambios", () => {
    expect(envolverProgresivo(FALSAS, { umbral: FALSAS.length })).toBe(FALSAS);
  });

  it("muchas herramientas dejan exactamente las tres metaherramientas", () => {
    expect(envolverProgresivo(FALSAS).map((h) => h.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("descubrir devuelve resultados en orden y con el total", async () => {
    const descubrir = buscarMeta(envolverProgresivo(FALSAS), "descubrir_herramientas");
    const cuerpo = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "listar tareas" }))) as CuerpoDescubrir;
    expect(cuerpo.resultados[0].nombre).toBe("tareas_listar");
    expect(cuerpo.resultados.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-mediano"].maxResultados);
    expect(cuerpo.total).toBeGreaterThanOrEqual(cuerpo.resultados.length);
  });

  it("consulta vacía o sin coincidencias pide probar otras palabras", async () => {
    const descubrir = buscarMeta(envolverProgresivo(FALSAS), "descubrir_herramientas");
    const vacia = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "" }))) as CuerpoDescubrir;
    expect(vacia.resultados).toEqual([]);
    expect(vacia.sugerencia).toBe("prueba con otras palabras");
    const rara = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "triciclo inexistente" }))) as CuerpoDescubrir;
    expect(rara.resultados).toEqual([]);
    expect(rara.sugerencia).toBe("prueba con otras palabras");
  });

  it("detalle da descripción y esquema completos", async () => {
    const detalle = buscarMeta(envolverProgresivo(FALSAS), "detalle_herramienta");
    const cuerpo = JSON.parse(textoDe(await detalle.ejecutar({ nombre: "tareas_listar" }))) as CuerpoDetalle;
    expect(cuerpo.nombre).toBe("tareas_listar");
    expect(cuerpo.descripcion).toBe(FALSAS[0].descripcion);
    expect(cuerpo.esquema).toEqual(ESC_TAREAS);
  });

  it("detalle de una desconocida da error", async () => {
    const detalle = buscarMeta(envolverProgresivo(FALSAS), "detalle_herramienta");
    const res = await detalle.ejecutar({ nombre: "canicas_herra" });
    expect(res.esError).toBe(true);
    expect(textoDe(res)).toBe("Herramienta desconocida o no permitida: canicas_herra");
  });

  it("el perfil pequeño limita a 3 resultados, recorta a 80 y no da esquema", async () => {
    const descripcionCompleta = FALSAS[0].descripcion.length;
    const descubrir = buscarMeta(envolverProgresivo(FALSAS, { medio: "modelo-pequeno" }), "descubrir_herramientas");
    const cuerpo = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "listar tareas crear notas", limite: 99 }))) as CuerpoDescubrir;
    expect(cuerpo.resultados.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
    expect(cuerpo.resultados.length).toBeLessThan(cuerpo.total);
    for (const r of cuerpo.resultados) {
      expect(r.descripcion.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxDescripcion);
      expect("esquema" in r).toBe(false);
    }
    expect(cuerpo.resultados[0].descripcion.length).toBeLessThan(descripcionCompleta);
  });

  it("el perfil grande adjunta el esquema de cada resultado", async () => {
    const descubrir = buscarMeta(envolverProgresivo(FALSAS, { medio: "modelo-grande" }), "descubrir_herramientas");
    const cuerpo = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "notas" }))) as CuerpoDescubrir;
    expect(cuerpo.resultados.length).toBeGreaterThan(0);
    expect("esquema" in cuerpo.resultados[0]).toBe(true);
  });

  it("permitida oculta del descubrimiento, del detalle y de la ejecución", async () => {
    const envueltas = envolverProgresivo(FALSAS, { permitida: (h) => h.nombre !== "tareas_listar" });
    const descubrir = buscarMeta(envueltas, "descubrir_herramientas");
    const cuerpo = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "listar tareas" }))) as CuerpoDescubrir;
    expect(cuerpo.resultados.some((r) => r.nombre === "tareas_listar")).toBe(false);
    const detalle = buscarMeta(envueltas, "detalle_herramienta");
    const oculta = await detalle.ejecutar({ nombre: "tareas_listar" });
    expect(oculta.esError).toBe(true);
    expect(textoDe(oculta)).toBe("Herramienta desconocida o no permitida: tareas_listar");
    const ejecutar = buscarMeta(envueltas, "ejecutar_herramienta");
    expect((await ejecutar.ejecutar({ nombre: "tareas_listar" })).esError).toBe(true);
  });

  it("ejecutar no puede llamar a una metaherramienta ni a una desconocida", async () => {
    const ejecutar = buscarMeta(envolverProgresivo(FALSAS), "ejecutar_herramienta");
    const meta = await ejecutar.ejecutar({ nombre: "descubrir_herramientas" });
    expect(meta.esError).toBe(true);
    expect(textoDe(meta)).toBe("Herramienta desconocida o no permitida: descubrir_herramientas");
    const nada = await ejecutar.ejecutar({ nombre: "canicas_herra" });
    expect(nada.esError).toBe(true);
  });

  it("el ctx y los argumentos llegan a la herramienta", async () => {
    const visto: { args: Record<string, unknown>; ctx: unknown } = { args: {}, ctx: null };
    const capturadora: HerramientaMcp = {
      nombre: "ctx_probar",
      descripcion: "Prueba de que el ctx llega",
      esquema: {},
      ejecutar: async (args, ctx) => {
        visto.args = args;
        visto.ctx = ctx;
        return { contenido: [{ tipo: "texto", texto: "recibido" }] };
      },
    };
    const envueltas = envolverProgresivo([capturadora, ...loteLleno(14)]);
    const elCtx = { trabajador: "prueba-ctx" };
    const res = await buscarMeta(envueltas, "ejecutar_herramienta").ejecutar(
      { nombre: "ctx_probar", argumentos: { marca: 7 } },
      elCtx
    );
    expect(res.esError).toBeUndefined();
    expect(visto.args).toEqual({ marca: 7 });
    expect(visto.ctx).toBe(elCtx);
  });

  it("una herramienta que lanza solo dice «La herramienta falló.»", async () => {
    const queLanza: HerramientaMcp = {
      nombre: "fallar_probar",
      descripcion: "Herramienta que lanza una excepción",
      esquema: {},
      ejecutar: async () => {
        throw new Error("fallo interno de depuración que nadie debe leer");
      },
    };
    const envueltas = envolverProgresivo([queLanza, ...loteLleno(14)]);
    const ejecutar = buscarMeta(envueltas, "ejecutar_herramienta");
    const res = await ejecutar.ejecutar({ nombre: "fallar_probar" });
    expect(res.esError).toBe(true);
    expect(textoDe(res)).toBe("La herramienta falló.");
    expect(textoDe(res)).not.toContain("fallo interno");
  });

  it("el índice descubre también por las claves de esquema.properties", async () => {
    const conClave = herramienta("filtro_pasos", "Recorta el trabajo por partes", {
      type: "object",
      properties: { filtro: { type: "string" } },
    });
    const envueltas = envolverProgresivo([conClave, ...loteLleno(14)]);
    const descubrir = buscarMeta(envueltas, "descubrir_herramientas");
    const cuerpo = JSON.parse(textoDe(await descubrir.ejecutar({ consulta: "filtro" }))) as CuerpoDescubrir;
    expect(cuerpo.resultados[0].nombre).toBe("filtro_pasos");
  });
});
