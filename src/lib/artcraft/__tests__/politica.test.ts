/** Pruebas de la política ArtCraft (`politica.ts`), contrato §3.2/§3.3. Solo funciones puras. */
import { describe, expect, it } from "vitest";
import { evaluarLlamada, hayTrusted, rutasEnParametros, rutaDentro } from "../politica";
import type { LlamadaArtcraft } from "../politica";

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
    ["/datos/neurona/salida/", true], // raíz con barra final
    ["/datos\\neurona\\salida/c.png", true], // unifica separadores
    ["/datos/neurona/salida-otra/x.png", false], // prefijo hermano, no cuelga de la raíz
    ["/datos/neurona/entrada/../salida/x", false], // aunque acabe dentro, lleva «..»
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
  it("reconoce claves en español, rutas UNC, letra de unidad y no baja de 6 niveles", () => {
    expect(rutasEnParametros({ ruta: "/datos/neurona/salida/a", archivo: "\\\\servidor\\x", carpeta: "C:\\x" }))
      .toEqual(["/datos/neurona/salida/a", "\\\\servidor\\x", "C:\\x"]);
    expect(rutasEnParametros({ a: { b: { c: { d: { e: { f: { g: { path: "/x" } } } } } } } })).toEqual([]);
    expect(rutasEnParametros({ lista: ["texto", "/datos/neurona/entrada/x"] })).toEqual(["/datos/neurona/entrada/x"]);
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
  it("ámbito pública también pide confirmación; personal permite y marca escribe", () => {
    const pub = evaluarLlamada(llamada({ herramienta: "export", parametros: { out: "/datos/neurona/salida/d.svg" }, ambito: "publica", rol: "editor" }));
    expect(pub.decision).toBe("confirmar");
    const pers = evaluarLlamada(llamada({ herramienta: "export", parametros: { out: "/datos/neurona/salida/d.svg" } }));
    expect(pers).toMatchObject({ decision: "permitir", escribe: true });
    expect(evaluarLlamada(llamada({ herramienta: "get_node", parametros: { id: "rm" }, ambito: "publica", rol: "observador" })).escribe).toBe(false);
  });
  it("escribir en la raíz de LECTURA se niega aunque la ruta exista", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "new_workbook", parametros: { path: "/datos/neurona/entrada/n.xlsx" } })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ app: "deckcraft", herramienta: "export", parametros: { out: "/datos/neurona/salida/p.pdf" } })).decision).toBe("permitir");
  });
  it("`trusted: true` anidado y un rol nulo al escribir se deniegan", () => {
    expect(evaluarLlamada(llamada({ app: "gridcraft", herramienta: "execute_command", parametros: { opciones: { deep: { trusted: true } } } })).decision).toBe("denegar");
    expect(evaluarLlamada(llamada({ herramienta: "save_file", parametros: { path: "/datos/neurona/salida/x.figcraft" }, rol: null })).decision).toBe("denegar");
  });
});
