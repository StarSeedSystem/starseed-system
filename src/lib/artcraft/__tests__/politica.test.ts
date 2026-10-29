/** Pruebas de la política ArtCraft (`politica.ts`), contrato §3.2/§3.3. Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { evaluarLlamada, hayTrusted, rutasEnParametros, rutaDentro, HERRAMIENTAS, PREFIJOS_VETADOS } from "../politica";
import type { LlamadaArtcraft } from "../politica";
import { APPS_ARTCRAFT, HERRAMIENTAS as TABLAS, PREFIJOS_VETADOS as PREFIJOS_TABLAS } from "../politica-tablas";

const RAICES = { lectura: ["/datos/neurona/entrada"], escritura: ["/datos/neurona/salida"] };
const BASE: LlamadaArtcraft = {
  app: "figcraft", herramienta: "inspect_document", parametros: {},
  origen: "agente", ambito: "personal", rol: "dueno", raices: RAICES,
};
const llamada = (mas: Partial<LlamadaArtcraft>): LlamadaArtcraft => ({ ...BASE, ...mas });

describe("rutaDentro", () => {
  const casos: [string, boolean][] = [
    ["/datos/neurona/salida/a.png", true],
    ["/datos/neurona/entrada", true],
    ["/datos/neurona/salida//b.png", true], // colapsa «//»
    ["/datos\\neurona\\salida/c.png", true], // unifica separadores
    ["/etc/passwd", false],
    ["/datos/neurona/salida/../entrada/x", false],
    ["~/salida/x", false],
    ["file:///datos/neurona/salida/x", false],
    ["\\\\servidor\\datos\\x", false], // UNC
    ["/datos/neurona/salida/x\u0000", false],
    ["datos/neurona/salida/x", false], // relativa
    ["C:/datos/x", false],
    ["", false],
  ];
  it.each(casos)("%s", (ruta, esperado) => expect(rutaDentro(ruta, RAICES)).toBe(esperado));
});

describe("rutasEnParametros y trusted", () => {
  it("recolecta por clave y por forma, en objetos anidados", () => {
    const rutas = rutasEnParametros({ export: { path: "/datos/neurona/salida/a.png" }, other: "texto" });
    expect(rutas).toEqual(["/datos/neurona/salida/a.png"]);
    expect(rutasEnParametros({ destino: "/datos/neurona/salida/b.pdf" })).toEqual(["/datos/neurona/salida/b.pdf"]);
  });
  it("ve `trusted: true` en cualquier profundidad y no se deja con false", () => {
    expect(hayTrusted({ automate: { trusted: true } })).toBe(true);
    expect(hayTrusted([{ trusted: false }])).toBe(false);
    expect(hayTrusted({})).toBe(false);
  });
});

describe("evaluarLlamada · vetados", () => {
  it("niega run_command con collab.share y collab.publish", () => {
    for (const c of ["collab.share", "collab.publish"])
      expect(evaluarLlamada(llamada({ herramienta: "run_command", parametros: { command: c } })).decision).toBe("denegar");
  });
  it("niega batch con plugin.import", () => {
    expect(evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: ["inspect_document", { command: "plugin.import" }] } })).decision).toBe("denegar");
  });
  it("niega call_app y las herramientas de ventana para un origen automático", () => {
    expect(evaluarLlamada(llamada({ app: "deckcraft", herramienta: "call_app" })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ herramienta: "pointer" })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "select", origen: "ia" })).decision).toBe("denegar");
  });
  it("niega automate.trustScripts y `trusted: true` de GridCraft", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "automate.trustScripts" })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "execute_command", parametros: { command: "automate.runScript", trusted: true } })).decision).toBe("denegar");
  });
  it("niega la herramienta desconocida y la que no está en la lista", () => {
    expect(evaluarLlamada(llamada({ herramienta: "grabar_video" })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ app: "figcraft", herramienta: "inspect_slide" })).decision).toBe("denegar");
  });
});

describe("evaluarLlamada · rutas", () => {
  it("niega rutas hostiles y admite las de salida/", () => {
    for (const fuera of ["/etc/passwd", "../x.xml", "~/x", "file:///datos/x", "\\\\servidor\\datos\\x"])
      expect(evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: fuera } })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: "/datos/neurona/salida/x.figcraft" } })).decision).toBe("permitir");
  });
  it("negar open_workbook con ruta fuera del directorio de trabajo", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/datos/externo/a.xlsx" } })).decision).toBe("denegar");
  });
  it("open_workbook y save_file dentro de entrada/ salida/ pasan", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/datos/neurona/entrada/a.xlsx" } })).decision).toBe("permitir");
    expect(evaluarLlamada(llamada({ herramienta: "export", parametros: { out: "/datos/neurona/salida/d.svg", format: "svg" } })).decision).toBe("permitir");
  });
  it("export a la raíz de LECTURA, fuera de la de escritura: denegado", () => {
    expect(evaluarLlamada(llamada({ herramienta: "export", parametros: { out: "/datos/neurona/entrada/c.png" } })).decision).toBe("denegar");
  });
  it("ámbito grupo pide confirmación para escribir y lectura siempre pasa", () => {
    const grupo = evaluarLlamada(llamada({ herramienta: "export", parametros: { out: "/datos/neurona/salida/d.svg" }, ambito: "grupo", rol: "editor" }));
    expect(grupo.decision).toBe("confirmar");
    expect(evaluarLlamada(llamada({ herramienta: "get_node", parametros: { id: "rm" } })).decision).toBe("permitir");
  });
});

describe("politica-tablas · lista permitida exacta de §3.2", () => {
  it("deja las tres apps en el orden del contrato", () =>
    expect(APPS_ARTCRAFT).toEqual(["figcraft", "gridcraft", "deckcraft"]));
  it("copia la tabla de §3.2 herramienta a herramienta", () => {
    expect(TABLAS.figcraft).toEqual({ libre: ["list_commands", "inspect_document", "get_node", "screenshot", "inspect_ui", "undo", "redo"], trabajo: ["create_node", "set_properties", "batch", "run_command", "export", "open_file", "save_file"], vetadas: ["pointer", "key", "type_text", "select"] });
    expect(TABLAS.gridcraft).toEqual({ libre: ["list_commands", "list_functions", "inspect_workbook", "read_range", "get_cell", "evaluate_formula", "screenshot"], trabajo: ["write_range", "set_cell", "format_range", "insert_chart", "create_table", "sort_range", "filter", "new_workbook", "open_workbook", "save_workbook", "execute_command", "undo", "redo"], vetadas: ["select"] });
    expect(TABLAS.deckcraft).toEqual({ libre: ["list_commands", "inspect_document", "inspect_slide", "render_slide", "screenshot"], trabajo: ["new_presentation", "open_presentation", "save_presentation", "export", "add_slide", "add_shape", "add_text_box", "set_text", "insert_picture", "insert_table", "insert_chart", "batch", "run_command", "go_to_slide"], vetadas: ["call_app", "pointer", "key", "type_text", "select", "select_tool"] });
  });
  it("y los prefijos de comando vetados", () =>
    expect(PREFIJOS_TABLAS).toEqual({ figcraft: ["collab.", "plugin.", "widget.insert"], gridcraft: ["automate."], deckcraft: [] }));
  it("la lógica de politica.ts no se aparta de los datos de politica-tablas.ts", () => {
    expect(HERRAMIENTAS).toEqual(TABLAS);
    expect(PREFIJOS_VETADOS).toEqual(PREFIJOS_TABLAS);
  });
});
