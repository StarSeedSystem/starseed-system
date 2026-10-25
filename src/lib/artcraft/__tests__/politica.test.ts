import { describe, expect, it } from "vitest";
import { evaluarLlamada, rutaDentro, rutasEnParametros } from "../politica";
import type { LlamadaArtcraft, RaicesTrabajo } from "../politica";
import { APPS_ARTCRAFT, HERRAMIENTAS, PREFIJOS_VETADOS } from "../politica-tablas";

const raices: RaicesTrabajo = { lectura: ["/datos/entrada"], escritura: ["/datos/salida"] };
const llamada = (extra: Partial<LlamadaArtcraft> = {}): LlamadaArtcraft => ({
  app: "figcraft", herramienta: "inspect_document", parametros: {}, origen: "agente", ambito: "personal", rol: "dueno", raices, ...extra,
});
const decidir = (extra: Partial<LlamadaArtcraft>) => evaluarLlamada(llamada(extra)).decision;

describe("tablas de §3.2", () => {
  it("las tres apps y sus listas están completas", () => {
    expect(APPS_ARTCRAFT).toEqual(["figcraft", "gridcraft", "deckcraft"]);
    for (const app of APPS_ARTCRAFT) expect(HERRAMIENTAS[app].libre.length + HERRAMIENTAS[app].trabajo.length).toBeGreaterThan(0);
    expect(PREFIJOS_VETADOS.figcraft).toContain("collab.");
    expect(PREFIJOS_VETADOS.deckcraft).toEqual([]);
  });
});

describe("comandos y prefijos vetados", () => {
  it("collab.share y collab.publish se deniegan", () => {
    expect(decidir({ herramienta: "run_command", parametros: { command: "collab.share" } })).toBe("denegar");
    expect(decidir({ herramienta: "run_command", parametros: { command: " collab.publish " } })).toBe("denegar");
  });
  it("plugin.import se deniega, también como nombre de herramienta", () => {
    expect(decidir({ herramienta: "run_command", parametros: { command: "plugin.import" } })).toBe("denegar");
    expect(decidir({ herramienta: "plugin.import" })).toBe("denegar");
  });
  it("automate.trustScripts y trusted: true se deniegan", () => {
    expect(decidir({ app: "gridcraft", herramienta: "automate.trustScripts" })).toBe("denegar");
    expect(decidir({ app: "gridcraft", herramienta: "execute_command", parametros: { trusted: true } })).toBe("denegar");
  });
  it("trusted anidado en batch y comandos vetados en batch", () => {
    expect(decidir({ herramienta: "batch", parametros: { commands: [{ command: "create_node", trusted: true }] } })).toBe("denegar");
    expect(decidir({ herramienta: "batch", parametros: { commands: [{ command: "widget.insert" }] } })).toBe("denegar");
  });
  it("trusted: false no bloquea", () => {
    expect(decidir({ herramienta: "batch", parametros: { commands: [{ command: "create_node", trusted: false }] } })).toBe("permitir");
  });
});

describe("herramientas de ventana y desconocidas", () => {
  it("call_app y select_tool de DeckCraft se deniegan", () => {
    expect(decidir({ app: "deckcraft", herramienta: "call_app" })).toBe("denegar");
    expect(decidir({ app: "deckcraft", herramienta: "select_tool" })).toBe("denegar");
  });
  it("pointer de una IA o agente se deniega", () => {
    expect(decidir({ herramienta: "pointer", origen: "ia" })).toBe("denegar");
    expect(decidir({ herramienta: "pointer", origen: "mano" })).toBe("denegar");
  });
  it("una herramienta fuera de las listas se deniega", () => {
    expect(decidir({ herramienta: "borrar_todo" })).toBe("denegar");
  });
});

describe("rutas", () => {
  it("una ruta dentro de salida se permite al escribir", () => {
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/salida/x.figcraft" } })).toBe("permitir");
  });
  it("export de FigCraft dentro de salida se permite", () => {
    expect(decidir({ herramienta: "export", parametros: { out: "/datos/salida/x.pdf" } })).toBe("permitir");
  });
  it("open_file y open_workbook leen dentro de entrada", () => {
    expect(decidir({ herramienta: "open_file", parametros: { path: "/datos/entrada/x.figcraft" } })).toBe("permitir");
    expect(decidir({ app: "gridcraft", herramienta: "open_workbook", parametros: { file: "/datos/entrada/x.xlsx" } })).toBe("permitir");
  });
  it("una ruta solo de lectura no vale para escribir", () => {
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/entrada/x.figcraft" } })).toBe("denegar");
  });
  it("GridCraft open_workbook con ruta fuera se deniega", () => {
    expect(decidir({ app: "gridcraft", herramienta: "open_workbook", parametros: { path: "/etc/passwd.xlsx" } })).toBe("denegar");
  });
  it("rutas hostiles: absoluta, .., ~, file: y UNC", () => {
    for (const path of ["/etc/passwd", "../x", "~/x", "file:///x", "\\\\servidor\\x", "entrada/x.xlsx"]) expect(decidir({ herramienta: "open_file", parametros: { path } })).toBe("denegar");
  });
  it("una ruta absoluta en una clave cualquiera también se revisa", () => {
    expect(decidir({ herramienta: "open_file", parametros: { destino: "/etc/passwd" } })).toBe("denegar");
  });
  it("rutasEnParametros recoge claves de ruta y cadenas con forma absoluta", () => {
    const p = { path: "/a", output_file: "/b", otro: "file:///c", anidado: { desde: "/d" }, n: 1 };
    expect(rutasEnParametros(p).sort()).toEqual(["/a", "/b", "/d", "file:///c"]);
  });
});

describe("rutaDentro", () => {
  it("acepta la raíz y su descendencia, no un prefijo parecido", () => {
    expect(rutaDentro("/datos/salida", raices.escritura)).toBe(true);
    expect(rutaDentro("/datos/salida/sub/x", raices.escritura)).toBe(true);
    expect(rutaDentro("/datos/salida/sub/y", raices)).toBe(true);
    expect(rutaDentro("/datos/salida2/x", raices.escritura)).toBe(false);
  });
  it("normaliza separadores y barras repetidas", () => {
    expect(rutaDentro("\\datos\\salida\\sub\\x", raices.escritura)).toBe(true);
    expect(rutaDentro("/datos//salida//x", raices.escritura)).toBe(true);
  });
  it("rechaza vacía, relativa, con byte nulo y con ..", () => {
    for (const ruta of ["", "x", "/datos/salida\0x", "/datos/salida/../x"]) {
      expect(rutaDentro(ruta, raices.escritura)).toBe(false);
    }
  });
});

describe("ámbito y origen", () => {
  it("personal permite escribir sin confirmar", () => {
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/salida/x" }, ambito: "personal" })).toBe("permitir");
  });
  it("grupo y pública piden confirmación", () => {
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/salida/x" }, ambito: "grupo" })).toBe("confirmar");
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/salida/x" }, ambito: "publica" })).toBe("confirmar");
  });
  it("sin rol no se escribe", () => {
    expect(decidir({ herramienta: "save_file", parametros: { path: "/datos/salida/x" }, rol: null })).toBe("denegar");
  });
  it("un veredicto denegado por ruta dice que escribe", () => {
    const v = evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: "/etc/passwd" } }));
    expect(v).toMatchObject({ decision: "denegar", escribe: true });
    expect(v.motivo).not.toContain("/etc/passwd");
  });
});
