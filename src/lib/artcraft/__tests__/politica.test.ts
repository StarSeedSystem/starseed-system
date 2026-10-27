/* Política ArtCraft · pruebas. Solo módulos puros (sin node:*, sin route.ts). */
import { describe, expect, it } from "vitest";
import { evaluarLlamada, rutaDentro, rutasEnParametros } from "../politica";
import type { LlamadaArtcraft } from "../politica";

const raices = { lectura: ["/datos/artcraft/entrada"], escritura: ["/datos/artcraft/salida"] };
const base: Omit<LlamadaArtcraft, "herramienta" | "parametros"> = {
  app: "figcraft",
  origen: "agente",
  ambito: "personal",
  rol: "editor",
  raices,
};
const llamada = (extra: Partial<LlamadaArtcraft>): LlamadaArtcraft => ({
  ...base,
  herramienta: "inspect_document",
  parametros: {},
  ...extra,
});

describe("política ArtCraft · comandos y herramientas vetadas", () => {
  it("collab.share por run_command de FigCraft se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "run_command", parametros: { command: "collab.share" } }));
    expect(v.decision).toBe("denegar");
    expect(v.escribe).toBe(true);
  });

  it("collab.publish por batch (lista de comandos) se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: [{ command: "collab.publish doc" }] } }));
    expect(v.decision).toBe("denegar");
  });

  it("plugin.import por run_command se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "run_command", parametros: { command: "plugin.import" } }));
    expect(v.decision).toBe("denegar");
  });

  it("widget.insert por batch (cadenas sueltas) se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: ["widget.insert wid"] } }));
    expect(v.decision).toBe("denegar");
  });

  it("automate.trustScripts por execute_command de GridCraft se deniega", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "execute_command", parametros: { command: "automate.trustScripts" } }));
    expect(v.decision).toBe("denegar");
  });

  it("trusted: true en cualquier parte se deniega, aunque la herramienta sea de libre lectura", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "read_range", parametros: { opciones: { trusted: true } } }));
    expect(v.decision).toBe("denegar");
  });

  it("call_app de DeckCraft se deniega siempre, incluso con origen mano", () => {
    const v = evaluarLlamada(llamada({ app: "deckcraft", herramienta: "call_app", origen: "mano" }));
    expect(v.decision).toBe("denegar");
  });

  it("una herramienta de ventana (pointer) no se permite desde ia o agente", () => {
    const v = evaluarLlamada(llamada({ herramienta: "pointer", origen: "ia" }));
    expect(v.decision).toBe("denegar");
    expect(v.motivo).toContain("persona");
  });

  it("una herramienta vetada se deniega también con origen mano", () => {
    const v = evaluarLlamada(llamada({ herramienta: "select", origen: "mano" }));
    expect(v.decision).toBe("denegar");
  });

  it("herramienta desconocida no está en la lista permitida", () => {
    const v = evaluarLlamada(llamada({ herramienta: "magia" }));
    expect(v.decision).toBe("denegar");
    expect(v.motivo).toContain("no está en la lista permitida");
  });

  it("select_tool de DeckCraft se deniega desde agente", () => {
    const v = evaluarLlamada(llamada({ app: "deckcraft", herramienta: "select_tool" }));
    expect(v.decision).toBe("denegar");
  });
});

describe("política ArtCraft · rutas de los parámetros", () => {
  it("/etc/passwd en open_file se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "open_file", parametros: { path: "/etc/passwd" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una ruta con «..» escapando se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "open_file", parametros: { path: "/datos/artcraft/entrada/../salida/x.fig" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una ruta con ~ se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "open_file", parametros: { path: "~/x.fig" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una ruta file:// se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "file:///x.png" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una ruta UNC se deniega", () => {
    const v = evaluarLlamada(llamada({ app: "deckcraft", herramienta: "open_presentation", parametros: { path: "\\\\servidor\\datos\\f.pptx" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una ruta con byte nulo se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "/datos/artcraft/salida/\0x.png" } }));
    expect(v.decision).toBe("denegar");
  });

  it("una letra de unidad fuera de las raíces se deniega", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "C:/tmp/libro.xlsx" } }));
    expect(v.decision).toBe("denegar");
  });

  it("open_workbook de GridCraft con ruta fuera del directorio de trabajo se deniega", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/otro/lugar/libro.xlsx" } }));
    expect(v.decision).toBe("denegar");
  });

  it("open_workbook con ruta dentro de entrada/ se permite (es lectura)", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/datos/artcraft/entrada/libro.xlsx" } }));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(false);
  });

  it("escribir una ruta que solo está bajo la raíz de lectura se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: "/datos/artcraft/entrada/mas.fig" } }));
    expect(v.decision).toBe("denegar");
    expect(v.motivo).toContain("escritura");
  });
});

describe("política ArtCraft · escritura por ámbito y lectura libre", () => {
  it("export de FigCraft dentro de salida/ se permite en ámbito personal", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "/datos/artcraft/salida/x.png" } }));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(true);
  });

  it("write_range de GridCraft dentro de salida/ se permite con escribe true", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "write_range", parametros: { path: "/datos/artcraft/salida/d.xlsx", valores: [["a"]] } }));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(true);
  });

  it("export en ámbito grupo pide confirmación", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "/datos/artcraft/salida/x.png" }, ambito: "grupo" }));
    expect(v.decision).toBe("confirmar");
  });

  it("export en ámbito pública pide confirmación", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "/datos/artcraft/salida/x.png" }, ambito: "publica" }));
    expect(v.decision).toBe("confirmar");
  });

  it("una lectura libre se permite con escribe false", () => {
    const v = evaluarLlamada(llamada({ herramienta: "inspect_document" }));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(false);
  });

  it("read_range de GridCraft dentro de entrada/ se permite", () => {
    const v = evaluarLlamada(llamada({ app: "gridcraft", herramienta: "read_range", parametros: { path: "/datos/artcraft/entrada/libro.xlsx" } }));
    expect(v.decision).toBe("permitir");
  });

  it("una barra doble colapsa y la ruta sigue dentro", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: "/datos/artcraft/salida//x.png" } }));
    expect(v.decision).toBe("permitir");
  });

  it("sin rol la escritura se deniega", () => {
    const v = evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: "/datos/artcraft/salida/x.fig" }, rol: null }));
    expect(v.decision).toBe("denegar");
  });
});

describe("política ArtCraft · rutaDentro y rutasEnParametros", () => {
  it("acepta la raíz igual a sí misma y cualquier hijo suyo", () => {
    expect(rutaDentro("/datos/artcraft/salida", raices.escritura)).toBe(true);
    expect(rutaDentro("/datos/artcraft/salida/sub/x.png", raices.escritura)).toBe(true);
    expect(rutaDentro("/datos/artcraft/salidax", raices.escritura)).toBe(false);
  });

  it("rechaza rutas relativas sin barra inicial", () => {
    expect(rutaDentro("relativa/x.png", raices.escritura)).toBe(false);
    expect(rutaDentro("x.png", raices.escritura)).toBe(false);
  });

  it("rutasEnParametros recoge claves de ruta y valores con forma de ruta", () => {
    const rutas = rutasEnParametros({ dir: "/datos/artcraft/salida", nota: "sin ruta", anidado: { archivo: "prueba.fig" }, lista: [{ ruta: "/datos/artcraft/entrada/a.fig" }] });
    expect(rutas).toContain("/datos/artcraft/salida");
    expect(rutas).toContain("/datos/artcraft/entrada/a.fig");
    expect(rutas).not.toContain("sin ruta");
  });

  it("rutasEnParametros para en profundidad 6", () => {
    const profundo = { a: { a: { a: { a: { a: { a: { path: "/datos/artcraft/salida/x.png" } } } } } } };
    expect(rutasEnParametros(profundo)).toEqual([]);
    const aSeis = { a: { a: { a: { a: { a: { path: "/datos/artcraft/salida/x.png" } } } } } };
    expect(rutasEnParametros(aSeis).length).toBe(1);
  });
});
