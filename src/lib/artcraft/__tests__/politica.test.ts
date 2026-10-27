import { describe, expect, it } from "vitest";
import { evaluarLlamada, rutaDentro, rutasEnParametros } from "../politica";
import type { LlamadaArtcraft, RaicesTrabajo } from "../politica";
import type { AppArtcraft } from "../politica-tablas";
const R: RaicesTrabajo = { lectura: ["/datos/ana/entrada"], escritura: ["/datos/ana/salida"] };
const L = (app: AppArtcraft, herramienta: string, parametros: Record<string, unknown> = {}, extra: Partial<LlamadaArtcraft> = {}): LlamadaArtcraft =>
  ({ app, herramienta, parametros, origen: "agente", ambito: "personal", rol: "editor", raices: R, ...extra });
const v = (app: AppArtcraft, herramienta: string, parametros: Record<string, unknown> = {}, extra: Partial<LlamadaArtcraft> = {}) =>
  evaluarLlamada(L(app, herramienta, parametros, extra));

describe("rutas", () => {
  it("rechaza vacías, relativas, con .., ~, file:, UNC o byte nulo", () => {
    for (const ruta of ["", "salida/x", "../x", "~/x", "file:///x", "\\\\srv\\x", "/x/\0y"]) {
      expect(rutaDentro(ruta, R.escritura)).toBe(false);
    }
  });
  it("normaliza separadores, dobles barras y la raíz exacta", () => {
    expect(rutaDentro("/datos/ana/salida//x.png", R.escritura)).toBe(true);
    expect(rutaDentro("\\datos\\ana\\salida\\x.png", R.escritura)).toBe(true);
    expect(rutaDentro("/datos/ana/salida", R.escritura)).toBe(true);
    expect(rutaDentro("/datos/ana/salida2/x", R.escritura)).toBe(false);
    expect(rutaDentro("/datos/ana/entrada/a.fig", R)).toBe(true);
    expect(rutaDentro("/otra/x", R)).toBe(false);
  });
  it("encuentra rutas por clave y por forma, sin confundir ids", () => {
    const p = {
      path: "relativa.txt", nested: { out: "/tmp/x" }, commands: [{ command: "create_node" }],
      otro: "collab.share", absoluta: "/etc/passwd", to: "slide2",
    };
    expect(rutasEnParametros(p)).toEqual(["relativa.txt", "/tmp/x", "/etc/passwd", "slide2"]);
  });
  it("se detiene a los seis niveles", () => {
    let p: Record<string, unknown> = { path: "/fondo" };
    for (let i = 0; i < 7; i++) p = { hijo: p };
    expect(rutasEnParametros(p)).toEqual([]);
  });
  it("trabaja con raíces y rutas de Windows", () => {
    expect(rutaDentro("C:\\datos\\salida\\a.png", ["C:\\datos\\salida"])).toBe(true);
    expect(rutaDentro("D:\\datos\\salida\\a.png", ["C:\\datos\\salida"])).toBe(false);
  });
});
describe("vetos y familias", () => {
  it("deniega collab.share y collab.publish", () => {
    for (const command of ["collab.share", "collab.publish"]) {
      expect(v("figcraft", "run_command", { command }).decision).toBe("denegar");
    }
  });
  it("deniega plugin.import y cualquier plugin.*", () => {
    expect(v("figcraft", "run_command", { command: "plugin.import" }).decision).toBe("denegar");
    expect(v("figcraft", "plugin.list").decision).toBe("denegar");
  });
  it("deniega automate.trustScripts y trusted: true en cualquier parte", () => {
    expect(v("gridcraft", "automate.trustScripts").decision).toBe("denegar");
    expect(v("gridcraft", "write_range", { trusted: true }).decision).toBe("denegar");
    expect(v("deckcraft", "batch", { commands: [{ command: "add_slide", trusted: true }] }).decision).toBe("denegar");
  });
  it("deniega call_app y las herramientas de ventana desde una IA", () => {
    expect(v("deckcraft", "call_app").decision).toBe("denegar");
    for (const h of ["pointer", "key", "type_text", "select"]) {
      expect(v("figcraft", h).decision).toBe("denegar");
    }
  });
  it("deniega una herramienta desconocida y una vetada incluso a la mano", () => {
    expect(v("figcraft", "borrar_todo").decision).toBe("denegar");
    expect(v("deckcraft", "select_tool", {}, { origen: "mano" }).decision).toBe("denegar");
  });
  it("mira cada comando de un lote", () => {
    const commands = [{ command: "create_node" }, { command: "widget.insert" }];
    expect(v("figcraft", "batch", { commands }).decision).toBe("denegar");
  });
  it("deniega los comandos automate en execute_command", () => {
    expect(v("gridcraft", "execute_command", { command: "automate.runScript" }).decision).toBe("denegar");
  });
});
describe("rutas peligrosas", () => {
  it("deniega rutas fuera del directorio en los parámetros", () => {
    for (const path of ["/etc/passwd", "../x", "~/x", "file:///x", "\\\\srv\\x"]) {
      expect(v("figcraft", "open_file", { path }).decision).toBe("denegar");
    }
  });
  it("deniega abrir o guardar fuera de las raíces", () => {
    expect(v("gridcraft", "open_workbook", { path: "/etc/passwd" }).decision).toBe("denegar");
    expect(v("figcraft", "save_file", { path: "/datos/ana/entrada/a.fig" }).decision).toBe("denegar");
  });
});
describe("lecturas", () => {
  it("permite las libres y la lectura dentro de entrada", () => {
    expect(v("figcraft", "inspect_document").decision).toBe("permitir");
    expect(v("figcraft", "screenshot").decision).toBe("permitir");
    expect(v("figcraft", "open_file", { path: "/datos/ana/entrada/a.fig" }).decision).toBe("permitir");
    expect(v("gridcraft", "open_workbook", { path: "/datos/ana/entrada/libro.xlsx" }).decision).toBe("permitir");
    expect(v("figcraft", "undo").decision).toBe("permitir");
  });
  it("marca escribe solo en las herramientas que tocan el disco", () => {
    expect(v("figcraft", "export", { out: "/datos/ana/salida/a.pdf" })).toMatchObject({ decision: "permitir", escribe: true });
    expect(v("gridcraft", "read_range").escribe).toBe(false);
    expect(v("figcraft", "open_file").escribe).toBe(false);
  });
});
describe("escritura y ámbito", () => {
  it("permite escribir en salida dentro del espacio personal", () => {
    expect(v("figcraft", "export", { out: "/datos/ana/salida/a.pdf" }).decision).toBe("permitir");
    expect(v("gridcraft", "write_range", { path: "/datos/ana/salida/libro.xlsx" }).decision).toBe("permitir");
    expect(v("deckcraft", "save_presentation", { path: "/datos/ana/salida/x.pptx" }).decision).toBe("permitir");
  });
  it("pide confirmación en grupo y en pública", () => {
    for (const ambito of ["grupo", "publica"] as const) {
      expect(v("figcraft", "export", { out: "/datos/ana/salida/a.pdf" }, { ambito }).decision).toBe("confirmar");
    }
  });
  it("deniega la escritura a quien no es miembro", () => {
    expect(v("figcraft", "export", { out: "/datos/ana/salida/a.pdf" }, { rol: null }).decision).toBe("denegar");
  });
  it("la raíz de lectura no vale para escribir", () => {
    expect(v("figcraft", "save_file", { path: "/datos/ana/entrada/a.fig" }).decision).toBe("denegar");
  });
  it("trusted: false no veta la llamada", () => {
    expect(v("gridcraft", "write_range", { trusted: false, path: "/datos/ana/salida/l.xlsx" }).decision).toBe("permitir");
  });
});
