import { describe, expect, it } from "vitest";
import { evaluarLlamada, rutaDentro, rutasEnParametros, type LlamadaArtcraft, type RaicesTrabajo } from "@/lib/artcraft/politica";

// Contrato: `architecture/artcraft-y-rare.md` §3.2 y §3.3. Raíces montadas en tiempo de
// ejecución: en el código nunca hay rutas de un disco real.

const RAICES: RaicesTrabajo = {
  lectura: ["/" + ["datos", "neurona", "artcraft", "ctx", "entrada"].join("/")],
  escritura: ["/" + ["datos", "neurona", "artcraft", "ctx", "salida"].join("/")],
};
const SALIDA = RAICES.escritura[0];

const llamada = (p: Partial<LlamadaArtcraft>): LlamadaArtcraft => ({
  app: "figcraft",
  herramienta: "inspect_document",
  parametros: {},
  origen: "agente",
  ambito: "personal",
  rol: "dueno",
  raices: RAICES,
  ...p,
});

describe("rutaDentro", () => {
  it("acepta una ruta igual a la raíz o colgando de ella", () => {
    expect(rutaDentro(`${SALIDA}/a.png`, RAICES.escritura)).toBe(true);
    expect(rutaDentro(SALIDA, RAICES.escritura)).toBe(true);
  });
  it("rechaza vacía, relativa, con .., con ~, con file:, UNC y byte nulo", () => {
    for (const mala of ["", "../x", "x/y", "~/x", "file:///x", "\\\\srv\\compartido", `${SALIDA}\0`])
      expect(rutaDentro(mala, RAICES.escritura)).toBe(false);
  });
  it("no vale un prefijo de texto que no sea de carpeta", () => {
    expect(rutaDentro(`${SALIDA}-otra/a.png`, RAICES.escritura)).toBe(false);
  });
});

describe("rutasEnParametros", () => {
  it("encuentra rutas por clave y por forma, con profundidad acotada", () => {
    expect(rutasEnParametros({ path: "a.png", nombre: "x", out: "/z" })).toEqual(["a.png", "/z"]);
    expect(rutasEnParametros({ commands: [{ command: "o", path: "/p" }] })).toEqual(["/p"]);
    const hondo = { a: { b: { c: { d: { e: { f: { g: { path: "/hondo" } } } } } } } };
    expect(rutasEnParametros(hondo)).toEqual([]);
  });
});

describe("evaluarLlamada · vetadas y órdenes", () => {
  it("deniega collab.share, collab.publish y plugin.import por run_command", () => {
    for (const cmd of ["collab.share", "collab.publish", "plugin.import"])
      expect(evaluarLlamada(llamada({ herramienta: "run_command", parametros: { command: cmd } })).decision).toBe("denegar");
  });
  it("deniega widget.insert por batch y automate.trustScripts por execute_command", () => {
    expect(evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: [{ command: "widget.insert" }] } })).decision).toBe("denegar");
    expect(
      evaluarLlamada(llamada({ app: "gridcraft", herramienta: "execute_command", parametros: { command: "automate.trustScripts" } })).decision,
    ).toBe("denegar");
  });
  it("deniega trusted: true en cualquier parte", () => {
    const v = evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: [{ command: "set_properties", trusted: true }] } }));
    expect(v.decision).toBe("denegar");
  });
  it("deniega call_app y las herramientas de ventana", () => {
    expect(evaluarLlamada(llamada({ app: "deckcraft", herramienta: "call_app" })).decision).toBe("denegar");
    for (const h of ["pointer", "key", "type_text", "select"])
      expect(evaluarLlamada(llamada({ herramienta: h })).decision).toBe("denegar");
  });
  it("deniega una herramienta desconocida", () => {
    const v = evaluarLlamada(llamada({ herramienta: "borrar_disco" }));
    expect(v.decision).toBe("denegar");
    expect(v.motivo).toContain("lista permitida");
  });
});

describe("evaluarLlamada · rutas", () => {
  it("deniega rutas /etc/passwd, ../x, ~/x, file:///x y UNC", () => {
    for (const path of ["/etc/passwd", "../x", "~/x", "file:///x", "\\\\srv\\compartido\\a.png"])
      expect(evaluarLlamada(llamada({ herramienta: "open_file", parametros: { path } })).decision).toBe("denegar");
  });
  it("permite una ruta dentro de salida/ y deniega una fuera en GridCraft open_workbook", () => {
    expect(evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: `${SALIDA}/a.figcraft` } })).decision).toBe("permitir");
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/fuera/libro.xlsx" } })).decision).toBe("denegar");
  });
  it("una ruta solo en la raíz de lectura no vale para escribir", () => {
    const v = evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: `${RAICES.lectura[0]}/a.figcraft` } }));
    expect(v.decision).toBe("denegar");
  });
  it("export de FigCraft dentro de salida/ se permite en personal", () => {
    const v = evaluarLlamada(llamada({ herramienta: "export", parametros: { path: `${SALIDA}/logo.png` } }));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(true);
  });
});

describe("evaluarLlamada · ámbitos y permisos", () => {
  it("lectura libre se permite sin importar ámbito", () => {
    expect(evaluarLlamada(llamada({})).decision).toBe("permitir");
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "read_range" })).decision).toBe("permitir");
  });
  it("escritura en personal se permite y en grupo pide confirmar", () => {
    expect(evaluarLlamada(llamada({ herramienta: "create_node" })).decision).toBe("permitir");
    const grupo = llamada({ herramienta: "save_file", parametros: { path: `${SALIDA}/a` }, ambito: "grupo", rol: "editor" });
    expect(evaluarLlamada(grupo).decision).toBe("confirmar");
    expect(evaluarLlamada(llamada({ app: "deckcraft", herramienta: "add_text_box", ambito: "grupo", rol: "editor" })).decision).toBe("confirmar");
  });
  it("sin rol o con rol de mirar, la escritura se deniega", () => {
    expect(evaluarLlamada(llamada({ herramienta: "set_properties", rol: null })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ herramienta: "set_properties", rol: "observador" })).decision).toBe("denegar");
  });
  it("run_command con un id permitido pasa en personal", () => {
    expect(evaluarLlamada(llamada({ herramienta: "run_command", parametros: { command: "create_rectangle" } })).decision).toBe("permitir");
  });
  it("batch revisa cada comando del array, no solo el primero", () => {
    const v = evaluarLlamada(llamada({ herramienta: "batch", parametros: { commands: [{ command: "set_properties" }, { command: "collab.host" }] } }));
    expect(v.decision).toBe("denegar");
  });
  it("abrir un archivo dentro de la raíz de lectura vale, y render_slide es libre", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: `${RAICES.lectura[0]}/libro.xlsx` } })).decision).toBe("permitir");
    expect(evaluarLlamada(llamada({ app: "deckcraft", herramienta: "render_slide" })).decision).toBe("permitir");
  });
  it("una ruta a profundidad 6 sí se mira", () => {
    const hondo = { a: { b: { c: { d: { e: { path: "/hondo" } } } } } };
    expect(rutasEnParametros(hondo)).toEqual(["/hondo"]);
  });
  it("los motivos no repiten la ruta completa", () => {
    const v = evaluarLlamada(llamada({ herramienta: "open_file", parametros: { path: "/etc/passwd" } }));
    expect(v.motivo).not.toContain("/etc/passwd");
  });
});
