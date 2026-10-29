import { describe, it, expect } from "vitest";
import {
  envolverProgresivo,
  crearIndiceBm25,
  tokenizar,
  PERFILES_MEDIO,
  METAHERRAMIENTAS,
} from "../descubrimiento-progresivo";
import type { HerramientaMcp } from "../protocolo";

type Salida = { contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean };

function herramienta(
  nombre: string,
  ejecutar?: (args: Record<string, unknown>, ctx?: unknown) => Promise<Salida>
): HerramientaMcp {
  const eco = async (_args: Record<string, unknown>): Promise<Salida> => ({
    contenido: [{ tipo: "texto", texto: `hecho ${nombre}` }],
  });
  return {
    nombre,
    descripcion: `Herramienta ${nombre}`,
    esquema: { type: "object", properties: {} },
    ejecutar: ejecutar ?? eco,
  };
}

function veinte(): HerramientaMcp[] {
  return [
    "tareas_listar", "tareas_crear", "notas_buscar", "perfiles_editar", "grupos_listar",
    "eventos_crear", "eventos_listar", "biblioteca_buscar", "agentes_listar", "agentes_crear",
    "memoria_leer", "memoria_escribir", "red_publicar", "red_leer", "ajustes_leer",
    "ajustes_guardar", "tareas_borrar", "notas_crear", "perfiles_buscar", "grupos_crear",
  ].map((n) => herramienta(n));
}

async function llamar(
  metas: HerramientaMcp[],
  meta: string,
  args: Record<string, unknown>,
  ctx?: unknown
): Promise<Salida> {
  const m = metas.find((x) => x.nombre === meta);
  if (!m) throw new Error(`Falta la metaherramienta ${meta}`);
  return m.ejecutar(args, ctx);
}

function jsonDe(s: Salida): Record<string, unknown> {
  return JSON.parse(s.contenido[0].texto) as Record<string, unknown>;
}

describe("descubrimiento progresivo MCP", () => {
  it("tokenizar: camelCase, guion bajo, tildes y palabras vacías", () => {
    expect(tokenizar("tareasListar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("tareas_listar")).toEqual(["tareas", "listar"]);
    expect(tokenizar("Camión de la Estación")).toEqual(["camion", "estacion"]);
    expect(tokenizar("de la el los las un una y en the a of to for and")).toEqual([]);
  });

  it("BM25: «listar tareas» da tareas_listar primero, consulta vacía nada y empate estable", () => {
    const indice = crearIndiceBm25(
      veinte().map((h) => ({ id: h.nombre, texto: `${h.nombre} ${h.descripcion}` }))
    );
    expect(indice.buscar("", 5)).toEqual([]);
    expect(indice.buscar("listar tareas", 5)[0]?.id).toBe("tareas_listar");
    const empate = crearIndiceBm25([
      { id: "bbb", texto: "igual" },
      { id: "aaa", texto: "igual" },
    ]);
    expect(empate.buscar("igual", 5).map((r) => r.id)).toEqual(["aaa", "bbb"]);
  });

  it("≤ umbral devuelve la misma lista y > umbral las tres metaherramientas", () => {
    const doce = Array.from({ length: 12 }, (_, i) => herramienta(`h${i}`));
    expect(envolverProgresivo(doce)).toBe(doce);
    const metas = envolverProgresivo(veinte());
    expect(metas.map((m) => m.nombre)).toEqual([...METAHERRAMIENTAS]);
  });

  it("sin coincidencias devuelve la sugerencia", async () => {
    const metas = envolverProgresivo(veinte());
    const res = jsonDe(await llamar(metas, "descubrir_herramientas", { consulta: "zzqq zzqq" }));
    expect(res.resultados).toEqual([]);
    expect(res.sugerencia).toBe("prueba con otras palabras");
  });

  it("perfil pequeño: ≤ 3, descripciones ≤ 80 y sin esquema; grande da esquema y respeta el tope", async () => {
    const pequeno = envolverProgresivo(veinte(), { medio: "modelo-pequeno" });
    const res = jsonDe(await llamar(pequeno, "descubrir_herramientas", { consulta: "tareas" }));
    const lista = res.resultados as Array<{ nombre: string; descripcion: string; esquema?: unknown }>;
    expect(lista.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-pequeno"].maxResultados);
    for (const item of lista) {
      expect(item.descripcion.length).toBeLessThanOrEqual(80);
      expect("esquema" in item).toBe(false);
    }
    const grande = envolverProgresivo(veinte(), { medio: "modelo-grande" });
    const resG = jsonDe(
      await llamar(grande, "descubrir_herramientas", { consulta: "tareas", limite: 999 })
    );
    const listaG = resG.resultados as Array<{ esquema?: unknown }>;
    expect(listaG.length).toBeLessThanOrEqual(PERFILES_MEDIO["modelo-grande"].maxResultados);
    expect(listaG.every((item) => item.esquema !== undefined)).toBe(true);
  });

  it("detalle devuelve la ficha completa de una visible", async () => {
    const metas = envolverProgresivo(veinte());
    const res = await llamar(metas, "detalle_herramienta", { nombre: "tareas_listar" });
    const ficha = jsonDe(res);
    expect(ficha.nombre).toBe("tareas_listar");
    expect(ficha.esquema).toBeDefined();
    expect(res.esError).toBeUndefined();
  });

  it("permitida oculta del descubrimiento, del detalle y de la ejecución", async () => {
    const metas = envolverProgresivo(veinte(), { permitida: (h) => h.nombre !== "tareas_borrar" });
    const res = jsonDe(await llamar(metas, "descubrir_herramientas", { consulta: "tareas borrar" }));
    const nombres = (res.resultados as Array<{ nombre: string }>).map((r) => r.nombre);
    expect(nombres).not.toContain("tareas_borrar");
    const det = await llamar(metas, "detalle_herramienta", { nombre: "tareas_borrar" });
    expect(det.esError).toBe(true);
    expect(det.contenido[0].texto).toBe("Herramienta desconocida o no permitida: tareas_borrar");
    const eje = await llamar(metas, "ejecutar_herramienta", { nombre: "tareas_borrar" });
    expect(eje.esError).toBe(true);
  });

  it("ejecutar rechaza metaherramientas y desconocidas", async () => {
    const metas = envolverProgresivo(veinte());
    for (const nombre of [...METAHERRAMIENTAS, "no_existe"]) {
      const res = await llamar(metas, "ejecutar_herramienta", { nombre });
      expect(res.esError).toBe(true);
    }
  });

  it("el ctx y los argumentos llegan a la herramienta", async () => {
    const eco = herramienta("eco", async (args, ctx) => ({
      contenido: [{ tipo: "texto", texto: `${JSON.stringify(args)}·${JSON.stringify(ctx ?? null)}` }],
    }));
    const metas = envolverProgresivo([eco, ...veinte()]);
    const res = await llamar(
      metas,
      "ejecutar_herramienta",
      { nombre: "eco", argumentos: { saludo: "hola" } },
      { usuario: "alex" }
    );
    expect(res.esError).toBeUndefined();
    expect(res.contenido[0].texto).toContain('"saludo":"hola"');
    expect(res.contenido[0].texto).toContain('"usuario":"alex"');
  });

  it("una herramienta que lanza no filtra el mensaje de la excepción", async () => {
    const rota = herramienta("rota", async () => {
      throw new Error("detalle interno");
    });
    const metas = envolverProgresivo([rota, ...veinte()]);
    const res = await llamar(metas, "ejecutar_herramienta", { nombre: "rota" });
    expect(res.esError).toBe(true);
    expect(res.contenido[0].texto).toBe("La herramienta falló.");
    expect(res.contenido[0].texto).not.toContain("detalle interno");
  });
});
