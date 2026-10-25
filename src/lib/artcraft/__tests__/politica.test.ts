import { describe, expect, it } from "vitest";
import { evaluarLlamada, rutaDentro, rutasEnParametros, type LlamadaArtcraft, type RaicesTrabajo } from "../politica";

const raices: RaicesTrabajo = { lectura: ["/datos/art/entrada"], escritura: ["/datos/art/salida"] };
const base: Omit<LlamadaArtcraft, "app" | "herramienta"> = {
  parametros: {}, origen: "agente", ambito: "personal", rol: "editor", raices,
};
const llamada = (app: LlamadaArtcraft["app"], herramienta: string, extra: Partial<LlamadaArtcraft> = {}): LlamadaArtcraft =>
  ({ ...base, app, herramienta, ...extra });
const deci = (l: LlamadaArtcraft) => evaluarLlamada(l).decision;
const conRuta = (ruta: string): Partial<LlamadaArtcraft> => ({ parametros: { path: ruta } });

describe("evaluarLlamada · lista permitida", () => {
  it("permite una herramienta de lectura libre", () => {
    expect(deci(llamada("figcraft", "get_node"))).toBe("permitir");
  });
  it("deniega collab.share pedido por run_command", () => {
    expect(deci(llamada("figcraft", "run_command", { parametros: { command: "collab.share" } }))).toBe("denegar");
  });
  it("deniega collab.publish pedido por batch", () => {
    expect(deci(llamada("figcraft", "batch", { parametros: { commands: [{ command: "collab.publish" }] } }))).toBe("denegar");
  });
  it("deniega plugin.import", () => {
    expect(deci(llamada("figcraft", "run_command", { parametros: { command: "plugin.import" } }))).toBe("denegar");
  });
  it("deniega una herramienta bajo prefijo vetado", () => {
    expect(deci(llamada("gridcraft", "automate.trustScripts"))).toBe("denegar");
  });
  it("deniega automate.runScript", () => {
    expect(deci(llamada("gridcraft", "automate.runScript"))).toBe("denegar");
  });
  it("deniega trusted: true en cualquier parte", () => {
    expect(deci(llamada("gridcraft", "read_range", { parametros: { opciones: { trusted: true } } }))).toBe("denegar");
  });
  it("deniega call_app", () => {
    expect(deci(llamada("deckcraft", "call_app"))).toBe("denegar");
  });
  it("deniega select_tool desde un agente", () => {
    expect(deci(llamada("deckcraft", "select_tool"))).toBe("denegar");
  });
  it("deniega pointer desde una IA", () => {
    expect(deci(llamada("figcraft", "pointer", { origen: "ia" }))).toBe("denegar");
  });
  it("deniega una herramienta desconocida", () => {
    expect(deci(llamada("figcraft", "borrar_todo"))).toBe("denegar");
  });
  it("no repite la ruta completa en el motivo", () => {
    const v = evaluarLlamada(llamada("figcraft", "open_file", conRuta("/etc/passwd")));
    expect(v.decision).toBe("denegar");
    expect(v.motivo).not.toContain("/etc/passwd");
  });
});

describe("rutas y confinamiento", () => {
  it("deniega /etc/passwd", () => {
    expect(deci(llamada("figcraft", "open_file", conRuta("/etc/passwd")))).toBe("denegar");
  });
  it("deniega una ruta con ..", () => {
    expect(deci(llamada("figcraft", "open_file", conRuta("../x")))).toBe("denegar");
  });
  it("deniega una ruta con ~", () => {
    expect(deci(llamada("figcraft", "open_file", conRuta("~/x")))).toBe("denegar");
  });
  it("deniega file:///x", () => {
    expect(deci(llamada("figcraft", "open_file", conRuta("file:///x")))).toBe("denegar");
  });
  it("deniega una ruta UNC", () => {
    expect(deci(llamada("figcraft", "open_file", conRuta("\\\\servidor\\recurso\\x")))).toBe("denegar");
  });
  it("rechaza rutas relativas", () => {
    expect(rutaDentro("entrada/x.txt", raices.lectura)).toBe(false);
  });
  it("acepta la raíz exacta", () => {
    expect(rutaDentro("/datos/art/salida", raices.escritura)).toBe(true);
  });
  it("acepta una ruta dentro de salida", () => {
    expect(rutaDentro("/datos/art/salida/x.png", raices.escritura)).toBe(true);
  });
  it("no confunde salida con salida2", () => {
    expect(rutaDentro("/datos/art/salida2/x", raices.escritura)).toBe(false);
  });
  it("una ruta solo de lectura no vale para escribir", () => {
    expect(deci(llamada("gridcraft", "set_cell", conRuta("/datos/art/entrada/x.xlsx")))).toBe("denegar");
  });
  it("GridCraft open_workbook con ruta fuera se deniega", () => {
    expect(deci(llamada("gridcraft", "open_workbook", conRuta("/tmp/x.xlsx")))).toBe("denegar");
  });
  it("permite open_workbook dentro de la lectura", () => {
    expect(deci(llamada("gridcraft", "open_workbook", conRuta("/datos/art/entrada/x.xlsx")))).toBe("permitir");
  });
});

describe("escritura, ámbito y parámetros", () => {
  it("permite export dentro de salida y marca que escribe", () => {
    const v = evaluarLlamada(llamada("figcraft", "export", conRuta("/datos/art/salida/x.svg")));
    expect(v.decision).toBe("permitir");
    expect(v.escribe).toBe(true);
  });
  it("permite save_file dentro de salida", () => expect(deci(llamada("figcraft", "save_file", conRuta("/datos/art/salida/x.fig")))).toBe("permitir"));
  it("permite escribir en ámbito personal", () => expect(deci(llamada("gridcraft", "write_range"))).toBe("permitir"));
  it("permite escribir en ámbito perfil", () => expect(deci(llamada("gridcraft", "write_range", { ambito: "perfil" }))).toBe("permitir"));
  it("pide confirmar en ámbito grupo", () => {
    expect(deci(llamada("deckcraft", "add_slide", { ambito: "grupo" }))).toBe("confirmar");
  });
  it("pide confirmar en ámbito publica", () => {
    expect(deci(llamada("figcraft", "create_node", { ambito: "publica" }))).toBe("confirmar");
  });
  it("recoge claves de ruta y cadenas con forma de ruta", () => {
    expect(rutasEnParametros({ archivo: "notas.txt", otro: "/abs/x" })).toEqual(["notas.txt", "/abs/x"]);
  });
  it("ignora texto que no parece ruta", () => {
    expect(rutasEnParametros({ titulo: "hola", n: 3 })).toEqual([]);
  });
  it("respeta la profundidad máxima", () => {
    const hondo = (n: number): Record<string, unknown> => (n === 0 ? { path: "/x" } : { n: hondo(n - 1) });
    expect(rutasEnParametros(hondo(5))).toEqual(["/x"]);
    expect(rutasEnParametros(hondo(7))).toEqual([]);
  });
});
