/**
 * Runtime de código del chat (Ola 4 · Adenda 156) — capa pura.
 * Verifica lo que decide si un programa del chat es ejecutable, cómo se lee su
 * configuración escrita en el propio bloque y que el documento aislado sale
 * bien formado (con el puente de consola y sin fugas hacia el OS).
 */

import { describe, expect, it } from "vitest";
import {
  buildSandboxDoc, detectRunnable, directivesFor, extensionFor, isRuntimeMessage,
  parseFenceDirectives, parseInlineDirectives,
} from "@/lib/aurora/code-runtime";

describe("detectRunnable", () => {
  it("clasifica por lenguaje del fence", () => {
    expect(detectRunnable("html", "<b>hola</b>").kind).toBe("pagina");
    expect(detectRunnable("javascript", "console.log(1)").kind).toBe("script");
    expect(detectRunnable("css", "b{color:red}").kind).toBe("estilo");
    expect(detectRunnable("glsl", "void main(){}").kind).toBe("shader");
    expect(detectRunnable("jsx", "const App=()=>null").kind).toBe("react");
    expect(detectRunnable("json", "{}").kind).toBe("inerte");
  });

  it("marca python y shell como NO ejecutables en el navegador, con explicación", () => {
    const py = detectRunnable("python", "print(1)");
    expect(py.kind).toBe("backend");
    expect(py.inBrowser).toBe(false);
    expect(py.note).toBeTruthy();
  });

  it("detecta por contenido cuando el fence no trae lenguaje", () => {
    expect(detectRunnable("", "<!doctype html><body>x</body>").kind).toBe("pagina");
    expect(detectRunnable("", "precision highp float;\nvoid main(){ gl_FragColor = vec4(1.0); }").kind).toBe("shader");
    expect(detectRunnable("", "solo texto suelto").kind).toBe("inerte");
  });
});

describe("directivas escritas en el propio código", () => {
  it("lee el info string del fence", () => {
    const d = parseFenceDirectives('html run autorun mode=split height=520 size=l title="Panel de sensores" tools=consola,guardar');
    expect(d.run).toBe(true);
    expect(d.autorun).toBe(true);
    expect(d.mode).toBe("dividido");
    expect(d.height).toBe(520);
    expect(d.size).toBe("l");
    expect(d.title).toBe("Panel de sensores");
    expect(d.tools).toEqual(["consola", "guardar"]);
  });

  it("acepta alias en español y limita la altura", () => {
    expect(parseFenceDirectives("js modo=consola tamaño=grande altura=99999").mode).toBe("consola");
    expect(parseFenceDirectives("js tamaño=grande").size).toBe("l");
    expect(parseFenceDirectives("js altura=99999").height).toBe(2000);
    expect(parseFenceDirectives("js altura=1").height).toBe(120);
  });

  it("lee la directiva de la primera línea y esta gana al fence", () => {
    expect(parseInlineDirectives("// @starseed run mode=consola\nconsole.log(1)").mode).toBe("consola");
    expect(parseInlineDirectives("# @starseed autorun\nprint(1)").autorun).toBe(true);
    const merged = directivesFor("js mode=vista", "// @starseed mode=dividido\nx");
    expect(merged.mode).toBe("dividido");
  });

  it("no revienta con entradas raras", () => {
    expect(parseFenceDirectives(undefined)).toEqual({});
    expect(parseFenceDirectives("   ")).toEqual({});
    expect(parseInlineDirectives("")).toEqual({});
    expect(parseFenceDirectives("js mode=noexiste size=xxl").mode).toBeUndefined();
  });
});

describe("documento aislado", () => {
  it("inyecta el puente de consola en una página con envoltorio propio", () => {
    const doc = buildSandboxDoc("pagina", "<!doctype html><html><body><p>hola</p></body></html>");
    expect(doc).toContain("__starseed_runtime");
    expect(doc.indexOf("__starseed_runtime")).toBeLessThan(doc.indexOf("</body>"));
  });

  it("envuelve fragmentos sueltos en un documento completo", () => {
    const doc = buildSandboxDoc("pagina", "<p>hola</p>");
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<p>hola</p>");
  });

  it("el shader trae el boilerplate WebGL2 y los uniformes", () => {
    const doc = buildSandboxDoc("shader", "void main(){ gl_FragColor = vec4(1.0); }");
    expect(doc).toContain("webgl2");
    expect(doc).toContain("u_time");
    expect(doc).toContain("u_resolution");
    // gl_FragColor se normaliza a fragColor (GLSL ES 3.0)
    expect(doc).toContain("fragColor");
  });

  it("React solo carga CDNs si están permitidos", () => {
    const conCdn = buildSandboxDoc("react", "const App=()=>null");
    const sinCdn = buildSandboxDoc("react", "const App=()=>null", { allowCdn: false });
    expect(conCdn).toContain("cdn.jsdelivr.net");
    expect(sinCdn).not.toContain("cdn.jsdelivr.net");
    expect(sinCdn).toContain("CDNs desactivados");
  });

  it("el script suelto va envuelto en try/catch para que el error llegue a la consola", () => {
    const doc = buildSandboxDoc("script", "boom()");
    expect(doc).toContain("catch (e) { console.error(e); }");
  });
});

describe("utilidades", () => {
  it("reconoce solo los mensajes del sandbox", () => {
    expect(isRuntimeMessage({ __starseed_runtime: 1, type: "console" })).toBe(true);
    expect(isRuntimeMessage({ type: "console" })).toBe(false);
    expect(isRuntimeMessage(null)).toBe(false);
    expect(isRuntimeMessage("texto")).toBe(false);
  });

  it("sugiere la extensión correcta al descargar", () => {
    expect(extensionFor("pagina", "html")).toBe("html");
    expect(extensionFor("pagina", "svg")).toBe("svg");
    expect(extensionFor("shader", "glsl")).toBe("frag");
    expect(extensionFor("react", "tsx")).toBe("tsx");
    expect(extensionFor("backend", "python")).toBe("py");
    expect(extensionFor("backend", "bash")).toBe("sh");
  });
});
