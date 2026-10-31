/**
 * Pruebas de `accion-agente.ts` (contrato: `architecture/artcraft-y-rare.md` §4.1).
 * Solo funciones puras: la pasarela se inyecta y no hay red, disco ni procesos.
 */
import { describe, expect, it } from "vitest";
import {
  ejecutarAccionArtcraft,
  OCUPADA,
  PENDIENTE,
  TOPE_MENSAJE,
  type ContextoAccionArtcraft,
  type RespuestaPasarela,
} from "../accion-agente";

/** Una llamada que el `ctx` falso registra (el `r` guardado es el que respondió, si llegó). */
export interface Paso { p?: { app: string; herramienta: string; parametros: Record<string, unknown>; contexto: string }; r?: RespuestaPasarela }

/** Un `ctx` con la respuesta por orden y `estado` por app; guarda cada llamada en `pasos`. */
function contexto(x: { r: RespuestaPasarela }[] = [], estados: Record<string, { instalado: boolean; version: string | null }> = {}): ContextoAccionArtcraft & { pasos: Paso[] } {
  const pasos: Paso[] = [];
  return {
    pasos,
    contexto: "agente",
    estado: async (app) => estados[app] ?? { instalado: false, version: null },
    llamar: async (p) => {
      const r = x[0]?.r ?? { ok: true };
      pasos.push({ p: { ...p }, r });
      return r;
    },
  };
}

describe("estado", () => {
  it("instalada: dice que sí, con su versión", async () => {
    const r = await ejecutarAccionArtcraft({ app: "figcraft", accion: "estado" },
      contexto([], { figcraft: { instalado: true, version: "0.10.0" } }));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("FigCraft");
    expect(r.message).toContain("0.10.0");
  });

  it("no instalada: lo dice en claro, sin apuntar a una ruta del disco", async () => {
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "estado" }, contexto());
    expect(r.ok).toBe(true);
    expect(r.message).toContain("NO está instalada");
  });
});

describe("entrada mal formada", () => {
  it.each([["un texto"], [null], [[]], [{ app: "figcraft", accion: "leonora" }], [{ app: "gimp", accion: "estado" }]])(
    "%# …→ ok false con motivo legible",
    async (bruto) => {
      const c = contexto();
      const r = await ejecutarAccionArtcraft(bruto, c);
      expect(r.ok).toBe(false);
      expect(r.message).not.toBe("");
      expect(c.pasos).toEqual([]);
    },
  );

  it("«parametros» que no es objeto → rechaza sin llamar", async () => {
    const c = contexto();
    const r = await ejecutarAccionArtcraft({ app: "deckcraft", accion: "ejecutar", herramienta: "set_text", parametros: "holanda" }, c);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("parametros");
    expect(c.pasos).toEqual([]);
  });
});

describe("inspeccionar", () => {
  it("permite una herramienta de lectura y llega a la pasarela con su contexto", async () => {
    const c = contexto([{ r: { ok: true, resultado: { comando: 12 } } }]);
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "inspeccionar", herramienta: "list_commands" }, c);
    expect(r.ok).toBe(true);
    expect(c.pasos[0]?.p).toEqual({ app: "gridcraft", herramienta: "list_commands", parametros: {}, contexto: "agente" });
  });

  it("rechaza una herramienta de escritura sin tocar la pasarela", async () => {
    const c = contexto();
    const r = await ejecutarAccionArtcraft({ app: "figcraft", accion: "inspeccionar", herramienta: "set_properties" }, c);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("ejecutar");
    expect(c.pasos).toEqual([]);
  });
});

describe("ejecutar y exportar", () => {
  it("pasan herramienta y parámetros por la pasarela", async () => {
    const c = contexto([{ r: { ok: true, resultado: "hecha" } }]);
    const r = await ejecutarAccionArtcraft(
      { app: "deckcraft", accion: "ejecutar", herramienta: "add_text_box", parametros: { texto: "hola" } }, c,
    );
    expect(r.ok).toBe(true);
    expect(c.pasos[0]?.p?.herramienta).toBe("add_text_box");
    expect(c.pasos[0]?.p?.parametros).toEqual({ texto: "hola" });
  });

  it("«exportar» apunta sola a la herramienta «export»", async () => {
    const c = contexto([{ r: { ok: true, resultado: { ruta: "salida/obr.pptx", que: "hilan" } } }]);
    const r = await ejecutarAccionArtcraft({ app: "deckcraft", accion: "exportar" }, c);
    expect(r.ok).toBe(true);
    expect(c.pasos[0]?.p?.herramienta).toBe("export");
  });

  it("una herramienta de ventana (o vetada) se rechaza antes de la pasarela", async () => {
    const c = contexto();
    const r = await ejecutarAccionArtcraft({ app: "figcraft", accion: "ejecutar", herramienta: "pointer" }, c);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("vetada");
    expect(c.pasos).toEqual([]);
  });

  it("la pasarela pide CONFIRMACIÓN: el mensaje es el del contrato", async () => {
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "ejecutar", herramienta: "write_range" },
      contexto([{ r: { ok: false, confirmar: true, status: 409 } }]));
    expect(r.message).toContain(PENDIENTE);
  });
});

describe("respuestas de la pasarela", () => {
  it("403: el motivo de la política sale tal cual", async () => {
    const motivo = "Una ruta de los parámetros está fuera del directorio de trabajo de la neurona.";
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "ejecutar", herramienta: "read_range" },
      contexto([{ r: { ok: false, status: 403, motivo } }]));
    expect(r.ok).toBe(false);
    expect(r.message).toBe(motivo);
  });

  it("429: la neurona está ocupada, no detalles del proceso", async () => {
    const r = await ejecutarAccionArtcraft({ app: "deckcraft", accion: "ejecutar", herramienta: "render_slide" },
      contexto([{ r: { ok: false, status: 429, motivo: "MAX_EN_CURSO" } }]));
    expect(r.ok).toBe(false);
    expect(r.message).toBe(OCUPADA);
  });

  it("un resultado largo se recorta con «…» y no pasa de 4 KB", async () => {
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "inspeccionar", herramienta: "inspect_workbook" },
      contexto([{ r: { ok: true, resultado: "a".repeat(20000) } }]));
    expect(r.ok).toBe(true);
    expect(r.message.endsWith("…")).toBe(true);
    expect(new TextEncoder().encode(r.message).length).toBeLessThanOrEqual(TOPE_MENSAJE);
  });

  it("una ruta absoluta del resultado no sale: solo el nombre del archivo", async () => {
    const r = await ejecutarAccionArtcraft({ app: "deckcraft", accion: "exportar" },
      contexto([{ r: { ok: true, resultado: { ruta: "/Users/quiensea/trabajo/deckcraft/agente/salida/diorama.pptx" } } }]));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("diorama.pptx");
    expect(r.message).not.toContain("/Users");
  });

  it("los bytes de un archivo no salen en el mensaje", async () => {
    const r = await ejecutarAccionArtcraft({ app: "gridcraft", accion: "inspeccionar", herramienta: "read_range" },
      contexto([{ r: { ok: true, resultado: { datos: "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVoxMjM0NTY3ODk=".repeat(24) } } }]));
    expect(r.ok).toBe(true);
    expect(r.message).toContain("(bytes del archivo omitidos)");
    expect(r.message).not.toMatch(/QUJDREVG/);
  });
});

